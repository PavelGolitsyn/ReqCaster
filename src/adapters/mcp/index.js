// MCP payload role claims are ignored; identity comes from the trusted host mapping.
export function createMcpAdapter(dispatcher, options = {}) {
  const identityProvider = options.identity ?? options.identityProvider;
  return Object.freeze({
    async callTool(tool, request, credential) {
      const identity = identityProvider?.authenticate
        ? await identityProvider.authenticate(credential, { transport: "mcp" })
        : credential;
      return dispatcher.execute(tool, request, identity, { validateRequest: true });
    },
  });
}
