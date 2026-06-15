type Handler = (params: Record<string, string>) => void | Promise<void>;

interface Compiled {
  keys: string[];
  re: RegExp;
  handler: Handler;
}

const routes: Compiled[] = [];
let notFound: Handler = () => {};

export function route(pattern: string, handler: Handler): void {
  const keys: string[] = [];
  const re = new RegExp(
    "^" +
      pattern.replace(/:[^/]+/g, (m) => {
        keys.push(m.slice(1));
        return "([^/]+)";
      }) +
      "$",
  );
  routes.push({ keys, re, handler });
}

export function setNotFound(handler: Handler): void {
  notFound = handler;
}

function resolve(): void {
  const path = location.hash.replace(/^#/, "") || "/";
  for (const r of routes) {
    const m = path.match(r.re);
    if (m) {
      const params: Record<string, string> = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      void r.handler(params);
      return;
    }
  }
  void notFound({});
}

export function startRouter(): void {
  window.addEventListener("hashchange", resolve);
  resolve();
}

export function navigate(path: string): void {
  location.hash = path;
}
