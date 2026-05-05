import { useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useDashboardList } from "../hooks/useDashboard";
import { useTemplate } from "../themes/TemplateProvider";
import { fetchConfig } from "../api/client";
import { FloatingAgentChat } from "./FloatingAgentChat";

const isStaticMode = !!(window as any).__DAC_STATIC__;

export function DashboardList() {
  const { data: dashboards, isLoading, error } = useDashboardList();
  const { data: config } = useQuery({
    queryKey: ["config"],
    queryFn: fetchConfig,
    staleTime: Infinity,
  });
  const { DashboardListLayout } = useTemplate();
  const navigate = useNavigate();

  const handleDashboardCreated = useCallback((name: string) => {
    const KEY_PREFIX = "dac-agent-";
    try {
      const data = localStorage.getItem(KEY_PREFIX + "__create__");
      if (data) {
        localStorage.setItem(KEY_PREFIX + name, data);
        localStorage.removeItem(KEY_PREFIX + "__create__");
      }
    } catch { /* ignore */ }
    navigate(`/d/${encodeURIComponent(name)}`, { state: { agentOpen: true } });
  }, [navigate]);

  useEffect(() => {
    if (dashboards && dashboards.length === 1) {
      navigate(`/d/${encodeURIComponent(dashboards[0].name)}`, { replace: true });
    }
  }, [dashboards, navigate]);

  if (isLoading) {
    return (
      <div className="max-w-[860px] mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-8">
        <div className="skeleton h-7 w-40 mb-8" />
        <div className="skeleton h-8 w-full mb-4 rounded" />
        <div className="space-y-2">
          <div className="skeleton h-12 w-full" />
          <div className="skeleton h-12 w-full" />
          <div className="skeleton h-12 w-3/4" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-[860px] mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-8">
        <div className="text-[13px] font-mono text-[var(--dac-error)]">{error.message}</div>
      </div>
    );
  }

  if (dashboards && dashboards.length === 1) {
    return null;
  }

  if (isStaticMode) {
    return (
      <DashboardListLayout
        dashboards={dashboards ?? []}
        adminEnabled={config?.admin_enabled}
      />
    );
  }

  return (
    <div className="relative min-h-screen">
      <DashboardListLayout
        dashboards={dashboards ?? []}
        adminEnabled={config?.admin_enabled}
      />
      <FloatingAgentChat
        dashboardName="__create__"
        onDashboardCreated={handleDashboardCreated}
      />
    </div>
  );
}
