import type { Widget, WidgetData } from "../../types/dashboard";

interface Props {
  widget: Widget;
  data?: WidgetData;
}

export function TableWidget({ widget, data }: Props) {
  if (!data?.rows?.length) {
    return <div className="text-[var(--dac-text-muted)] text-xs py-4 text-center">No data</div>;
  }

  const columns = widget.columns?.length
    ? widget.columns.map((col) => ({
        name: col.name,
        label: col.label || col.name,
        format: col.format,
        idx: data.columns.findIndex((c) => c.name === col.name),
      }))
    : data.columns.map((col, idx) => ({
        name: col.name,
        label: col.name,
        format: undefined as string | undefined,
        idx,
      }));

  const isNumeric = (format?: string) =>
    format === "currency" || format === "number";

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px] min-w-[400px]">
        <thead>
          <tr className="bg-[var(--dac-surface)]">
            {columns.map((col) => (
              <th
                key={col.name}
                className={`text-left py-2 px-4 text-[10px] font-semibold uppercase tracking-wider text-[var(--dac-text-muted)] border-b border-[var(--dac-border)] whitespace-nowrap ${
                  isNumeric(col.format) ? "text-right" : ""
                }`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, i) => (
            <tr
              key={i}
              className="border-b border-[var(--dac-border)] border-opacity-40 last:border-0 hover:bg-[var(--dac-surface)] transition-colors duration-75"
            >
              {columns.map((col) => (
                <td
                  key={col.name}
                  className={`py-1.5 px-4 whitespace-nowrap ${
                    isNumeric(col.format) ? "text-right tabular-nums text-[12px]" : ""
                  }`}
                  style={isNumeric(col.format) ? { fontFamily: '"Aeonik", monospace' } : undefined}
                >
                  {formatCell(col.idx >= 0 ? row[col.idx] : null, col.format)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatCell(value: unknown, format?: string): string {
  if (value === null || value === undefined) return "—";
  if (format === "currency") {
    const num = Number(value);
    return isNaN(num) ? String(value) : `$${num.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  }
  if (format === "number") {
    const num = Number(value);
    return isNaN(num) ? String(value) : num.toLocaleString();
  }
  const s = String(value);
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})T/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }
  return s;
}
