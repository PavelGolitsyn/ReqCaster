// Stage 0 boundary: MCP role claims are ignored; identity comes from the trusted host mapping.
export function createMcpAdapter(dispatcher) {
  return Object.freeze({ callTool: (tool, request, trustedIdentity) => dispatcher.execute(tool, request, trustedIdentity) });
}
