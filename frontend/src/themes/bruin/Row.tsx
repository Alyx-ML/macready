import type { RowProps, WidgetContainerProps } from "../../types/template";

export function BruinRow({ children }: RowProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
      {children}
    </div>
  );
}

export function BruinWidgetContainer({ col, children }: WidgetContainerProps) {
  return (
    <div
      className="col-span-1"
      style={{ gridColumn: `span ${col}` }}
    >
      {children}
    </div>
  );
}
