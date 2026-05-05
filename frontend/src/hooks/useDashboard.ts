import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { listDashboards, getDashboard } from "../api/client";

export function useDashboardList() {
  return useQuery({
    queryKey: ["dashboards"],
    queryFn: listDashboards,
  });
}

export function useDashboard(name: string, draftId?: string) {
  return useQuery({
    queryKey: ["dashboard", name, draftId],
    queryFn: () => getDashboard(name, draftId),
    enabled: !!name,
    placeholderData: keepPreviousData,
  });
}
