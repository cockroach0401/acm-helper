from __future__ import annotations

import json

from ..models.problem import ProblemRecord, ProblemTranslationPayload
from ..models.settings import AIProvider, AISettings
from .ai_client import AIClient


class ProblemTranslator:
    def __init__(self, ai_client: AIClient):
        self.ai_client = ai_client

    async def translate_to_zh(self, problem: ProblemRecord, ai_settings: AISettings) -> ProblemTranslationPayload:
        if ai_settings.provider == AIProvider.mock:
            return self._mock_translate(problem)

        prompt = self._build_translation_prompt(problem)
        raw = await self.ai_client.generate_text(prompt, ai_settings)
        payload = self._extract_json_payload(raw)
        return ProblemTranslationPayload.model_validate(payload)

    def _build_translation_prompt(self, problem: ProblemRecord) -> str:
        return (
            "You are a professional competitive-programming translator. "
            "Translate the following Codeforces statement into Simplified Chinese.\n\n"
            "Return ONLY valid JSON with exactly these keys: "
            "title_zh, content_zh, input_format_zh, output_format_zh, constraints_zh.\n"
            "Do not add markdown fences or extra commentary.\n\n"
            f"title:\n{problem.title}\n\n"
            f"content:\n{problem.content}\n\n"
            f"input_format:\n{problem.input_format}\n\n"
            f"output_format:\n{problem.output_format}\n\n"
            f"constraints:\n{problem.constraints}\n"
        )

    def _extract_json_payload(self, text: str) -> dict:
        candidate = (text or "").strip()
        if not candidate:
            raise RuntimeError("empty translation response")

        try:
            loaded = json.loads(candidate)
            if isinstance(loaded, dict):
                return loaded
        except json.JSONDecodeError:
            pass

        start = candidate.find("{")
        end = candidate.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise RuntimeError("translation response is not valid JSON")

        snippet = candidate[start : end + 1]
        try:
            loaded = json.loads(snippet)
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"translation JSON parse failed: {exc}") from exc

        if not isinstance(loaded, dict):
            raise RuntimeError("translation response root must be JSON object")
        return loaded

    def _mock_translate(self, problem: ProblemRecord) -> ProblemTranslationPayload:
        def _prefix(v: str) -> str:
            text = (v or "").strip()
            if not text:
                return ""
            return f"【模拟翻译】{text}"

        return ProblemTranslationPayload(
            title_zh=_prefix(problem.title),
            content_zh=_prefix(problem.content),
            input_format_zh=_prefix(problem.input_format),
            output_format_zh=_prefix(problem.output_format),
            constraints_zh=_prefix(problem.constraints),
        )
