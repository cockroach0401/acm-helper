from __future__ import annotations

import json
import logging
from typing import Any

import httpx

from ..models.settings import AIProfile, AIProvider, AISettings

logger = logging.getLogger(__name__)

# 遇到这些异常时自动重试（上游断连、网络中断等）
_RETRYABLE_EXCEPTIONS = (
    httpx.RemoteProtocolError,
    httpx.ReadError,
    httpx.ConnectError,
    httpx.ConnectTimeout,
)


class AIClient:
    async def generate_solution(
        self, prompt: str, ai_settings: AISettings, images_base64: list[str] | None = None
    ) -> str:
        return await self._generate(prompt, ai_settings, images_base64)

    async def generate_report(self, prompt: str, ai_settings: AISettings) -> str:
        return await self._generate(prompt, ai_settings)

    async def generate_text(self, prompt: str, ai_settings: AISettings) -> str:
        return await self._generate(prompt, ai_settings)

    async def test_connection(self, ai_settings: AISettings) -> str:
        probe_prompt = "Reply with exactly: ok"
        result = await self._generate(probe_prompt, ai_settings)
        return result[:200]

    _MAX_RETRIES = 2  # 最多重试 2 次（共 3 次尝试）

    async def _generate(
        self, prompt: str, ai_settings: AISettings, images_base64: list[str] | None = None
    ) -> str:
        profile = ai_settings.resolve_active_profile()
        last_exc: Exception | None = None
        for attempt in range(1 + self._MAX_RETRIES):
            try:
                if profile.provider == AIProvider.openai_compatible:
                    return await self._generate_via_openai_compatible(
                        prompt, profile, images_base64
                    )
                if profile.provider == AIProvider.anthropic:
                    return await self._generate_via_anthropic(
                        prompt, profile, images_base64
                    )
                raise RuntimeError(f"Unsupported provider: {profile.provider}")
            except _RETRYABLE_EXCEPTIONS as exc:
                last_exc = exc
                if attempt < self._MAX_RETRIES:
                    logger.warning(
                        "AI request failed (attempt %d/%d): %s — retrying",
                        attempt + 1,
                        1 + self._MAX_RETRIES,
                        exc,
                    )
                    continue
        raise RuntimeError(
            f"AI request failed after {1 + self._MAX_RETRIES} attempts: {last_exc}"
        )

    async def _generate_via_openai_compatible(
        self, prompt: str, profile: AIProfile, images_base64: list[str] | None = None
    ) -> str:
        if not profile.api_base or not profile.api_key:
            raise RuntimeError("AI api_base/api_key is not configured")

        url = self._resolve_openai_compatible_url(profile.api_base)
        headers = {
            "Authorization": f"Bearer {profile.api_key}",
            "Content-Type": "application/json",
        }

        messages = [
            {"role": "system", "content": "You are an ACM solution assistant."},
        ]

        if not images_base64:
            messages.append({"role": "user", "content": prompt})
        else:
            content = [{"type": "text", "text": prompt}]
            for b64 in images_base64:
                content.append(
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{b64}"},
                    }
                )
            messages.append({"role": "user", "content": content})

        payload = {
            "model": profile.model,
            "messages": messages,
            "temperature": profile.temperature,
            "stream": True,
        }

        timeout = self._build_timeout(profile.timeout_seconds)
        async with httpx.AsyncClient(timeout=timeout) as client:
            async with client.stream("POST", url, headers=headers, json=payload) as resp:
                await self._raise_for_status_with_body(resp, "openai-compatible")
                content = await self._collect_openai_stream_text(resp)

        if not content:
            raise RuntimeError("Empty content returned from model provider")
        return content

    def _resolve_openai_compatible_url(self, api_base: str) -> str:
        base = api_base.strip().rstrip("/")
        if base.endswith("/v1/chat/completions"):
            return base
        if base.endswith("/chat/completions"):
            return base
        if base.endswith("/v1"):
            return base + "/chat/completions"
        return base + "/v1/chat/completions"

    async def _generate_via_anthropic(
        self, prompt: str, profile: AIProfile, images_base64: list[str] | None = None
    ) -> str:
        if not profile.api_base or not profile.api_key:
            raise RuntimeError("AI api_base/api_key is not configured")

        url = profile.api_base.rstrip("/") + "/v1/messages"
        headers = {
            "x-api-key": profile.api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        }

        if not images_base64:
            messages = [{"role": "user", "content": prompt}]
        else:
            content = [{"type": "text", "text": prompt}]
            for b64 in images_base64:
                content.append(
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/jpeg",
                            "data": b64,
                        },
                    }
                )
            messages = [{"role": "user", "content": content}]

        payload = {
            "model": profile.model,
            "max_tokens": 4096,
            "temperature": profile.temperature,
            "messages": messages,
            "stream": True,
        }

        timeout = self._build_timeout(profile.timeout_seconds)
        async with httpx.AsyncClient(timeout=timeout) as client:
            async with client.stream("POST", url, headers=headers, json=payload) as resp:
                await self._raise_for_status_with_body(resp, "anthropic")
                content = await self._collect_anthropic_stream_text(resp)

        if not content:
            raise RuntimeError("Empty content returned from anthropic provider")
        return content

    def _build_timeout(self, timeout_seconds: int) -> httpx.Timeout:
        # 对流式请求，read 超时应表示“多久没有收到任何新数据”而不是总耗时。
        # 因此将 read 直接设置为用户配置值（默认 600s），避免按总时长放大。
        base = float(max(1, timeout_seconds or 600))
        return httpx.Timeout(
            connect=min(30.0, max(5.0, base / 2.0)),
            read=base,
            write=min(60.0, max(10.0, base / 2.0)),
            pool=min(30.0, max(5.0, base / 3.0)),
        )

    async def _raise_for_status_with_body(self, resp: httpx.Response, provider_name: str) -> None:
        if resp.is_success:
            return
        body = (await resp.aread()).decode("utf-8", errors="replace").strip()
        detail = f" {body}" if body else ""
        raise RuntimeError(f"{provider_name} provider error [{resp.status_code}].{detail}")

    async def _collect_openai_stream_text(self, resp: httpx.Response) -> str:
        text_parts: list[str] = []
        async for _event_name, data in self._iter_sse_events(resp):
            should_stop = self._consume_openai_sse_data(data, text_parts)
            if should_stop:
                break
        return "".join(text_parts).strip()

    async def _collect_anthropic_stream_text(self, resp: httpx.Response) -> str:
        text_parts: list[str] = []
        async for event_name, data in self._iter_sse_events(resp):
            should_stop = self._consume_anthropic_sse_data(event_name, data, text_parts)
            if should_stop:
                break
        return "".join(text_parts).strip()

    async def _iter_sse_events(self, resp: httpx.Response):
        event_name = ""
        data_lines: list[str] = []

        async for raw_line in resp.aiter_lines():
            line = raw_line.strip("\ufeff")
            if not line:
                if data_lines:
                    yield event_name, "\n".join(data_lines)
                event_name = ""
                data_lines = []
                continue

            if line.startswith(":"):
                continue

            if line.startswith("event:"):
                event_name = line[6:].strip()
                continue

            if line.startswith("data:"):
                data_lines.append(line[5:].lstrip())

        if data_lines:
            yield event_name, "\n".join(data_lines)

    def _consume_openai_sse_data(self, data: str, text_parts: list[str]) -> bool:
        payload = data.strip()
        if not payload:
            return False
        if payload == "[DONE]":
            return True

        obj = self._load_json_payload(payload)
        if not obj:
            return False

        error_obj = obj.get("error")
        if isinstance(error_obj, dict):
            msg = str(error_obj.get("message") or "unknown error")
            raise RuntimeError(f"openai-compatible stream error: {msg}")

        choices = obj.get("choices")
        if not isinstance(choices, list):
            return False

        for choice in choices:
            if not isinstance(choice, dict):
                continue
            delta = choice.get("delta", {})
            if not isinstance(delta, dict):
                continue
            content = delta.get("content")
            if isinstance(content, str):
                text_parts.append(content)
                continue
            if isinstance(content, list):
                for part in content:
                    if isinstance(part, dict) and part.get("type") == "text":
                        text = part.get("text")
                        if isinstance(text, str):
                            text_parts.append(text)
        return False

    def _consume_anthropic_sse_data(self, event_name: str, data: str, text_parts: list[str]) -> bool:
        payload = data.strip()
        if not payload:
            return False
        if payload == "[DONE]":
            return True

        obj = self._load_json_payload(payload)
        if not obj:
            return False

        if isinstance(obj.get("error"), dict):
            msg = str(obj["error"].get("message") or "unknown error")
            raise RuntimeError(f"anthropic stream error: {msg}")

        resolved_event = event_name or str(obj.get("type") or "")
        if resolved_event == "message_stop":
            return True

        if resolved_event != "content_block_delta":
            return False

        delta = obj.get("delta")
        if not isinstance(delta, dict):
            return False

        if delta.get("type") != "text_delta":
            return False

        text = delta.get("text")
        if isinstance(text, str):
            text_parts.append(text)
        return False

    def _load_json_payload(self, payload: str) -> dict[str, Any] | None:
        try:
            value = json.loads(payload)
        except json.JSONDecodeError:
            return None
        if isinstance(value, dict):
            return value
        return None
