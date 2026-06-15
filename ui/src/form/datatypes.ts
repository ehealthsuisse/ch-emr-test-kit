// Built-in templates for FHIR complex datatypes. A profile's snapshot only
// expands a datatype's internal elements when the profile constrains them; when
// it doesn't, we fall back to these templates so the form still renders the
// datatype's fields with correct cardinality.

export interface TemplateField {
  name: string;
  type: string;
  min: number;
  max: string; // "1" | "*" | n
  binding?: { strength: "required" | "extensible" | "preferred" | "example"; valueSet: string };
}

const VS = "http://hl7.org/fhir/ValueSet";

export const PRIMITIVE_TYPES = new Set([
  "base64Binary",
  "boolean",
  "canonical",
  "code",
  "date",
  "dateTime",
  "decimal",
  "id",
  "instant",
  "integer",
  "integer64",
  "markdown",
  "oid",
  "positiveInt",
  "string",
  "time",
  "unsignedInt",
  "uri",
  "url",
  "uuid",
]);

export const DATATYPE_TEMPLATES: Record<string, TemplateField[]> = {
  HumanName: [
    { name: "use", type: "code", min: 0, max: "1", binding: { strength: "required", valueSet: `${VS}/name-use` } },
    { name: "text", type: "string", min: 0, max: "1" },
    { name: "family", type: "string", min: 0, max: "1" },
    { name: "given", type: "string", min: 0, max: "*" },
    { name: "prefix", type: "string", min: 0, max: "*" },
    { name: "suffix", type: "string", min: 0, max: "*" },
    { name: "period", type: "Period", min: 0, max: "1" },
  ],
  Identifier: [
    { name: "use", type: "code", min: 0, max: "1", binding: { strength: "required", valueSet: `${VS}/identifier-use` } },
    { name: "type", type: "CodeableConcept", min: 0, max: "1" },
    { name: "system", type: "uri", min: 0, max: "1" },
    { name: "value", type: "string", min: 0, max: "1" },
    { name: "period", type: "Period", min: 0, max: "1" },
    { name: "assigner", type: "Reference", min: 0, max: "1" },
  ],
  ContactPoint: [
    { name: "system", type: "code", min: 0, max: "1", binding: { strength: "required", valueSet: `${VS}/contact-point-system` } },
    { name: "value", type: "string", min: 0, max: "1" },
    { name: "use", type: "code", min: 0, max: "1", binding: { strength: "required", valueSet: `${VS}/contact-point-use` } },
    { name: "rank", type: "positiveInt", min: 0, max: "1" },
    { name: "period", type: "Period", min: 0, max: "1" },
  ],
  Coding: [
    { name: "system", type: "uri", min: 0, max: "1" },
    { name: "version", type: "string", min: 0, max: "1" },
    { name: "code", type: "code", min: 0, max: "1" },
    { name: "display", type: "string", min: 0, max: "1" },
    { name: "userSelected", type: "boolean", min: 0, max: "1" },
  ],
  CodeableConcept: [
    { name: "coding", type: "Coding", min: 0, max: "*" },
    { name: "text", type: "string", min: 0, max: "1" },
  ],
  Period: [
    { name: "start", type: "dateTime", min: 0, max: "1" },
    { name: "end", type: "dateTime", min: 0, max: "1" },
  ],
  Quantity: [
    { name: "value", type: "decimal", min: 0, max: "1" },
    { name: "comparator", type: "code", min: 0, max: "1", binding: { strength: "required", valueSet: `${VS}/quantity-comparator` } },
    { name: "unit", type: "string", min: 0, max: "1" },
    { name: "system", type: "uri", min: 0, max: "1" },
    { name: "code", type: "code", min: 0, max: "1" },
  ],
  Range: [
    { name: "low", type: "Quantity", min: 0, max: "1" },
    { name: "high", type: "Quantity", min: 0, max: "1" },
  ],
  Ratio: [
    { name: "numerator", type: "Quantity", min: 0, max: "1" },
    { name: "denominator", type: "Quantity", min: 0, max: "1" },
  ],
  Address: [
    { name: "use", type: "code", min: 0, max: "1", binding: { strength: "required", valueSet: `${VS}/address-use` } },
    { name: "type", type: "code", min: 0, max: "1", binding: { strength: "required", valueSet: `${VS}/address-type` } },
    { name: "text", type: "string", min: 0, max: "1" },
    { name: "line", type: "string", min: 0, max: "*" },
    { name: "city", type: "string", min: 0, max: "1" },
    { name: "district", type: "string", min: 0, max: "1" },
    { name: "state", type: "string", min: 0, max: "1" },
    { name: "postalCode", type: "string", min: 0, max: "1" },
    { name: "country", type: "string", min: 0, max: "1" },
    { name: "period", type: "Period", min: 0, max: "1" },
  ],
  Attachment: [
    { name: "contentType", type: "code", min: 0, max: "1" },
    { name: "language", type: "code", min: 0, max: "1" },
    { name: "data", type: "base64Binary", min: 0, max: "1" },
    { name: "url", type: "url", min: 0, max: "1" },
    { name: "title", type: "string", min: 0, max: "1" },
    { name: "creation", type: "dateTime", min: 0, max: "1" },
  ],
  Reference: [
    { name: "reference", type: "string", min: 0, max: "1" },
    { name: "type", type: "uri", min: 0, max: "1" },
    { name: "identifier", type: "Identifier", min: 0, max: "1" },
    { name: "display", type: "string", min: 0, max: "1" },
  ],
  Annotation: [
    { name: "time", type: "dateTime", min: 0, max: "1" },
    { name: "text", type: "markdown", min: 1, max: "1" },
  ],
  Money: [
    { name: "value", type: "decimal", min: 0, max: "1" },
    { name: "currency", type: "code", min: 0, max: "1", binding: { strength: "required", valueSet: `${VS}/currencies` } },
  ],
};

// Primitive validation regexes (subset of the FHIR-defined patterns).
export const PRIMITIVE_REGEX: Record<string, RegExp> = {
  date: /^\d{4}(-\d{2}(-\d{2})?)?$/,
  dateTime: /^\d{4}(-\d{2}(-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2}))?)?)?$/,
  instant: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/,
  time: /^\d{2}:\d{2}:\d{2}(\.\d+)?$/,
  code: /^[^\s]+(\s[^\s]+)*$/,
  oid: /^urn:oid:[0-2](\.(0|[1-9]\d*))+$/,
  id: /^[A-Za-z0-9\-.]{1,64}$/,
  uri: /^\S+$/,
  url: /^\S+$/,
  uuid: /^urn:uuid:[0-9a-fA-F-]{36}$/,
  decimal: /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/,
  integer: /^-?(0|[1-9]\d*)$/,
  integer64: /^-?(0|[1-9]\d*)$/,
  unsignedInt: /^(0|[1-9]\d*)$/,
  positiveInt: /^[1-9]\d*$/,
};

// HTML input type for a primitive. dateTime/instant/time use plain text so the
// user can enter a full FHIR value (with timezone) that the native pickers omit.
export function htmlInputType(code: string): string {
  switch (code) {
    case "date":
      return "date";
    case "integer":
    case "integer64":
    case "unsignedInt":
    case "positiveInt":
    case "decimal":
      return "number";
    default:
      return "text";
  }
}
