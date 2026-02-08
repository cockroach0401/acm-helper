from __future__ import annotations

import httpx

from ..models.settings import AIProfile, AIProvider, AISettings


class AIClient:
    async def generate_solution(self, prompt: str, ai_settings: AISettings) -> str:
        return await self._generate(prompt, ai_settings)

    async def generate_report(self, prompt: str, ai_settings: AISettings) -> str:
        return await self._generate(prompt, ai_settings)

    async def generate_text(self, prompt: str, ai_settings: AISettings) -> str:
        return await self._generate(prompt, ai_settings)

    async def test_connection(self, ai_settings: AISettings) -> str:
        probe_prompt = "Reply with exactly: ok"
        result = await self._generate(probe_prompt, ai_settings)
        return result[:200]

    async def _generate(self, prompt: str, ai_settings: AISettings) -> str:
        profile = ai_settings.resolve_active_profile()
        if profile.provider == AIProvider.openai_compatible:
            return await self._generate_via_openai_compatible(prompt, profile)
        if profile.provider == AIProvider.anthropic:
            return await self._generate_via_anthropic(prompt, profile)
        raise RuntimeError(f"Unsupported provider: {profile.provider}")

    async def _generate_via_openai_compatible(self, prompt: str, profile: AIProfile) -> str:
        if not profile.api_base or not profile.api_key:
            raise RuntimeError("AI api_base/api_key is not configured")

        url = self._resolve_openai_compatible_url(profile.api_base)
        headers = {
            "Authorization": f"Bearer {profile.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": profile.model,
            "messages": [
                {"role": "system", "content": "You are an ACM solution assistant."},
                {"role": "user", "content": prompt},
            ],
            "temperature": profile.temperature,
        }

        async with httpx.AsyncClient(timeout=profile.timeout_seconds) as client:
            resp = await client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()

        choices = data.get("choices", [])
        if not choices:
            raise RuntimeError("No choices returned from model provider")
        content = choices[0].get("message", {}).get("content", "")
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

    async def _generate_via_anthropic(self, prompt: str, profile: AIProfile) -> str:
        if not profile.api_base or not profile.api_key:
            raise RuntimeError("AI api_base/api_key is not configured")

        url = profile.api_base.rstrip("/") + "/v1/messages"
        headers = {
            "x-api-key": profile.api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        }
        payload = {
            "model": profile.model,
            "max_tokens": 4096,
            "temperature": profile.temperature,
            "messages": [{"role": "user", "content": prompt}],
        }

        async with httpx.AsyncClient(timeout=profile.timeout_seconds) as client:
            resp = await client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()

        content_blocks = data.get("content", [])
        text_parts: list[str] = []
        for block in content_blocks:
            if isinstance(block, dict) and block.get("type") == "text":
                text_parts.append(block.get("text", ""))

        content = "\n".join([part for part in text_parts if part]).strip()
        if not content:
            raise RuntimeError("Empty content returned from anthropic provider")
        return content
