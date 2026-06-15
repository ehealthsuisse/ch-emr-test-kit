// Same-origin base; nginx (prod) / vite (dev) proxy /fhir to the HAPI server.
const BASE = "/fhir";
export class FhirError extends Error {
    constructor(message, status, outcome) {
        super(message);
        this.status = status;
        this.outcome = outcome;
    }
}
async function request(path, init) {
    const res = await fetch(BASE + path, {
        ...init,
        headers: {
            Accept: "application/fhir+json",
            ...(init?.body ? { "Content-Type": "application/fhir+json" } : {}),
            ...(init?.headers || {}),
        },
    });
    const text = await res.text();
    const body = text ? JSON.parse(text) : undefined;
    if (!res.ok) {
        const outcome = body && body.resourceType === "OperationOutcome" ? body : undefined;
        throw new FhirError(`${res.status} ${res.statusText}`, res.status, outcome);
    }
    return body;
}
export const fhir = {
    capability: () => request("/metadata"),
    search: (type, params = {}) => {
        const qs = new URLSearchParams();
        for (const [k, v] of Object.entries(params))
            qs.set(k, String(v));
        const q = qs.toString();
        return request(`/${type}${q ? `?${q}` : ""}`);
    },
    read: (type, id) => request(`/${type}/${id}`),
    create: (type, resource) => request(`/${type}`, { method: "POST", body: JSON.stringify(resource) }),
    update: (type, id, resource) => request(`/${type}/${id}`, { method: "PUT", body: JSON.stringify(resource) }),
    remove: (type, id) => request(`/${type}/${id}`, { method: "DELETE" }),
    // Validate a resource against a profile; returns the OperationOutcome either
    // directly (200) or via a thrown FhirError (4xx).
    validate: async (type, resource, profile) => {
        try {
            return await request(`/${type}/$validate?profile=${encodeURIComponent(profile)}`, { method: "POST", body: JSON.stringify(resource) });
        }
        catch (e) {
            if (e instanceof FhirError && e.outcome)
                return e.outcome;
            throw e;
        }
    },
    structureDefinition: (idOrUrl) => {
        if (/^https?:/.test(idOrUrl)) {
            return fhir
                .search("StructureDefinition", { url: idOrUrl, _count: 1 })
                .then((b) => b.entry?.[0]?.resource);
        }
        return request(`/StructureDefinition/${idOrUrl}`);
    },
    // Ensure a StructureDefinition has a snapshot; generate one via $snapshot if not.
    snapshot: async (sd) => {
        if (sd.snapshot?.element?.length)
            return sd;
        return request(`/StructureDefinition/$snapshot`, {
            method: "POST",
            body: JSON.stringify(sd),
        });
    },
    expand: (valueSetUrl, count = 200) => request(`/ValueSet/$expand?url=${encodeURIComponent(valueSetUrl)}&count=${count}`).catch(() => undefined),
    // The ValueSet resource itself (for reading compose when $expand can't run).
    valueSetDefinition: (valueSetUrl) => fhir
        .search("ValueSet", { url: valueSetUrl, _count: 1 })
        .then((b) => b.entry?.[0]?.resource)
        .catch(() => undefined),
};
