"""Pluggable MCP tools: servers declared in mcp_servers.json become agent tools
at startup — adding a capability is config, not code.

File format (passed through to langchain-mcp-adapters MultiServerMCPClient):
{
  "servers": {
    "fetch": {"transport": "stdio", "command": "uvx", "args": ["mcp-server-fetch"]},
    "docs":  {"transport": "streamable_http", "url": "http://host:port/mcp"}
  }
}
"""

import json
import logging

from app.agent.tools import ToolExecutor
from app.config import get_settings

logger = logging.getLogger(__name__)

_mcp_tools: list[tuple[dict, str, ToolExecutor]] = []  # (schema, name, executor)


async def load_mcp_tools() -> None:
    """Called once from app lifespan; failures never block startup."""
    _mcp_tools.clear()
    settings = get_settings()
    path = settings.mcp_servers_file
    if not path.exists():
        return
    try:
        servers = json.loads(path.read_text()).get("servers", {})
    except (OSError, json.JSONDecodeError):
        logger.exception("Could not read %s", path)
        return
    if not servers:
        return

    try:
        from langchain_mcp_adapters.client import MultiServerMCPClient

        client = MultiServerMCPClient(servers)
        tools = await client.get_tools()
    except Exception:
        logger.exception("MCP tool loading failed; continuing without MCP tools")
        return

    for tool in tools:
        schema = {
            "type": "function",
            "function": {
                "name": tool.name,
                "description": tool.description or tool.name,
                "parameters": tool.args or {"type": "object", "properties": {}},
            },
        }

        def make_executor(t):
            async def execute(args: dict) -> str:
                result = await t.ainvoke(args)
                return result if isinstance(result, str) else json.dumps(result, default=str)

            return execute

        _mcp_tools.append((schema, tool.name, make_executor(tool)))
    logger.info("Loaded %d MCP tools from %d servers", len(_mcp_tools), len(servers))


def get_mcp_tools() -> list[tuple[dict, str, ToolExecutor]]:
    return _mcp_tools
