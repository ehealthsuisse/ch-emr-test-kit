function lastSegment(id) {
    const idx = id.lastIndexOf(".");
    return idx === -1 ? id : id.slice(idx + 1);
}
function parentId(id) {
    const idx = id.lastIndexOf(".");
    return idx === -1 ? undefined : id.slice(0, idx);
}
// Build a nested element tree from a StructureDefinition snapshot. The root node
// corresponds to the resource/type element (id with no "."); its children are
// the form's top-level fields.
export function buildTree(sd) {
    const elements = sd.snapshot?.element;
    if (!elements?.length)
        return undefined;
    const byId = new Map();
    let root;
    for (const ed of elements) {
        const seg = lastSegment(ed.id);
        const colon = seg.indexOf(":");
        const name = colon === -1 ? seg : seg.slice(0, colon);
        const sliceName = ed.sliceName || (colon === -1 ? undefined : seg.slice(colon + 1));
        const node = { ed, name, sliceName, children: [] };
        byId.set(ed.id, node);
        const pid = parentId(ed.id);
        if (pid === undefined) {
            root = node;
        }
        else {
            byId.get(pid)?.children.push(node);
        }
    }
    return root;
}
export function maxNum(max) {
    if (max === undefined || max === "*")
        return Infinity;
    const n = Number(max);
    return Number.isFinite(n) ? n : Infinity;
}
export function isArrayElement(node) {
    return maxNum(node.ed.max) > 1;
}
// Detect a fixed[x] or pattern[x] value on an element, returning the value and
// whether it is fixed (locked) vs pattern (prefilled but editable).
export function fixedOrPattern(ed) {
    for (const key of Object.keys(ed)) {
        if (key.startsWith("fixed"))
            return { value: ed[key], locked: true };
    }
    for (const key of Object.keys(ed)) {
        if (key.startsWith("pattern"))
            return { value: ed[key], locked: false };
    }
    return undefined;
}
