import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { DashboardTemplate, TemplateComponents } from "../types/template";
import { bruinTemplate } from "./bruin/index";

const TemplateContext = createContext<DashboardTemplate>(bruinTemplate);

/**
 * Access the active template's color tokens.
 */
export function useTokens(): Record<string, string> {
  return useContext(TemplateContext).tokens;
}

/**
 * Access the active template's component set.
 */
export function useTemplate(): TemplateComponents {
  return useContext(TemplateContext).components;
}

/**
 * Access the full template object.
 */
export function useTemplateRaw(): DashboardTemplate {
  return useContext(TemplateContext);
}

export function TemplateProvider({
  template,
  children,
}: {
  template: DashboardTemplate;
  children: ReactNode;
}) {
  const style = useMemo(() => {
    const vars: Record<string, string> = {
      fontFamily: '"Aeonik", system-ui, -apple-system, sans-serif',
    };
    for (const [key, value] of Object.entries(template.tokens)) {
      vars[`--dac-${key}`] = value;
    }
    return vars;
  }, [template]);

  return (
    <TemplateContext.Provider value={template}>
      <div
        style={style}
        className="dac-root min-h-screen bg-[var(--dac-background)] text-[var(--dac-text-primary)] antialiased"
      >
        {children}
      </div>
    </TemplateContext.Provider>
  );
}
