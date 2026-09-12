// Stage 0 boundary: map HTTP authentication and envelopes to ApplicationDispatcher only.
export function createHttpAdapter(dispatcher) {
  return Object.freeze({ dispatch: (tool, request, identity) => dispatcher.execute(tool, request, identity) });
}
