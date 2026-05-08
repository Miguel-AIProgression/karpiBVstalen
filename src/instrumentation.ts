export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const g = globalThis as typeof globalThis & { localStorage?: Storage };
    if (g.localStorage && typeof g.localStorage.getItem !== "function") {
      g.localStorage = {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
        key: () => null,
        length: 0,
      } as unknown as Storage;
    }
  }
}
