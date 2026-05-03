type GetRouteContext = () => Record<string, unknown>;

let currentProvider: GetRouteContext | null = null;
let currentRegistration = 0;

export function setRouteContextProvider(provider: GetRouteContext | null): void {
  currentRegistration += 1;
  currentProvider = provider;
}

export function registerRouteContextProvider(provider: GetRouteContext): () => void {
  const registration = ++currentRegistration;
  currentProvider = provider;

  return () => {
    if (currentRegistration === registration && currentProvider === provider) {
      currentRegistration += 1;
      currentProvider = null;
    }
  };
}

export function getRouteContextSnapshot(): Record<string, unknown> | null {
  return currentProvider ? currentProvider() : null;
}
