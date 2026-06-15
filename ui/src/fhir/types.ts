// Minimal, loose FHIR typings — only the bits the form engine reads.

export interface Coding {
  system?: string;
  code?: string;
  display?: string;
}

export interface ElementBinding {
  strength: "required" | "extensible" | "preferred" | "example";
  valueSet?: string;
}

export interface ElementType {
  code: string;
  profile?: string[];
  targetProfile?: string[];
}

export interface Discriminator {
  type: string;
  path: string;
}

export interface ElementSlicing {
  discriminator?: Discriminator[];
  rules?: string;
}

export interface ElementDefinition {
  id: string;
  path: string;
  sliceName?: string;
  slicing?: ElementSlicing;
  label?: string;
  short?: string;
  definition?: string;
  min?: number;
  max?: string; // number as string, or "*"
  base?: { path: string; min?: number; max?: string };
  type?: ElementType[];
  binding?: ElementBinding;
  contentReference?: string;
  // fixed[x], pattern[x], defaultValue[x], example are detected dynamically.
  [k: string]: unknown;
}

export interface StructureDefinition {
  resourceType: "StructureDefinition";
  id?: string;
  url: string;
  name?: string;
  title?: string;
  status?: string;
  kind?: string; // resource | complex-type | primitive-type
  type: string; // the FHIR type this profiles/defines
  baseDefinition?: string;
  derivation?: "specialization" | "constraint";
  abstract?: boolean;
  snapshot?: { element: ElementDefinition[] };
  differential?: { element: ElementDefinition[] };
}

export interface OperationOutcomeIssue {
  severity: "fatal" | "error" | "warning" | "information";
  code: string;
  diagnostics?: string;
  location?: string[];
  expression?: string[];
}

export interface OperationOutcome {
  resourceType: "OperationOutcome";
  issue: OperationOutcomeIssue[];
}

export interface BundleEntry<T = Record<string, unknown>> {
  fullUrl?: string;
  resource?: T;
}

export interface Bundle<T = Record<string, unknown>> {
  resourceType: "Bundle";
  type?: string;
  total?: number;
  entry?: BundleEntry<T>[];
}

export interface ValueSetExpansionContains {
  system?: string;
  code?: string;
  display?: string;
}

export interface ValueSetComposeInclude {
  system?: string;
  concept?: { code?: string; display?: string }[];
  filter?: { property?: string; op?: string; value?: string }[];
  valueSet?: string[];
}

export interface ValueSet {
  resourceType: "ValueSet";
  compose?: { include?: ValueSetComposeInclude[] };
  expansion?: { contains?: ValueSetExpansionContains[] };
}

export type FhirResource = Record<string, unknown> & { resourceType: string; id?: string };
