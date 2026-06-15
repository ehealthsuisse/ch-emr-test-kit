import { capitalize, clear, el } from "../dom";
import { fhir } from "../fhir/client";
import type { ElementDefinition, FhirResource, StructureDefinition, ValueSetExpansionContains } from "../fhir/types";
import {
  DATATYPE_TEMPLATES,
  htmlInputType,
  PRIMITIVE_REGEX,
  PRIMITIVE_TYPES,
  type TemplateField,
} from "./datatypes";
import { buildTree, fixedOrPattern, maxNum, type TreeNode } from "./tree";

export interface Issue {
  path: string;
  message: string;
}

interface Ctx {
  depth: number;
  path: string;
}

interface ValueCtl {
  el: HTMLElement;
  getValue(): unknown;
  setValue(v: unknown): void;
  validate(): Issue[];
}

interface ElementCtl {
  el: HTMLElement;
  writeInto(target: Record<string, unknown>): void;
  setFrom(source: Record<string, unknown>): void;
  validate(): Issue[];
}

const MAX_DEPTH = 8;
const SKIP_TOP = new Set(["id", "meta", "implicitRules", "language", "text", "contained"]);

// ---------------------------------------------------------------------------
// Primitive + leaf widgets
// ---------------------------------------------------------------------------

function coerce(code: string, raw: string): unknown {
  if (code === "boolean") return raw === "true";
  if (["integer", "unsignedInt", "positiveInt"].includes(code)) return parseInt(raw, 10);
  if (code === "decimal") return Number(raw);
  return raw; // string, code, dates, uri, integer64 (string), base64Binary, markdown
}

function primitiveWidget(code: string, ctx: Ctx, initial?: unknown): ValueCtl {
  let input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  if (code === "boolean") {
    input = el("select", { class: "input" }, [
      el("option", { value: "" }, ["—"]),
      el("option", { value: "true" }, ["true"]),
      el("option", { value: "false" }, ["false"]),
    ]);
  } else if (code === "markdown" || code === "base64Binary") {
    input = el("textarea", { class: "input" });
  } else {
    input = el("input", { type: htmlInputType(code), class: "input" });
    if (code === "decimal") input.setAttribute("step", "any");
  }
  const errEl = el("div", { class: "field-error" });
  const wrap = el("div", { class: "prim" }, [input, errEl]);

  function setVal(v: unknown): void {
    input.value = v === undefined || v === null ? "" : String(v);
  }
  if (initial !== undefined) setVal(initial);

  return {
    el: wrap,
    getValue() {
      const raw = input.value;
      if (raw === "") return undefined;
      return coerce(code, raw);
    },
    setValue: setVal,
    validate() {
      errEl.textContent = "";
      const raw = input.value;
      if (raw === "") return [];
      const re = PRIMITIVE_REGEX[code];
      if (re && !re.test(raw)) {
        errEl.textContent = `Invalid ${code}`;
        return [{ path: ctx.path, message: `Invalid ${code}: "${raw}"` }];
      }
      return [];
    },
  };
}

function lockedWidget(value: unknown): ValueCtl {
  const isObj = value !== null && typeof value === "object";
  const node: HTMLElement = isObj
    ? el("pre", { class: "locked" }, [JSON.stringify(value, null, 2)])
    : el("input", { class: "input", readonly: true, value: String(value) });
  return {
    el: node,
    getValue: () => (isObj ? structuredClone(value) : value),
    setValue: () => {},
    validate: () => [],
  };
}

function jsonWidget(initial?: unknown): ValueCtl {
  const ta = el("textarea", { class: "input json", placeholder: "FHIR JSON" });
  const errEl = el("div", { class: "field-error" });
  if (initial !== undefined) ta.value = JSON.stringify(initial, null, 2);
  return {
    el: el("div", {}, [ta, errEl]),
    getValue() {
      const s = ta.value.trim();
      if (!s) return undefined;
      try {
        return JSON.parse(s);
      } catch {
        return undefined;
      }
    },
    setValue: (v) => {
      ta.value = v === undefined ? "" : JSON.stringify(v, null, 2);
    },
    validate() {
      errEl.textContent = "";
      const s = ta.value.trim();
      if (!s) return [];
      try {
        JSON.parse(s);
        return [];
      } catch {
        errEl.textContent = "Invalid JSON";
        return [{ path: "", message: "Invalid JSON" }];
      }
    },
  };
}

// Manual entry for a bound code/Coding/CodeableConcept, used when the bound
// value set cannot be expanded (e.g. a SNOMED-based set the server can't expand).
// Falls back to the profile-constrained structure when present, else a template.
function manualConceptWidget(code: string, node: TreeNode, ctx: Ctx, initial?: unknown): ValueCtl {
  if (code === "code") return primitiveWidget("code", ctx, initial);
  const w = node.children.length ? objectWidget(node.children, ctx) : objectWidget(templateNodes(code, ctx.path), ctx);
  if (initial !== undefined) w.setValue(initial);
  return w;
}

// Value-set-bound widget for code / Coding / CodeableConcept with a required or
// extensible binding. Renders a dropdown from ValueSet/$expand; if the set can't
// be expanded (or is empty), falls back to manual entry so the field stays usable.
function boundWidget(code: string, valueSetUrl: string, node: TreeNode, ctx: Ctx, initial?: unknown): ValueCtl {
  const holder = el("div", { class: "bound" }, [el("div", { class: "loading" }, ["loading value set…"])]);
  let inner: ValueCtl | undefined;
  let current = initial;

  function useDropdown(contains: ValueSetExpansionContains[]): void {
    const sel = el("select", { class: "input bound" }, [el("option", { value: "" }, ["—"])]);
    for (const c of contains) {
      sel.append(el("option", { value: c.code || "" }, [`${c.display || c.code}${c.code ? ` (${c.code})` : ""}`]));
    }
    const pending = initialCode(code, current);
    if (pending) sel.value = pending;
    const build = (codeVal: string): unknown => {
      if (!codeVal) return undefined;
      const found = contains.find((c) => c.code === codeVal);
      if (code === "code") return codeVal;
      const coding = { system: found?.system, code: codeVal, display: found?.display };
      return code === "Coding" ? coding : { coding: [coding] };
    };
    inner = {
      el: sel,
      getValue: () => build(sel.value),
      setValue: (v) => {
        sel.value = initialCode(code, v) || "";
      },
      validate: () => [],
    };
    clear(holder);
    holder.append(sel);
  }

  function useManual(systemHint?: string): void {
    let initial = current;
    if (initial === undefined && systemHint) {
      // Seed the coding system so the user only needs to enter a code.
      if (code === "Coding") initial = { system: systemHint };
      else if (code === "CodeableConcept") initial = { coding: [{ system: systemHint }] };
    }
    inner = manualConceptWidget(code, node, ctx, initial);
    clear(holder);
    holder.append(inner.el);
  }

  // When the server can't expand the value set (e.g. a SNOMED-filter set with no
  // loaded code system), fall back to the ValueSet's own compose: offer any
  // explicitly-listed codes as a dropdown, else pre-fill the single coding system.
  async function fallbackFromCompose(): Promise<void> {
    const def = await fhir.valueSetDefinition(valueSetUrl);
    const includes = def?.compose?.include || [];
    const concepts: ValueSetExpansionContains[] = [];
    for (const inc of includes) {
      for (const c of inc.concept || []) concepts.push({ system: inc.system, code: c.code, display: c.display });
    }
    if (concepts.length) {
      useDropdown(concepts);
      return;
    }
    const systems = [...new Set(includes.map((i) => i.system).filter((s): s is string => !!s))];
    useManual(systems.length === 1 ? systems[0] : undefined);
  }

  fhir
    .expand(valueSetUrl)
    .then((vs) => {
      const contains = vs?.expansion?.contains || [];
      if (contains.length) useDropdown(contains);
      else void fallbackFromCompose();
    })
    .catch(() => void fallbackFromCompose());

  return {
    el: holder,
    getValue: () => inner?.getValue(),
    setValue: (v) => {
      current = v;
      inner?.setValue(v);
    },
    validate: () => inner?.validate() || [],
  };
}

function initialCode(code: string, v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (code === "code") return String(v);
  const o = v as Record<string, unknown>;
  if (code === "Coding") return o.code as string | undefined;
  const coding = (o.coding as Record<string, unknown>[] | undefined)?.[0];
  return coding?.code as string | undefined;
}

// ---------------------------------------------------------------------------
// Type dispatch
// ---------------------------------------------------------------------------

function templateNodes(code: string, parentPath: string): TreeNode[] {
  const t: TemplateField[] = DATATYPE_TEMPLATES[code] || [];
  return t.map((f) => ({
    name: f.name,
    children: [],
    ed: {
      id: `${parentPath}.${f.name}`,
      path: `${parentPath}.${f.name}`,
      min: f.min,
      max: f.max,
      type: [{ code: f.type }],
      binding: f.binding,
    } as ElementDefinition,
  }));
}

function objectWidget(children: TreeNode[], ctx: Ctx): ValueCtl {
  const obj = renderObject(children, { depth: ctx.depth + 1, path: ctx.path });
  return { el: obj.el, getValue: obj.getValue, setValue: obj.setValue, validate: obj.validate };
}

function renderValueForType(code: string, node: TreeNode, ctx: Ctx, initial?: unknown): ValueCtl {
  const binding = node.ed.binding;
  if (binding && (binding.strength === "required" || binding.strength === "extensible") && binding.valueSet) {
    if (code === "code" || code === "Coding" || code === "CodeableConcept") {
      return boundWidget(code, binding.valueSet, node, ctx, initial);
    }
  }
  if (PRIMITIVE_TYPES.has(code)) return primitiveWidget(code, ctx, initial);
  if (node.children.length) return objectWidget(node.children, ctx);
  if (DATATYPE_TEMPLATES[code]) return objectWidget(templateNodes(code, ctx.path), ctx);
  if (code === "Extension") return extensionWidget(node, ctx);
  return jsonWidget(initial);
}

function extensionWidget(node: TreeNode, ctx: Ctx): ValueCtl {
  const holder = el("div", { class: "extension" });
  let inner: ValueCtl | undefined;
  if (node.children.length) {
    inner = objectWidget(node.children, ctx);
    holder.append(inner.el);
  } else {
    const profile = node.ed.type?.[0]?.profile?.[0];
    if (profile && ctx.depth < MAX_DEPTH) {
      holder.append(el("div", { class: "loading" }, ["loading extension definition…"]));
      loadExtension(profile, ctx)
        .then((ctl) => {
          inner = ctl;
          clear(holder);
          holder.append(ctl.el);
        })
        .catch(() => {
          inner = jsonWidget();
          clear(holder);
          holder.append(inner.el);
        });
    } else {
      inner = jsonWidget();
      holder.append(inner.el);
    }
  }
  return {
    el: holder,
    getValue: () => inner?.getValue(),
    setValue: (v) => inner?.setValue(v),
    validate: () => inner?.validate() || [],
  };
}

async function loadExtension(profileUrl: string, ctx: Ctx): Promise<ValueCtl> {
  const sd = await fhir.structureDefinition(profileUrl);
  if (!sd) throw new Error("not found");
  const snap = await fhir.snapshot(sd);
  const tree = buildTree(snap);
  if (!tree) throw new Error("no snapshot");
  return objectWidget(tree.children, ctx);
}

function choiceWidget(node: TreeNode, ctx: Ctx): ValueCtl {
  const base = node.name.slice(0, -3); // strip "[x]"
  const types = node.ed.type || [];
  const sel = el("select", { class: "input choice-type" });
  for (const t of types) sel.append(el("option", { value: t.code }, [t.code]));
  const holder = el("div", { class: "choice-value" });
  let inner: ValueCtl;
  function build(code: string): void {
    inner = renderValueForType(code, node, { depth: ctx.depth, path: ctx.path });
    clear(holder);
    holder.append(inner.el);
  }
  sel.addEventListener("change", () => build(sel.value));
  build(types[0]?.code || "string");

  return {
    el: el("div", { class: "choice" }, [sel, holder]),
    getValue() {
      const v = inner.getValue();
      if (v === undefined) return undefined;
      return { propName: base + capitalize(sel.value), value: v };
    },
    setValue(pair) {
      const p = pair as { propName?: string; value?: unknown } | undefined;
      if (!p?.propName) return;
      const suffix = p.propName.slice(base.length);
      const match = types.find((t) => t.code.toLowerCase() === suffix.toLowerCase());
      if (match) sel.value = match.code;
      build(sel.value);
      inner.setValue(p.value);
    },
    validate: () => inner.validate(),
  };
}

// ---------------------------------------------------------------------------
// Occurrence list (cardinality)
// ---------------------------------------------------------------------------

interface OccList {
  el: HTMLElement;
  node: TreeNode;
  getValues(): unknown[];
  setValues(arr: unknown[]): void;
  validate(): Issue[];
}

function makeOccurrenceList(node: TreeNode, ctx: Ctx, isChoice: boolean): OccList {
  const min = node.ed.min ?? 0;
  const max = maxNum(node.ed.max);
  const label = node.sliceName || node.name;
  const path = `${ctx.path}.${node.name}${node.sliceName ? `:${node.sliceName}` : ""}`;
  const rows = el("div", { class: "occ-rows" });
  const addBtn = el("button", { type: "button", class: "add-btn" }, [`+ Add ${label}`]);
  const entries: { ctl: ValueCtl; row: HTMLElement; rm: HTMLElement }[] = [];

  // Optional occurrences (down to `min`) are removable; the Add button is shown
  // whenever another occurrence may be added. This gives a "+ Add" affordance for
  // optional single elements and slices (e.g. a 0..1 slice), not just repeating
  // ones, so they can be opted into rather than always shown empty.
  function sync(): void {
    addBtn.style.display = entries.length >= max ? "none" : "";
    for (const e of entries) e.rm.style.display = entries.length > min ? "" : "none";
  }

  function makeRow(): ValueCtl {
    const ctl = renderOccurrence(node, { depth: ctx.depth, path }, isChoice);
    const rm = el("button", { type: "button", class: "rm-btn", title: "Remove" }, ["×"]);
    const row = el("div", { class: "occ-row" }, [ctl.el, rm]);
    const entry = { ctl, row, rm };
    rm.addEventListener("click", () => {
      if (entries.length > min) {
        const i = entries.indexOf(entry);
        if (i >= 0) entries.splice(i, 1);
        row.remove();
        sync();
      }
    });
    entries.push(entry);
    rows.append(row);
    sync();
    return ctl;
  }

  addBtn.addEventListener("click", () => {
    if (entries.length < max) makeRow();
  });

  for (let i = 0; i < min && i < max; i++) makeRow();

  return {
    el: el("div", { class: "occ-list" }, [rows, addBtn]),
    node,
    getValues: () => entries.map((e) => e.ctl.getValue()).filter((v) => v !== undefined),
    setValues(arr) {
      entries.length = 0;
      clear(rows);
      const list = max === 1 ? arr.slice(0, 1) : arr;
      const target = Math.max(list.length, min);
      for (let i = 0; i < target && i < max; i++) {
        const ctl = makeRow();
        if (i < list.length) ctl.setValue(list[i]);
      }
    },
    validate() {
      const issues: Issue[] = [];
      const defined = entries.map((e) => e.ctl.getValue()).filter((v) => v !== undefined).length;
      if (defined < min) {
        issues.push({ path, message: `${path} requires at least ${min} value(s) (has ${defined})` });
      }
      for (const e of entries) issues.push(...e.ctl.validate());
      return issues;
    },
  };
}

function renderOccurrence(node: TreeNode, ctx: Ctx, isChoice: boolean): ValueCtl {
  if (ctx.depth > MAX_DEPTH) return jsonWidget();
  if (isChoice) return choiceWidget(node, ctx);
  const fp = fixedOrPattern(node.ed);
  if (fp?.locked) return lockedWidget(fp.value);
  const code = node.ed.type?.[0]?.code || "string";
  return renderValueForType(code, node, ctx, fp?.value);
}

// ---------------------------------------------------------------------------
// Element (groups sibling nodes that share a name, e.g. slices) + Object
// ---------------------------------------------------------------------------

function cardBadge(node: TreeNode): string {
  return `${node.ed.min ?? 0}..${node.ed.max ?? "1"}`;
}

function renderElement(name: string, nodes: TreeNode[], ctx: Ctx): ElementCtl {
  const isChoice = name.endsWith("[x]");
  const isArray = nodes.length > 1 || nodes.some((n) => maxNum(n.ed.max) > 1);
  const lists = nodes.map((n) => makeOccurrenceList(n, ctx, isChoice));
  const wrap = el("div", { class: "element" });

  // Each property is a collapsible <details>. Top-level properties (depth 0) are
  // collapsed by default; nested groups default to open so expanding a top-level
  // property reveals its sub-fields without further clicking.
  const openByDefault = ctx.depth > 0;
  for (let i = 0; i < lists.length; i++) {
    const node = nodes[i];
    const required = (node.ed.min ?? 0) >= 1;
    const summaryLabel = node.sliceName ? `${name} : ${node.sliceName}` : name;
    const summary = el("summary", { class: "el-summary" }, [
      el("span", { class: "el-name" }, [summaryLabel]),
      el("span", { class: "el-card" }, [cardBadge(node)]),
      ...(node.ed.short ? [el("span", { class: "el-short" }, [node.ed.short])] : []),
    ]);
    const group = el(
      "details",
      { class: `el-group${required ? " required" : ""}`, open: openByDefault },
      [summary, lists[i].el],
    );
    wrap.append(group);
  }

  return {
    el: wrap,
    writeInto(target) {
      if (isChoice) {
        for (const list of lists) {
          for (const v of list.getValues()) {
            const pair = v as { propName?: string; value?: unknown };
            if (pair?.propName !== undefined && pair.value !== undefined) target[pair.propName] = pair.value;
          }
        }
        return;
      }
      const values: unknown[] = [];
      for (const list of lists) values.push(...list.getValues());
      if (!values.length) return;
      target[name] = isArray ? values : values[0];
    },
    setFrom(source) {
      if (isChoice) {
        const base = name.slice(0, -3);
        const key = Object.keys(source).find((k) => k.startsWith(base) && k.length > base.length);
        if (key !== undefined) lists[0].setValues([{ propName: key, value: source[key] }]);
        return;
      }
      const existing = source[name];
      const arr = Array.isArray(existing) ? existing : existing !== undefined ? [existing] : [];
      const primary = lists.findIndex((l) => !l.node.sliceName);
      const idx = primary >= 0 ? primary : 0;
      lists.forEach((l, i) => l.setValues(i === idx ? arr : []));
    },
    validate: () => lists.flatMap((l) => l.validate()),
  };
}

interface ObjectCtl {
  el: HTMLElement;
  getValue(): Record<string, unknown> | undefined;
  setValue(v: unknown): void;
  validate(): Issue[];
}

function renderObject(children: TreeNode[], ctx: Ctx): ObjectCtl {
  const groups = new Map<string, TreeNode[]>();
  for (const c of children) {
    if (c.ed.max === "0") continue;
    if (ctx.depth === 0 && SKIP_TOP.has(c.name)) continue;
    if (!groups.has(c.name)) groups.set(c.name, []);
    groups.get(c.name)!.push(c);
  }
  const ctls: ElementCtl[] = [];
  const wrap = el("div", { class: "object" });
  for (const [name, nodes] of groups) {
    const ctl = renderElement(name, nodes, ctx);
    ctls.push(ctl);
    wrap.append(ctl.el);
  }
  return {
    el: wrap,
    getValue() {
      const o: Record<string, unknown> = {};
      for (const c of ctls) c.writeInto(o);
      return Object.keys(o).length ? o : undefined;
    },
    setValue(v) {
      const s = (v as Record<string, unknown>) || {};
      for (const c of ctls) c.setFrom(s);
    },
    validate: () => ctls.flatMap((c) => c.validate()),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ProfileForm {
  el: HTMLElement;
  getResource(): FhirResource;
  setResource(r: FhirResource): void;
  validate(): Issue[];
}

export function buildProfileForm(sd: StructureDefinition, profileUrl: string): ProfileForm {
  const tree = buildTree(sd);
  const resourceType = sd.type;
  const obj = renderObject(tree?.children || [], { depth: 0, path: resourceType });
  let currentId: string | undefined;
  let currentMeta: Record<string, unknown> | undefined;

  return {
    el: obj.el,
    getResource() {
      const body = obj.getValue() || {};
      const res: FhirResource = { resourceType, ...body } as FhirResource;
      res.meta = { ...(currentMeta || {}), profile: [profileUrl] };
      if (currentId) res.id = currentId;
      return res;
    },
    setResource(r) {
      currentId = r.id;
      currentMeta = r.meta as Record<string, unknown> | undefined;
      obj.setValue(r);
    },
    validate: () => obj.validate(),
  };
}
