import type {
  Bundle,
  FhirResource,
  OperationOutcome,
  StructureDefinition,
  ValueSet,
} from "./types";

// Same-origin base; nginx (prod) / vite (dev) proxy /fhir to the HAPI server.
const BASE = "/fhir";

export class FhirError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly outcome?: OperationOutcome,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
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
    const outcome =
      body && body.resourceType === "OperationOutcome" ? (body as OperationOutcome) : undefined;
    throw new FhirError(`${res.status} ${res.statusText}`, res.status, outcome);
  }
  return body as T;
}

export const fhir = {
  capability: () => request<Record<string, unknown>>("/metadata"),

  search: <T = FhirResource>(type: string, params: Record<string, string | number> = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) qs.set(k, String(v));
    const q = qs.toString();
    return request<Bundle<T>>(`/${type}${q ? `?${q}` : ""}`);
  },

  read: <T = FhirResource>(type: string, id: string) => request<T>(`/${type}/${id}`),

  create: <T = FhirResource>(type: string, resource: FhirResource) =>
    request<T>(`/${type}`, { method: "POST", body: JSON.stringify(resource) }),

  update: <T = FhirResource>(type: string, id: string, resource: FhirResource) =>
    request<T>(`/${type}/${id}`, { method: "PUT", body: JSON.stringify(resource) }),

  remove: (type: string, id: string) => request<unknown>(`/${type}/${id}`, { method: "DELETE" }),

  // Validate a resource against a profile; returns the OperationOutcome either
  // directly (200) or via a thrown FhirError (4xx).
  validate: async (type: string, resource: FhirResource, profile: string): Promise<OperationOutcome> => {
    try {
      return await request<OperationOutcome>(
        `/${type}/$validate?profile=${encodeURIComponent(profile)}`,
        { method: "POST", body: JSON.stringify(resource) },
      );
    } catch (e) {
      if (e instanceof FhirError && e.outcome) return e.outcome;
      throw e;
    }
  },

  structureDefinition: (idOrUrl: string) => {
    if (/^https?:/.test(idOrUrl)) {
      return fhir
        .search<StructureDefinition>("StructureDefinition", { url: idOrUrl, _count: 1 })
        .then((b) => b.entry?.[0]?.resource);
    }
    return request<StructureDefinition>(`/StructureDefinition/${idOrUrl}`);
  },

  // Ensure a StructureDefinition has a snapshot; generate one via $snapshot if not.
  snapshot: async (sd: StructureDefinition): Promise<StructureDefinition> => {
    if (sd.snapshot?.element?.length) return sd;
    return request<StructureDefinition>(`/StructureDefinition/$snapshot`, {
      method: "POST",
      body: JSON.stringify(sd),
    });
  },

  expand: (valueSetUrl: string, count = 200) =>
    request<ValueSet>(
      `/ValueSet/$expand?url=${encodeURIComponent(valueSetUrl)}&count=${count}`,
    ).catch(() => undefined),

  // The ValueSet resource itself (for reading compose when $expand can't run).
  valueSetDefinition: (valueSetUrl: string) =>
    fhir
      .search<ValueSet>("ValueSet", { url: valueSetUrl, _count: 1 })
      .then((b) => b.entry?.[0]?.resource)
      .catch(() => undefined),
};
