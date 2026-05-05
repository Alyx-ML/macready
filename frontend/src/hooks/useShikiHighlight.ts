import { useState, useEffect } from "react";
import { codeToHtml } from "shiki";

const THEME = "github-light";

export function useShikiHighlight(code: string | null, lang: string): string | null {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    if (!code) {
      setHtml(null);
      return;
    }
    let cancelled = false;
    codeToHtml(code, { lang, theme: THEME }).then((result) => {
      if (!cancelled) setHtml(result);
    });
    return () => { cancelled = true; };
  }, [code, lang]);

  return html;
}
