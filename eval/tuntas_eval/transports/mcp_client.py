"""MCP transport: the Langflow project's streamable HTTP MCP server.

``<base>/api/v1/mcp/project/<project_id>/streamable`` with header ``x-api-key``;
each tool takes one string argument ``input_value`` (verified on Langflow 1.12.1).
Uses the python ``mcp`` SDK (``initialize``, ``tools/list``, ``tools/call``).
"""

from __future__ import annotations

import asyncio
from contextlib import AsyncExitStack
from datetime import timedelta
from typing import Any

from . import TransportError


def project_mcp_url(base_url: str, project_id: str) -> str:
    return f"{base_url.rstrip('/')}/api/v1/mcp/project/{project_id}/streamable"


class McpTransport:
    name = "mcp"

    def __init__(self, url: str, api_key: str, timeout: float = 30.0):
        self.url = url
        self._api_key = api_key
        self.timeout = timeout
        self._stack: AsyncExitStack | None = None
        self._session: Any = None
        self.server_name: str | None = None

    async def __aenter__(self) -> "McpTransport":
        import httpx
        from mcp import ClientSession
        from mcp.client.streamable_http import create_mcp_http_client, streamable_http_client

        stack = AsyncExitStack()
        try:
            http = await stack.enter_async_context(create_mcp_http_client(
                headers={"x-api-key": self._api_key}, timeout=httpx.Timeout(self.timeout, read=self.timeout * 10)))
            read, write, _ = await stack.enter_async_context(streamable_http_client(self.url, http_client=http))
            session = await stack.enter_async_context(
                ClientSession(read, write, read_timeout_seconds=timedelta(seconds=self.timeout))
            )
            init = await asyncio.wait_for(session.initialize(), self.timeout)
        except BaseException as e:  # noqa: BLE001 - anyio wraps errors in groups
            try:
                await stack.aclose()
            except BaseException:  # noqa: BLE001
                pass
            if isinstance(e, (KeyboardInterrupt, SystemExit)):
                raise
            raise TransportError("unavailable", _describe(e)) from None
        self._stack = stack
        self._session = session
        self.server_name = getattr(getattr(init, "serverInfo", None), "name", None)
        return self

    async def __aexit__(self, *exc: Any) -> None:
        if self._stack is not None:
            stack, self._stack = self._stack, None
            try:
                await stack.aclose()
            except BaseException:  # noqa: BLE001 - closing a broken stream must not mask results
                pass

    async def list_tools(self) -> list[str]:
        try:
            res = await asyncio.wait_for(self._session.list_tools(), self.timeout)
        except Exception as e:  # noqa: BLE001
            raise TransportError("unavailable", _describe(e)) from None
        return [t.name for t in res.tools]

    async def call(self, tool: str, input_value: str) -> str:
        try:
            res = await asyncio.wait_for(self._session.call_tool(tool, {"input_value": input_value}), self.timeout)
        except asyncio.TimeoutError as e:
            raise TransportError("timeout", f"{tool}: no answer within {self.timeout} s") from e
        except Exception as e:  # noqa: BLE001
            raise TransportError("network", f"{tool}: {_describe(e)}") from None
        text = "".join(getattr(c, "text", "") for c in (res.content or []) if getattr(c, "type", "") == "text")
        if res.isError:
            raise TransportError("tool_error", f"{tool}: {text[:200]}")
        if not text:
            raise TransportError("shape", f"{tool}: empty tool result")
        return text


def _describe(e: BaseException) -> str:
    """Innermost message of an exception group (never includes headers or the key)."""
    while isinstance(e, BaseExceptionGroup) and e.exceptions:
        e = e.exceptions[0]
    return f"{type(e).__name__}: {str(e)[:200]}"
