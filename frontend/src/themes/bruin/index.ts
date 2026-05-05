import type { DashboardTemplate, TemplateComponents } from "../../types/template";
import { bruinLightTokens, bruinDarkTokens } from "./tokens";
import { BruinDashboardLayout } from "./DashboardLayout";
import { BruinDashboardListLayout } from "./DashboardListLayout";
import { BruinWidgetFrame } from "./WidgetFrame";
import { BruinFilterBar } from "./FilterBar";
import { BruinRow, BruinWidgetContainer } from "./Row";
import { MetricWidget } from "../../components/widgets/MetricWidget";
import { ChartWidget } from "../../components/widgets/ChartWidget";
import { TableWidget } from "../../components/widgets/TableWidget";
import { TextWidget } from "../../components/widgets/TextWidget";

const bruinComponents: TemplateComponents = {
  DashboardLayout: BruinDashboardLayout,
  DashboardListLayout: BruinDashboardListLayout,
  WidgetFrame: BruinWidgetFrame,
  FilterBar: BruinFilterBar,
  Row: BruinRow,
  WidgetContainer: BruinWidgetContainer,
  MetricWidget,
  ChartWidget,
  TableWidget,
  TextWidget,
};

export const bruinTemplate: DashboardTemplate = {
  name: "bruin",
  tokens: bruinLightTokens,
  components: bruinComponents,
};

export const bruinDarkTemplate: DashboardTemplate = {
  name: "bruin-dark",
  tokens: bruinDarkTokens,
  components: bruinComponents,
};
