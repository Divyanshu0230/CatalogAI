import json
import logging
import re
import time

import httpx
from django.conf import settings

logger = logging.getLogger("vitrine.ai")


class ModelError(Exception):
    pass


def extract_json(text: str) -> dict:
    cleaned = (text or "").strip()
    if not cleaned:
        raise ModelError("The model returned an empty reply.")
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?", "", cleaned, flags=re.IGNORECASE).strip()
        cleaned = re.sub(r"```$", "", cleaned).strip()
    try:
        value = json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start < 0 or end <= start:
            raise ModelError("The model did not return JSON.") from None
        try:
            value = json.loads(cleaned[start : end + 1])
        except json.JSONDecodeError as exc:
            raise ModelError("The model did not return JSON.") from exc
    if not isinstance(value, dict):
        raise ModelError("The model did not return a JSON object.")
    return value


def provider_chain() -> list[tuple[str, str]]:
    if settings.GROQ_API_KEY:
        return [("groq", settings.GROQ_API_KEY)]
    return []


def llm_ready() -> bool:
    return bool(provider_chain())


def status_payload() -> dict:
    chain = provider_chain()
    provider = chain[0][0] if chain else None
    return {
        "ready": bool(chain),
        "provider": provider,
        "fast_model": settings.GROQ_FAST_MODEL,
        "quality_model": settings.GROQ_QUALITY_MODEL,
        "modes": [name for name, _key in chain] + ["local"],
    }


def complete_json(*, system: str, user: str, task: str = "fast", timeout: float = 8.0) -> dict:
    chain = provider_chain()
    if not chain:
        raise ModelError("No language model is configured.")
    errors = []
    for name, key in chain:
        models = _models_for(name, task)
        for model in models:
            try:
                started = time.perf_counter()
                payload = _groq(key, model, system, user, timeout, task)
                payload["_provider"] = name
                payload["_model"] = model
                payload["_latency_ms"] = int((time.perf_counter() - started) * 1000)
                return payload
            except Exception as exc:
                message = f"{name}/{model}: {exc}"
                errors.append(message)
                logger.warning("Model call failed: %s", message)
    raise ModelError(errors[-1] if errors else "The model did not respond.")


def _models_for(provider: str, task: str) -> list[str]:
    if task == "quality":
        ordered = [settings.GROQ_QUALITY_MODEL, "qwen/qwen3.8-27b", settings.GROQ_FAST_MODEL]
    else:
        ordered = ["qwen/qwen3.8-27b", settings.GROQ_FAST_MODEL, settings.GROQ_QUALITY_MODEL]
    models = []
    for model in ordered:
        if model and model not in models:
            models.append(model)
    return models


def _groq(key: str, model: str, system: str, user: str, timeout: float, task: str) -> dict:
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    base = {
        "model": model,
        "temperature": 0,
        "max_tokens": 900,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    with_format = {**base, "response_format": {"type": "json_object"}}
    with httpx.Client(timeout=timeout) as client:
        response = client.post(url, headers=headers, json=with_format)
        if response.status_code == 400:
            response = client.post(url, headers=headers, json=base)
    if response.status_code >= 400:
        raise ModelError(_safe_error(response))
    message = response.json()["choices"][0]["message"]
    text = message.get("content") or message.get("reasoning") or message.get("reasoning_content") or ""
    return extract_json(text)


def _safe_error(response: httpx.Response) -> str:
    detail = response.text[:240].replace("\n", " ")
    return f"HTTP {response.status_code} {detail}"
