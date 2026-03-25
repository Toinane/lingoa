import { useState, useCallback } from "react";
import { useT } from "../../i18n";

interface Props {
  source: string;
  context?: string;
}

function IconCopy() {
  return (
    // Radix-style filled copy icon — two overlapping documents, no fill/bg hack needed
    <svg width="14" height="14" viewBox="0 0 15 15" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M1 9.5C1 10.33 1.67 11 2.5 11H4v-1H2.5A.5.5 0 0 1 2 9.5v-7A.5.5 0 0 1 2.5 2h7a.5.5 0 0 1 .5.5V4h-4.5C4.67 4 4 4.67 4 5.5v7C4 13.33 4.67 14 5.5 14h7c.83 0 1.5-.67 1.5-1.5v-7C14 4.67 13.33 4 12.5 4H11V2.5C11 1.67 10.33 1 9.5 1h-7C1.67 1 1 1.67 1 2.5v7ZM5 5.5A.5.5 0 0 1 5.5 5h7a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-.5.5h-7a.5.5 0 0 1-.5-.5v-7Z"
      />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 15 15" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M11.467 3.727a.75.75 0 0 1 .181 1.045l-4.25 6.5a.75.75 0 0 1-1.22.077L3.427 8.1a.75.75 0 1 1 1.146-.97l2.092 2.474 3.756-5.742a.75.75 0 0 1 1.046-.135Z"
      />
    </svg>
  );
}

export default function SourceSection({ source, context }: Props) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(source);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [source]);

  return (
    <div className="border-b border-app-border">
      <div className="px-6 pt-4 pb-2 flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-app-muted">
          {t.editor.sourceString}
        </p>
        <button
          onClick={handleCopy}
          title={copied ? t.editor.copied : t.editor.copySource}
          className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
            copied
              ? "text-key-green"
              : "text-app-muted hover:text-app-text hover:bg-app-surface-2"
          }`}
        >
          {copied ? <IconCheck /> : <IconCopy />}
        </button>
      </div>
      <div className="px-6 pb-4">
        <div className="max-h-40 overflow-y-auto">
          <p className="text-app-text text-base leading-relaxed whitespace-pre-wrap">
            {source}
          </p>

          {context && (
            <div className="mt-3">
              <p className="text-xs uppercase tracking-wider text-app-muted mb-1">
                {t.editor.context}
              </p>
              <p className="text-app-muted text-sm italic">{context}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
