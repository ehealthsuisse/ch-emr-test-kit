import { discoverIgs, findProfile } from "./discovery";
import { clear, el } from "./dom";
import { fhir, FhirError } from "./fhir/client";
import { buildProfileForm } from "./form/engine";
import { outcomeHasErrors, renderClientIssues, renderOutcome } from "./validation";
let groupsCache;
async function getGroups() {
    if (!groupsCache)
        groupsCache = await discoverIgs();
    return groupsCache;
}
export function clearGroupsCache() {
    groupsCache = undefined;
}
function app() {
    return document.getElementById("app");
}
function loading(msg = "Loading…") {
    return el("div", { class: "loading" }, [msg]);
}
function errorBox(e) {
    const msg = e instanceof Error ? e.message : String(e);
    return el("div", { class: "error-box" }, [`Error: ${msg}`]);
}
function nativeTesterUrl() {
    // The hapi.fhir.org-style tester is served by the FHIR server itself on :8080.
    return `${location.protocol}//${location.hostname}:8080/`;
}
// --- Home --------------------------------------------------------------------
export async function renderHome() {
    const root = app();
    clear(root);
    root.append(el("section", { class: "intro" }, [
        el("h1", {}, ["FHIR Test Kit"]),
        el("p", {}, [
            "Generic FHIR CRUD is available in the built-in tester (a clone of hapi.fhir.org). ",
            "Each installed Implementation Guide below has its own profile-restricted CRUD pages with form validation.",
        ]),
        el("p", {}, [
            el("a", { class: "btn", href: nativeTesterUrl(), target: "_blank", rel: "noopener" }, [
                "Open generic tester (server :8080) ↗",
            ]),
        ]),
    ]));
    const listWrap = el("section", {}, [el("h2", {}, ["Installed Implementation Guides"])]);
    root.append(listWrap);
    const spinner = loading("Discovering installed IGs…");
    listWrap.append(spinner);
    try {
        const groups = await getGroups();
        spinner.remove();
        if (!groups.length) {
            listWrap.append(el("p", { class: "muted" }, [
                "No constraint profiles found. Load an IG via the IG_URLS parameter and restart the server.",
            ]));
            return;
        }
        const grid = el("div", { class: "ig-grid" });
        for (const g of groups) {
            grid.append(el("a", { class: "ig-card", href: `#/ig/${encodeURIComponent(g.key)}` }, [
                el("h3", {}, [g.title]),
                el("div", { class: "muted" }, [
                    `${g.profiles.length} profile(s)${g.version ? ` · v${g.version}` : ""}`,
                ]),
                ...(g.packageId ? [el("div", { class: "url" }, [g.packageId])] : []),
            ]));
        }
        listWrap.append(grid);
    }
    catch (e) {
        spinner.remove();
        listWrap.append(errorBox(e));
    }
}
// --- IG subpage --------------------------------------------------------------
export async function renderIg(params) {
    const root = app();
    clear(root);
    const spinner = loading();
    root.append(spinner);
    try {
        const groups = await getGroups();
        const g = groups.find((x) => x.key === params.key);
        spinner.remove();
        if (!g) {
            root.append(errorBox("Implementation Guide not found"));
            return;
        }
        root.append(el("section", {}, [
            el("nav", { class: "crumbs" }, [el("a", { href: "#/" }, ["Home"]), document.createTextNode(" / "), el("span", {}, [g.title])]),
            el("h1", {}, [g.title]),
            el("div", { class: "muted" }, [g.packageId ? `${g.packageId}${g.version ? `@${g.version}` : ""}` : ""]),
        ]));
        const table = el("table", { class: "profile-table" }, [
            el("thead", {}, [el("tr", {}, [el("th", {}, ["Profile"]), el("th", {}, ["Resource type"]), el("th", {}, ["Canonical URL"])])]),
        ]);
        const tbody = el("tbody", {});
        for (const p of g.profiles) {
            const link = el("a", { href: `#/ig/${encodeURIComponent(g.key)}/profile/${encodeURIComponent(p.url)}` }, [p.name]);
            tbody.append(el("tr", {}, [el("td", {}, [link]), el("td", {}, [p.type]), el("td", { class: "url" }, [p.url])]));
        }
        table.append(tbody);
        root.append(table);
    }
    catch (e) {
        spinner.remove();
        root.append(errorBox(e));
    }
}
// --- Profile CRUD ------------------------------------------------------------
export async function renderCrud(params) {
    const root = app();
    clear(root);
    const spinner = loading("Loading profile…");
    root.append(spinner);
    let groups;
    try {
        groups = await getGroups();
    }
    catch (e) {
        spinner.remove();
        root.append(errorBox(e));
        return;
    }
    const profile = findProfile(groups, params.key, params.profile);
    if (!profile) {
        spinner.remove();
        root.append(errorBox("Profile not found"));
        return;
    }
    let form;
    try {
        const sd = await fhir.structureDefinition(profile.url);
        if (!sd)
            throw new Error("StructureDefinition not retrievable");
        const snap = await fhir.snapshot(sd);
        form = buildProfileForm(snap, profile.url);
    }
    catch (e) {
        spinner.remove();
        root.append(errorBox(e));
        return;
    }
    spinner.remove();
    const resourceType = profile.type;
    let editingId;
    const crumbs = el("nav", { class: "crumbs" }, [
        el("a", { href: "#/" }, ["Home"]),
        document.createTextNode(" / "),
        el("a", { href: `#/ig/${encodeURIComponent(params.key)}` }, [groups.find((x) => x.key === params.key)?.title || "IG"]),
        document.createTextNode(" / "),
        el("span", {}, [profile.name]),
    ]);
    const status = el("div", { class: "form-status" });
    const issuesArea = el("div", { class: "issues-area" });
    const formTitle = el("h2", {}, [`Create ${resourceType}`]);
    const validateBtn = el("button", { type: "button", class: "btn" }, ["Validate"]);
    const submitBtn = el("button", { type: "button", class: "btn primary" }, [`Create ${resourceType}`]);
    const resetBtn = el("button", { type: "button", class: "btn" }, ["Reset"]);
    function resetForm() {
        editingId = undefined;
        form.setResource({ resourceType });
        formTitle.textContent = `Create ${resourceType}`;
        submitBtn.textContent = `Create ${resourceType}`;
        clear(issuesArea);
        status.textContent = "";
    }
    validateBtn.addEventListener("click", async () => {
        clear(issuesArea);
        const clientIssues = form.validate();
        if (clientIssues.length)
            issuesArea.append(renderClientIssues(clientIssues));
        status.textContent = "Validating against profile…";
        try {
            const outcome = await fhir.validate(resourceType, form.getResource(), profile.url);
            issuesArea.append(renderOutcome(outcome));
            status.textContent = "";
        }
        catch (e) {
            status.textContent = "";
            issuesArea.append(errorBox(e));
        }
    });
    submitBtn.addEventListener("click", async () => {
        clear(issuesArea);
        const clientIssues = form.validate();
        if (clientIssues.length) {
            issuesArea.append(renderClientIssues(clientIssues));
            status.textContent = "Fix form errors before submitting.";
            return;
        }
        // Pre-flight server validation; block on errors.
        status.textContent = "Validating…";
        try {
            const outcome = await fhir.validate(resourceType, form.getResource(), profile.url);
            if (outcomeHasErrors(outcome)) {
                issuesArea.append(renderOutcome(outcome));
                status.textContent = "Profile validation failed — not saved.";
                return;
            }
        }
        catch (e) {
            issuesArea.append(errorBox(e));
            status.textContent = "";
            return;
        }
        status.textContent = editingId ? "Updating…" : "Creating…";
        try {
            const res = form.getResource();
            const saved = editingId
                ? await fhir.update(resourceType, editingId, res)
                : await fhir.create(resourceType, res);
            status.textContent = `Saved ${resourceType}/${saved.id}`;
            resetForm();
            await refreshList();
        }
        catch (e) {
            status.textContent = "";
            if (e instanceof FhirError && e.outcome)
                issuesArea.append(renderOutcome(e.outcome));
            else
                issuesArea.append(errorBox(e));
        }
    });
    resetBtn.addEventListener("click", resetForm);
    const formCard = el("section", { class: "card" }, [
        formTitle,
        form.el,
        el("div", { class: "form-actions" }, [submitBtn, validateBtn, resetBtn]),
        status,
        issuesArea,
    ]);
    // Existing resources list.
    const listCard = el("section", { class: "card" }, [el("h2", {}, [`Existing ${resourceType} resources for this profile`])]);
    const listBody = el("div", {});
    listCard.append(listBody);
    async function loadIntoForm(id) {
        try {
            const res = await fhir.read(resourceType, id);
            form.setResource(res);
            editingId = id;
            formTitle.textContent = `Edit ${resourceType}/${id}`;
            submitBtn.textContent = `Update ${resourceType}`;
            clear(issuesArea);
            status.textContent = `Loaded ${resourceType}/${id} for editing`;
            formCard.scrollIntoView({ behavior: "smooth" });
        }
        catch (e) {
            status.textContent = "";
            listBody.append(errorBox(e));
        }
    }
    async function refreshList() {
        clear(listBody);
        listBody.append(loading());
        try {
            const bundle = await fhir.search(resourceType, {
                _profile: profile.url,
                _count: 50,
                _sort: "-_lastUpdated",
            });
            clear(listBody);
            const entries = (bundle.entry || []).map((e) => e.resource).filter((r) => !!r);
            if (!entries.length) {
                listBody.append(el("p", { class: "muted" }, ["None yet."]));
                return;
            }
            const table = el("table", { class: "res-table" }, [
                el("thead", {}, [el("tr", {}, [el("th", {}, ["ID"]), el("th", {}, ["Last updated"]), el("th", {}, ["Actions"])])]),
            ]);
            const tbody = el("tbody", {});
            for (const r of entries) {
                const id = r.id;
                const lastUpdated = (r.meta || {}).lastUpdated;
                const editBtn = el("button", { type: "button", class: "btn small" }, ["Edit"]);
                editBtn.addEventListener("click", () => void loadIntoForm(id));
                const delBtn = el("button", { type: "button", class: "btn small danger" }, ["Delete"]);
                delBtn.addEventListener("click", async () => {
                    if (!confirm(`Delete ${resourceType}/${id}?`))
                        return;
                    try {
                        await fhir.remove(resourceType, id);
                        await refreshList();
                    }
                    catch (e) {
                        listBody.append(errorBox(e));
                    }
                });
                const jsonBtn = el("button", { type: "button", class: "btn small" }, ["JSON"]);
                const pre = el("pre", { class: "json-view", style: "display:none" }, [JSON.stringify(r, null, 2)]);
                jsonBtn.addEventListener("click", () => {
                    pre.style.display = pre.style.display === "none" ? "" : "none";
                });
                tbody.append(el("tr", {}, [
                    el("td", {}, [id]),
                    el("td", {}, [lastUpdated || ""]),
                    el("td", {}, [editBtn, delBtn, jsonBtn]),
                ]), el("tr", {}, [el("td", { colspan: 3 }, [pre])]));
            }
            table.append(tbody);
            listBody.append(table);
        }
        catch (e) {
            clear(listBody);
            listBody.append(errorBox(e));
        }
    }
    root.append(el("section", {}, [
        crumbs,
        el("h1", {}, [profile.name]),
        el("div", { class: "muted profile-meta" }, [`${resourceType} · ${profile.url}`]),
    ]), formCard, listCard);
    resetForm();
    await refreshList();
}
