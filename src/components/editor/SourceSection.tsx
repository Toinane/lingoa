import { useState } from "react";
import { useT } from "../../i18n";

interface Props {
  source: string;
  context?: string;
}

export default function SourceSection({ source, context }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const t = useT();

  return (
    <div className="border-b border-app-border">
      <div className="flex items-center justify-between px-6 pt-4 pb-2">
        <p className="text-xs uppercase tracking-wider text-app-muted">{t.editor.sourceString}</p>
        <button
          onClick={() => setCollapsed((v) => !v)}
          title={collapsed ? "Expand" : "Collapse"}
          className="text-app-muted hover:text-app-text transition-colors"
        >
          <svg
            className={`w-3.5 h-3.5 transition-transform ${collapsed ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </button>
      </div>

      {!collapsed && (
        <div className="px-6 pb-4">
          <p className="text-app-text text-base leading-relaxed whitespace-pre-wrap">{source}</p>

          {context && (
            <div className="mt-3">
              <p className="text-xs uppercase tracking-wider text-app-muted mb-1">{t.editor.context}</p>
              <p className="text-app-muted text-sm italic">{context}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
