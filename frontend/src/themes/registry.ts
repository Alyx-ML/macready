import type { DashboardTemplate } from "../types/template";
import { bruinTemplate, bruinDarkTemplate } from "./bruin/index";

/** Built-in templates keyed by name. */
const builtInTemplates: Record<string, DashboardTemplate> = {
  bruin: bruinTemplate,
  "bruin-dark": bruinDarkTemplate,
};

/**
 * Resolve a template by name, optionally applying custom token overrides.
 *
 * - If the name matches a built-in template, returns it (with token overrides merged if provided).
 * - If the name is unknown, falls back to "bruin" components with custom tokens.
 */
export function resolveTemplate(
  name: string,
  tokenOverrides?: Record<string, string>,
): DashboardTemplate {
  const base = builtInTemplates[name] ?? bruinTemplate;

  if (!tokenOverrides) {
    return base;
  }

  return {
    name,
    tokens: { ...base.tokens, ...tokenOverrides },
    components: base.components,
  };
}
