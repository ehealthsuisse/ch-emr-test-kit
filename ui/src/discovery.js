import { fhir } from "./fhir/client";
// Derive the Implementation Guide canonical base from a conformance resource's
// canonical URL. FHIR canonicals look like "<base>/<ResourceType>/<id>", so the
// base (e.g. "http://fhir.ch/ig/ch-emr") identifies the IG even when no
// ImplementationGuide resource is installed to group by.
function igBase(u) {
    const marker = "/StructureDefinition/";
    const i = u.indexOf(marker);
    if (i > 0)
        return u.slice(0, i);
    // Fallback: drop the last two path segments (ResourceType + id).
    const parts = u.split("/");
    return parts.length > 2 ? parts.slice(0, -2).join("/") : u;
}
// A human-readable IG name from a canonical base: the id after "/ig/" when
// present (the HL7 convention, e.g. ".../ig/ch-emr" -> "ch-emr"), else the last
// path segment, else the host.
function igTitleFromBase(base) {
    const ig = base.match(/\/ig\/([^/]+)/);
    if (ig)
        return ig[1];
    try {
        const url = new URL(base);
        const segs = url.pathname.split("/").filter(Boolean);
        return segs[segs.length - 1] || url.host;
    }
    catch {
        return base;
    }
}
function profileFromSd(sd) {
    return {
        url: sd.url,
        id: sd.id,
        name: sd.title || sd.name || sd.url.split("/").pop() || sd.url,
        type: sd.type,
    };
}
// Build the list of installed IGs and the profiles that belong to each.
// Primary source: ImplementationGuide.definition.resource references. Fallback:
// group remaining constraint profiles by canonical-URL authority.
export async function discoverIgs() {
    const [igBundle, sdBundle] = await Promise.all([
        fhir.search("ImplementationGuide", { _count: 200 }).catch(() => undefined),
        fhir.search("StructureDefinition", {
            derivation: "constraint",
            _count: 200,
        }),
    ]);
    const profiles = (sdBundle.entry || [])
        .map((e) => e.resource)
        .filter((sd) => !!sd && !!sd.url);
    const byId = new Map();
    const byUrl = new Map();
    for (const sd of profiles) {
        if (sd.id)
            byId.set(sd.id, sd);
        byUrl.set(sd.url, sd);
    }
    const claimed = new Set();
    const groups = [];
    for (const e of igBundle?.entry || []) {
        const ig = e.resource;
        if (!ig)
            continue;
        const refs = ig.definition?.resource || [];
        const igProfiles = [];
        for (const r of refs) {
            const ref = r.reference?.reference; // e.g. "StructureDefinition/abc" or a canonical
            if (!ref)
                continue;
            let sd;
            if (ref.startsWith("StructureDefinition/"))
                sd = byId.get(ref.slice("StructureDefinition/".length));
            else if (/^https?:/.test(ref))
                sd = byUrl.get(ref);
            if (sd && !claimed.has(sd.url)) {
                claimed.add(sd.url);
                igProfiles.push(profileFromSd(sd));
            }
        }
        if (igProfiles.length) {
            const packageId = ig.packageId || ig.name;
            groups.push({
                key: encodeURIComponent(packageId || ig.url || ig.id || ig.title || "ig"),
                title: ig.title || ig.name || packageId || ig.url || "Implementation Guide",
                packageId,
                version: ig.version,
                profiles: igProfiles.sort((a, b) => a.name.localeCompare(b.name)),
            });
        }
    }
    // Fallback (the common case — HAPI does not persist ImplementationGuide
    // resources for installed packages): group remaining profiles by their IG
    // canonical base, so e.g. all http://fhir.ch/ig/ch-emr/... profiles form one
    // "ch-emr" group.
    const orphans = profiles.filter((sd) => !claimed.has(sd.url));
    const byBase = new Map();
    for (const sd of orphans) {
        const base = igBase(sd.url);
        if (!byBase.has(base))
            byBase.set(base, []);
        byBase.get(base).push(profileFromSd(sd));
    }
    for (const [base, profs] of byBase) {
        groups.push({
            key: encodeURIComponent(`base:${base}`),
            title: igTitleFromBase(base),
            packageId: base,
            fallback: true,
            profiles: profs.sort((a, b) => a.name.localeCompare(b.name)),
        });
    }
    return groups.sort((a, b) => Number(!!a.fallback) - Number(!!b.fallback) || a.title.localeCompare(b.title));
}
export function findProfile(groups, groupKey, profileUrl) {
    const g = groups.find((x) => x.key === groupKey);
    return g?.profiles.find((p) => p.url === profileUrl);
}
