import { el } from "./dom";
import type { OperationOutcome } from "./fhir/types";
import type { Issue } from "./form/engine";

export function renderClientIssues(issues: Issue[]): HTMLElement {
  const box = el("div", { class: "issues client" });
  box.append(el("h4", {}, [`Form validation (${issues.length})`]));
  const ul = el("ul", {});
  for (const i of issues) {
    ul.append(el("li", { class: "issue error" }, [`${i.path ? i.path + ": " : ""}${i.message}`]));
  }
  box.append(ul);
  return box;
}

export function renderOutcome(outcome: OperationOutcome): HTMLElement {
  const issues = outcome.issue || [];
  const errors = issues.filter((i) => i.severity === "error" || i.severity === "fatal").length;
  const box = el("div", { class: `issues server${errors ? " has-errors" : " ok"}` });
  box.append(
    el("h4", {}, [errors ? `Server validation: ${errors} error(s)` : "Server validation: passed"]),
  );
  const ul = el("ul", {});
  for (const i of issues) {
    const loc = (i.expression || i.location || []).join(", ");
    ul.append(
      el("li", { class: `issue ${i.severity}` }, [
        el("span", { class: "sev" }, [i.severity]),
        el("span", { class: "diag" }, [i.diagnostics || i.code]),
        ...(loc ? [el("span", { class: "loc" }, [loc])] : []),
      ]),
    );
  }
  if (issues.length) box.append(ul);
  return box;
}

export function outcomeHasErrors(outcome: OperationOutcome): boolean {
  return (outcome.issue || []).some((i) => i.severity === "error" || i.severity === "fatal");
}
