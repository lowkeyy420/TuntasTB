"""Transports to the Langflow flows: MCP (default) and the REST run endpoint."""

from __future__ import annotations


class TransportError(RuntimeError):
    """A call failed. ``kind`` is one of timeout, http_<n>, network, tool_error, shape, unavailable."""

    def __init__(self, kind: str, detail: str = ""):
        super().__init__(f"{kind}: {detail}" if detail else kind)
        self.kind = kind
        self.detail = detail


REQUIRED_TOOLS = ("checkin_triage", "ask_guideline")
