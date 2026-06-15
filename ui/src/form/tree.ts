import type { ElementDefinition, StructureDefinition } from "../fhir/types";

export interface TreeNode {
  ed: ElementDefinition;
  name: string; // FHIR property name (last id segment, slice stripped) e.g. "name", "value[x]"
  sliceName?: string;
  children: TreeNode[];
}

function lastSegment(id: string): string {
  const idx = id.lastIndexOf(".");
  return idx === -1 ? id : id.slice(idx + 1);
}

function parentId(id: string): string | undefined {
  const idx = id.lastIndexOf(".");
  return idx === -1 ? undefined : id.slice(0, idx);
}

// Build a nested element tree from a StructureDefinition snapshot. The root node
// corresponds to the resource/type element (id with no "."); its children are
// the form's top-level fields.
export function buildTree(sd: StructureDefinition): TreeNode | undefined {
  const elements = sd.snapshot?.element;
  if (!elements?.length) return undefined;

  const byId = new Map<string, TreeNode>();
  let root: TreeNode | undefined;

  for (const ed of elements) {
    const seg = lastSegment(ed.id);
    const colon = seg.indexOf(":");
    const name = colon === -1 ? seg : seg.slice(0, colon);
    const sliceName = ed.sliceName || (colon === -1 ? undefined : seg.slice(colon + 1));
    const node: TreeNode = { ed, name, sliceName, children: [] };
    byId.set(ed.id, node);
    const pid = parentId(ed.id);
    if (pid === undefined) {
      root = node;
    } else {
      byId.get(pid)?.children.push(node);
    }
  }

  return root;
}

export function maxNum(max: string | undefined): number {
  if (max === undefined || max === "*") return Infinity;
  const n = Number(max);
  return Number.isFinite(n) ? n : Infinity;
}

export function isArrayElement(node: TreeNode): boolean {
  return maxNum(node.ed.max) > 1;
}

// Detect a fixed[x] or pattern[x] value on an element, returning the value and
// whether it is fixed (locked) vs pattern (prefilled but editable).
export function fixedOrPattern(ed: ElementDefinition): { value: unknown; locked: boolean } | undefined {
  for (const key of Object.keys(ed)) {
    if (key.startsWith("fixed")) return { value: ed[key], locked: true };
  }
  for (const key of Object.keys(ed)) {
    if (key.startsWith("pattern")) return { value: ed[key], locked: false };
  }
  return undefined;
}
