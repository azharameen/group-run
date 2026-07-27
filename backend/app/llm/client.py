"""LLM client wrapper using langchain ChatOpenAI with .env configuration.

Provides a centralized LLM access point with structured prompt execution,
token tracking, and error handling.
"""

import ast
import json
import re
from typing import Any, Optional

# Adapter for modern LangChain ChatOpenAI
from langchain_openai import ChatOpenAI as _LCChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage


class _LLMAdapter:
    """Wraps LangChain ChatOpenAI to provide an .invoke(messages, **kwargs) API

    The rest of the codebase expects an object with an invoke(messages, **kwargs)
    method that returns an object with a .content attribute containing the
    model's text. This adapter converts the simple messages list into
    langchain message objects and calls the model. It attempts __call__ first
    and falls back to generate() if necessary.
    """

    def __init__(self, model=None, model_name=None, base_url=None, api_key=None, temperature=0.7, max_tokens=4096, timeout=120):
        # Map parameters to langchain_openai.ChatOpenAI constructor
        llm_kwargs = {
            "model": model or model_name or "gpt-4o",
            "temperature": temperature,
        }
        if api_key:
            llm_kwargs["api_key"] = api_key
        if base_url:
            llm_kwargs["base_url"] = base_url
        llm_kwargs["timeout"] = timeout or 120
        self._llm = _LCChatOpenAI(**llm_kwargs)
        self._max_tokens = max_tokens

    def invoke(self, messages, **kwargs):
        # Convert simple message dicts to LangChain message objects
        msg_objs = []
        for m in messages:
            role = m.get("role")
            content = m.get("content")
            if role == "system":
                msg_objs.append(SystemMessage(content=content))
            else:
                # treat user/assistant as human messages for prompting
                msg_objs.append(HumanMessage(content=content))

        # Compose per-call kwargs; include max_tokens if present
        call_kwargs = dict(kwargs)
        if self._max_tokens is not None:
            call_kwargs.setdefault("max_tokens", self._max_tokens)

        # Try the simple call interface first
        try:
            resp = self._llm(msg_objs, **call_kwargs)
            # Many LangChain responses have .content attribute
            text = getattr(resp, "content", None) or str(resp)
        except Exception:
            # Fallback to generate() if available
            try:
                gen = self._llm.generate([msg_objs], **call_kwargs)
                text = gen.generations[0][0].text
            except Exception as e:
                raise

        class _Resp:
            def __init__(self, text):
                self.content = text

        return _Resp(text)


# Expose a ChatOpenAI-compatible name used elsewhere
ChatOpenAI = _LLMAdapter

from ..config import settings

# Singleton LLM instance
_llm: Optional[ChatOpenAI] = None


def get_llm() -> ChatOpenAI:
    """Get or create the LLM client singleton."""
    global _llm
    if _llm is None:
        _llm = ChatOpenAI(
            model=settings.openai_model_name,
            base_url=settings.openai_api_base,
            api_key=settings.openai_api_key,
            temperature=0.7,
            max_tokens=4096,
            timeout=120,
        )
    return _llm


def call_llm(
    system_prompt: str,
    user_prompt: str,
    *,
    temperature: float = 0.7,
    max_tokens: int = 4096,
    response_format: Optional[str] = None,
) -> str:
    """Call the LLM with system + user prompt and return the text response.

    Args:
        system_prompt: System-level instruction for the LLM.
        user_prompt: The user/task prompt.
        temperature: Creativity (0.0 = deterministic, 1.0 = creative).
        max_tokens: Maximum output tokens.
        response_format: If "json", instructs model to return valid JSON.

    Returns:
        The LLM's text response, stripped.
    """
    llm = get_llm()
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    kwargs = {"temperature": temperature, "max_tokens": max_tokens}
    if response_format == "json":
        messages[0]["content"] += (
            "\n\nIMPORTANT: You MUST respond with ONLY valid JSON. "
            "No markdown, no code fences, no explanation. Just raw JSON."
        )

    response = llm.invoke(messages, **kwargs)
    content = response.content.strip()

    # Strip markdown code fences if present
    if content.startswith("```"):
        lines = content.split("\n")
        fence = lines[0]
        content = "\n".join(lines[1:-1]).strip()
        # If the fence specified a language, it may have been consumed
        if not content and len(lines) > 2:
            content = "\n".join(lines[1:]).strip()

    return content


def call_llm_json(
    system_prompt: str,
    user_prompt: str,
    *,
    temperature: float = 0.7,
    max_tokens: int = 4096,
) -> Any:
    """Call the LLM and parse the response as JSON.

    Args:
        system_prompt: System-level instruction for the LLM.
        user_prompt: The user/task prompt.
        temperature: Creativity.
        max_tokens: Maximum output tokens.

    Returns:
        Parsed JSON object (dict or list).
    """
    def _extract_json_fragment(text: str) -> str:
        text = text.strip()
        if not text:
            return text
        if text.startswith("```"):
            lines = text.splitlines()
            if len(lines) >= 3:
                text = "\n".join(lines[1:-1]).strip()
            else:
                text = text.strip("`").strip()

        start_positions = [pos for pos in (text.find("{"), text.find("[")) if pos != -1]
        if not start_positions:
            return text
        start = min(start_positions)
        end = max(text.rfind("}"), text.rfind("]"))
        if end > start:
            return text[start:end + 1].strip()
        return text[start:].strip()

    def _normalize_json_text(text: str) -> str:
        text = text.strip()
        text = re.sub(r"^\s*Here(?:'s| is)?(?: the)? JSON[:\s]*", "", text, flags=re.IGNORECASE)
        return _extract_json_fragment(text)

    attempts = [
        (system_prompt, user_prompt, temperature),
        (
            f"{system_prompt}\n\nIMPORTANT: Return only raw JSON. No prose, no markdown, no code fences.",
            f"{user_prompt}\n\nReturn only valid JSON.",
            min(temperature, 0.2),
        ),
    ]

    last_content = ""
    for sys_prompt, usr_prompt, temp in attempts:
        content = call_llm(
            system_prompt=sys_prompt,
            user_prompt=usr_prompt,
            temperature=temp,
            max_tokens=max_tokens,
            response_format="json",
        )
        last_content = content
        for candidate in (content, _normalize_json_text(content)):
            if not candidate:
                continue
            try:
                return json.loads(candidate)
            except json.JSONDecodeError:
                try:
                    return ast.literal_eval(candidate)
                except (ValueError, SyntaxError):
                    continue

    raise ValueError(f"LLM did not return valid JSON: {last_content[:500]}")
