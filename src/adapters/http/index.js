// Authentication happens before the request body reaches contract validation.
export function createHttpAdapter(dispatcher, options = {}) {
  const identityProvider = options.identity ?? options.identityProvider;
  return Object.freeze({
    async dispatch(tool, request, credential) {
      const identity = identityProvider?.authenticate
        ? await identityProvider.authenticate(credential, { transport: "http" })
        : credential;
      return dispatcher.execute(tool, request, identity, { validateRequest: true });
    },
    async health() {
      if (!options.health?.check) return { schemaVersion: "1.0.0", status: "unavailable" };
      return options.health.check();
    },
  });
}
