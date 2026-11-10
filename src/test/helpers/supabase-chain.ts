/**
 * Chainable Supabase query-builder mock: every method (select, eq, in, or, gte,
 * order, limit, insert, update, maybeSingle, …) returns the same builder, and
 * awaiting it resolves to `{ data, error, count }`.
 */
export function chain(result: { data?: any; error?: any; count?: number } = {}) {
  const settled = Promise.resolve({ data: null, error: null, ...result });
  const calls: { method: string; args: any[] }[] = [];
  const proxy: any = new Proxy(
    {},
    {
      get(_target, prop: string | symbol) {
        if (prop === "then") return settled.then.bind(settled);
        if (prop === "catch") return settled.catch.bind(settled);
        if (prop === "finally") return settled.finally.bind(settled);
        if (prop === "__calls") return calls;
        return (...args: any[]) => {
          calls.push({ method: String(prop), args });
          return proxy;
        };
      },
    }
  );
  return proxy;
}
