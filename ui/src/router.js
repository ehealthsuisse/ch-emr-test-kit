const routes = [];
let notFound = () => { };
export function route(pattern, handler) {
    const keys = [];
    const re = new RegExp("^" +
        pattern.replace(/:[^/]+/g, (m) => {
            keys.push(m.slice(1));
            return "([^/]+)";
        }) +
        "$");
    routes.push({ keys, re, handler });
}
export function setNotFound(handler) {
    notFound = handler;
}
function resolve() {
    const path = location.hash.replace(/^#/, "") || "/";
    for (const r of routes) {
        const m = path.match(r.re);
        if (m) {
            const params = {};
            r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
            void r.handler(params);
            return;
        }
    }
    void notFound({});
}
export function startRouter() {
    window.addEventListener("hashchange", resolve);
    resolve();
}
export function navigate(path) {
    location.hash = path;
}
