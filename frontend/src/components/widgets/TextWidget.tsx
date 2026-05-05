import Markdown from "react-markdown";
import type { Widget } from "../../types/dashboard";

interface Props {
  widget: Widget;
}

export function TextWidget({ widget }: Props) {
  if (!widget.content) {
    return null;
  }

  return (
    <div className="dac-prose">
      <Markdown>{widget.content}</Markdown>
    </div>
  );
}
