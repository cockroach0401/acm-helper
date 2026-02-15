from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.models.settings import AIProfile
from src.services.ai_client import AIClient


class AIClientStreamingTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = AIClient()

    def test_openai_stream_delta_content_string(self) -> None:
        text_parts: list[str] = []

        should_stop = self.client._consume_openai_sse_data(
            '{"choices":[{"delta":{"content":"Hello"}}]}', text_parts
        )

        self.assertFalse(should_stop)
        self.assertEqual("".join(text_parts), "Hello")

    def test_openai_stream_done(self) -> None:
        text_parts: list[str] = []

        should_stop = self.client._consume_openai_sse_data("[DONE]", text_parts)

        self.assertTrue(should_stop)
        self.assertEqual(text_parts, [])

    def test_openai_stream_delta_content_array(self) -> None:
        text_parts: list[str] = []

        should_stop = self.client._consume_openai_sse_data(
            '{"choices":[{"delta":{"content":[{"type":"text","text":"你好"}]}}]}',
            text_parts,
        )

        self.assertFalse(should_stop)
        self.assertEqual("".join(text_parts), "你好")

    def test_openai_stream_error_object_raises(self) -> None:
        with self.assertRaises(RuntimeError) as ctx:
            self.client._consume_openai_sse_data(
                '{"error":{"message":"context canceled"}}', []
            )

        self.assertIn("context canceled", str(ctx.exception))

    def test_anthropic_stream_text_delta(self) -> None:
        text_parts: list[str] = []

        should_stop = self.client._consume_anthropic_sse_data(
            "content_block_delta",
            '{"type":"content_block_delta","delta":{"type":"text_delta","text":"World"}}',
            text_parts,
        )

        self.assertFalse(should_stop)
        self.assertEqual("".join(text_parts), "World")

    def test_anthropic_stream_message_stop(self) -> None:
        text_parts: list[str] = []

        should_stop = self.client._consume_anthropic_sse_data(
            "message_stop", '{"type":"message_stop"}', text_parts
        )

        self.assertTrue(should_stop)
        self.assertEqual(text_parts, [])

    def test_anthropic_stream_error_raises(self) -> None:
        with self.assertRaises(RuntimeError) as ctx:
            self.client._consume_anthropic_sse_data(
                "error",
                '{"error":{"message":"bad request"}}',
                [],
            )

        self.assertIn("bad request", str(ctx.exception))

    def test_build_timeout_uses_longer_read_window(self) -> None:
        profile = AIProfile(timeout_seconds=120)

        timeout = self.client._build_timeout(profile.timeout_seconds)

        self.assertEqual(timeout.connect, 30.0)
        self.assertEqual(timeout.read, 360.0)
        self.assertEqual(timeout.write, 60.0)
        self.assertEqual(timeout.pool, 30.0)


if __name__ == "__main__":
    unittest.main()
