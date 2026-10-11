"""REST transport: ``POST /api/v1/run/<endpoint>`` (verified on Langflow 1.12.1)."""

from __future__ import annotations

from typing import Any

import httpx

from . import TransportError


def first_chat_text(resp: Any) -> str | None:
    """First non-empty chat message text in a run response (same walk as deploy_flows)."""
    for run in (resp or {}).get("outputs", []) or []:
        for out in run.get("outputs", []) or []:
            for key in ("results", "outputs"):
                block = out.get(key) or {}
                msg = block.get("message") if isinstance(block, dict) else None
                if isinstance(msg, dict):
                    text = msg.get("text") or (msg.get("message") if isinstance(msg.get("message"), str) else None)
                    if text:
                        return text
            for msg in out.get("messages", []) or []:
                if isinstance(msg, dict) and msg.get("message"):
                    return msg["message"]
    return None


class RestTransport:
    name = "rest"

    def __init__(self, base_url: str, api_key: str, timeout: float = 30.0,
                 transport: httpx.AsyncBaseTransport | None = None):
        self.base_url = base_url.rstrip("/")
        self._api_key = api_key
        self.timeout = timeout
        self._transport = transport
        self._client: httpx.AsyncClient | None = None

    async def __aenter__(self) -> "RestTransport":
        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            headers={"x-api-key": self._api_key, "accept": "application/json"},
            timeout=self.timeout,
            transport=self._transport,
        )
        return self

    async def __aexit__(self, *exc: Any) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def list_tools(self) -> list[str]:
        return []  # REST has no listing; endpoints are addressed by name

    async def call(self, tool: str, input_value: str) -> str:
        assert self._client is not None, "use 'async with'"
        body = {"input_value": input_value, "input_type": "chat", "output_type": "chat"}
        try:
            resp = await self._client.post(f"/api/v1/run/{tool}", json=body)
        except httpx.TimeoutException as e:
            raise TransportError("timeout", f"{tool}: no answer within {self.timeout} s") from e
        except httpx.HTTPError as e:
            raise TransportError("network", f"{tool}: {type(e).__name__}") from e
        if resp.status_code != 200:
            raise TransportError(f"http_{resp.status_code}", tool)
        try:
            data = resp.json()
        except ValueError as e:
            raise TransportError("shape", f"{tool}: response is not JSON") from e
        text = first_chat_text(data)
        if text is None:
            raise TransportError("shape", f"{tool}: no chat output in response")
        return text
