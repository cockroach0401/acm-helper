from __future__ import annotations

from collections.abc import Mapping


class PromptTemplateError(Exception):
    pass


def render_template(template: str, values: Mapping[str, str]) -> str:
    rendered = template
    for key, value in values.items():
        rendered = rendered.replace(f"{{{{{key}}}}}", value)

    required_tokens: set[str] = set()
    idx = 0
    while True:
        start = rendered.find("{{", idx)
        if start == -1:
            break
        end = rendered.find("}}", start + 2)
        if end == -1:
            break
        token = rendered[start + 2 : end].strip()
        if token:
            required_tokens.add(token)
        idx = end + 2

    if required_tokens:
        missing = ", ".join(sorted(required_tokens))
        raise PromptTemplateError(f"Unresolved template placeholders: {missing}")

    return rendered

