import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Listens for `draft_reload` SSE events and invalidates queries
 * that belong to the given draft session. Only active when
 * draftSessionId is set. Each DashboardView instance owns its
 * own listener — no global state needed.
 */
export function useDraftReload(draftSessionId: string | null) {
  const queryClient = useQueryClient();
  const sidRef = useRef(draftSessionId);
  sidRef.current = draftSessionId;

  useEffect(() => {
    if (!draftSessionId || (window as any).__DAC_STATIC__) return;

    const es = new EventSource("/api/v1/events");

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (
          data.type === "draft_reload" &&
          data.session &&
          sidRef.current?.startsWith(data.session)
        ) {
          queryClient.invalidateQueries();
        }
      } catch {
        // ignore
      }
    };

    return () => es.close();
  }, [draftSessionId, queryClient]);
}
