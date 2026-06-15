export function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (v === undefined || v === false)
            continue;
        if (k === "class")
            node.className = String(v);
        else if (k === "text")
            node.textContent = String(v);
        else if (v === true)
            node.setAttribute(k, "");
        else
            node.setAttribute(k, String(v));
    }
    for (const c of children)
        node.append(c);
    return node;
}
export function clear(node) {
    node.replaceChildren();
}
export function capitalize(s) {
    return s ? s[0].toUpperCase() + s.slice(1) : s;
}
