from __future__ import annotations

import json
import re
from typing import Any

from ..models.problem import ProblemRecord
from ..models.settings import AISettings
from .ai_client import AIClient


class TagGenerator:
    _TAG_ALIAS = {
        "dp": "动态规划",
        "dynamic programming": "动态规划",
        "greedy": "贪心",
        "graph": "图论",
        "graphs": "图论",
        "graph theory": "图论",
        "math": "数学",
        "mathematics": "数学",
        "binary search": "二分查找",
        "dfs": "深度优先搜索",
        "bfs": "广度优先搜索",
        "two pointers": "双指针",
        "sort": "排序",
        "sorting": "排序",
        "string": "字符串",
        "strings": "字符串",
        "number theory": "数论",
        "combinatorics": "组合数学",
        "geometry": "计算几何",
        "data structure": "数据结构",
        "data structures": "数据结构",
        "segment tree": "线段树",
        "bitmask": "位运算",
        "bitmasks": "位运算",
        "bitwise": "位运算",
        "implementation": "模拟",
        "constructive": "构造",
        "brute force": "暴力枚举",
    }

    def __init__(self, ai_client: AIClient):
        self.ai_client = ai_client

    def _trim_text(self, text: str, limit: int) -> str:
        value = str(text or "").strip()
        if len(value) <= limit:
            return value
        return value[:limit] + "\n...<truncated>"

    def build_prompt(self, problem: ProblemRecord, solution_markdown: str = "") -> str:
        payload = {
            "source": problem.source,
            "id": problem.id,
            "title": problem.title,
            "content": self._trim_text(problem.content, 4000),
            "input_format": self._trim_text(problem.input_format, 1200),
            "output_format": self._trim_text(problem.output_format, 1200),
            "constraints": self._trim_text(problem.constraints, 1200),
            "reflection": self._trim_text(problem.reflection, 1200),
            "my_ac_code": self._trim_text(problem.my_ac_code, 2000),
            "my_ac_language": problem.my_ac_language,
        }
        if solution_markdown.strip():
            payload["solution_markdown"] = self._trim_text(solution_markdown, 12000)

        payload_json = json.dumps(payload, ensure_ascii=False, indent=2)
        return (
            "你是一名 ACM/ICPC 竞赛教练。请根据题目信息生成算法标签与难度。\n"
            "输出必须是一个 JSON 对象，且只能包含这两个字段：\n"
            "{\n"
            '  "tags": ["中文标签1", "中文标签2"],\n'
            '  "difficulty": 1700\n'
            "}\n\n"
            "要求：\n"
            "1) tags 必须是中文算法标签；\n"
            "2) difficulty 必须使用 Codeforces 风格区间 800-3500；\n"
            "3) difficulty 必须是 100 的倍数；\n"
            "4) 禁止输出任何 JSON 之外的解释文本。\n\n"
            "可参考标签（可增减，但必须中文）：动态规划、贪心、图论、数学、二分查找、"
            "深度优先搜索、广度优先搜索、双指针、排序、字符串、数论、组合数学、"
            "计算几何、数据结构、线段树、位运算、模拟、构造、暴力枚举。\n\n"
            "题目信息如下：\n"
            f"```json\n{payload_json}\n```"
        )

    def _extract_json_object(self, raw: str) -> dict[str, Any]:
        text = str(raw or "").strip()
        if not text:
            raise ValueError("AI returned empty auto-tag content")

        if text.startswith("```"):
            lines = text.splitlines()
            lines = [line for line in lines if not line.strip().startswith("```")]
            text = "\n".join(lines).strip()

        try:
            parsed = json.loads(text)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            pass

        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise ValueError("AI auto-tag response does not contain a JSON object")

        snippet = text[start : end + 1]
        parsed = json.loads(snippet)
        if not isinstance(parsed, dict):
            raise ValueError("AI auto-tag response JSON must be an object")
        return parsed

    def _contains_cjk(self, text: str) -> bool:
        return any("\u4e00" <= ch <= "\u9fff" for ch in text)

    def _normalize_tag(self, raw_tag: Any) -> str | None:
        tag = str(raw_tag or "").strip()
        if not tag:
            return None

        tag = re.sub(r"\s+", " ", tag)
        if self._contains_cjk(tag):
            return tag

        normalized_key = tag.lower().replace("_", " ").replace("-", " ").strip()
        normalized_key = re.sub(r"\s+", " ", normalized_key)

        mapped = self._TAG_ALIAS.get(normalized_key)
        if mapped:
            return mapped
        return None

    def _normalize_tags(self, raw_tags: Any) -> list[str]:
        if not isinstance(raw_tags, list):
            raise ValueError("AI auto-tag response field 'tags' must be an array")

        tags: list[str] = []
        seen: set[str] = set()
        for item in raw_tags:
            tag = self._normalize_tag(item)
            if not tag or tag in seen:
                continue
            seen.add(tag)
            tags.append(tag)

        if not tags:
            raise ValueError("AI auto-tag response does not contain valid Chinese tags")
        return tags[:8]

    def _normalize_difficulty(self, raw_difficulty: Any) -> int:
        value: int | None = None

        if isinstance(raw_difficulty, bool):
            value = None
        elif isinstance(raw_difficulty, int):
            value = raw_difficulty
        elif isinstance(raw_difficulty, float):
            value = int(raw_difficulty)
        else:
            text = str(raw_difficulty or "").strip()
            digits = "".join(ch for ch in text if ch.isdigit())
            if digits:
                value = int(digits)

        if value is None:
            raise ValueError("AI auto-tag response missing valid difficulty")

        rounded = int(round(value / 100.0) * 100)
        rounded = max(800, min(3500, rounded))
        return rounded

    def parse_response(self, raw: str) -> tuple[list[str], int]:
        parsed = self._extract_json_object(raw)
        tags = self._normalize_tags(parsed.get("tags"))
        difficulty = self._normalize_difficulty(parsed.get("difficulty"))
        return tags, difficulty

    async def generate(self, problem: ProblemRecord, ai_settings: AISettings, solution_markdown: str = "") -> tuple[list[str], int]:
        prompt = self.build_prompt(problem, solution_markdown=solution_markdown)
        raw = await self.ai_client.generate_text(prompt, ai_settings)
        return self.parse_response(raw)
