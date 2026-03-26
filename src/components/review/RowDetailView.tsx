import React from "react";
import { useT } from "../../i18n";
import { IconChevron } from "../Icons";
import { AnnotationPanel } from "./AnnotationPanel";
import type { KeyRow } from "../../lib/tauri";
import type { Annotation } from "./AnnotationPanel";

interface Props {
  row: KeyRow;
  rows: KeyRow[];
  annotations: Map<string, Annotation>;
  onSave: (key: string, annotation: Annotation) => void;
  onRemove: (key: string) => void;
  onSelectRow: (row: KeyRow) => void;
  onBack: () => void;
  isNewTranslation: boolean;
}

// React.memo is safe: useT() subscribes to settingsStore directly,
// so language changes still trigger re-renders regardless of memo.
const RowDetailView = React.memo(function RowDetailView({
  row,
  rows,
  annotations,
  onSave,
  onRemove,
  onSelectRow,
  onBack,
  isNewTranslation,
}: Props) {
  const t = useT();
  const currentIndex = rows.findIndex((r) => r.key === row.key);
  const prevRow = currentIndex > 0 ? rows[currentIndex - 1] : null;
  const nextRow =
    currentIndex < rows.length - 1 ? rows[currentIndex + 1] : null;
  const annotation = annotations.get(row.key);

  return (
    <div className="flex flex-col h-full">
      {/* Navigation bar */}
      <div className="flex items-center gap-3 px-5 py-2.5 border-b border-app-border bg-app-surface shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-app-muted hover:text-app-text text-xs transition-colors"
        >
          <IconChevron direction="left" className="w-3 h-3" />
          {t.review.back}
        </button>
        <code className="text-app-muted text-xs flex-1 truncate font-mono">
          {row.key}
        </code>
        <div className="flex items-center gap-1.5">
          <button
            disabled={!prevRow}
            onClick={() => prevRow && onSelectRow(prevRow)}
            aria-label={t.review.previousKey}
            className="w-6 h-6 flex items-center justify-center rounded text-app-muted hover:text-app-text hover:bg-app-surface-2 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <IconChevron direction="left" className="w-3 h-3" />
          </button>
          <span className="text-app-muted text-xs tabular-nums">
            {currentIndex + 1} / {rows.length}
          </span>
          <button
            disabled={!nextRow}
            onClick={() => nextRow && onSelectRow(nextRow)}
            aria-label={t.review.nextKey}
            className="w-6 h-6 flex items-center justify-center rounded text-app-muted hover:text-app-text hover:bg-app-surface-2 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <IconChevron direction="right" className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <div className="space-y-3">
          <div>
            <p className="text-app-muted text-[10px] uppercase tracking-wider font-medium mb-1.5">
              {t.review.colSource}
            </p>
            <p className="text-app-muted text-sm leading-relaxed bg-app-surface rounded-md px-4 py-3 whitespace-pre-wrap">
              {row.source}
            </p>
          </div>
          {!isNewTranslation && (
            <div>
              <p className="text-app-muted text-[10px] uppercase tracking-wider font-medium mb-1.5">
                {t.review.colPrevious}
              </p>
              {row.previous != null ? (
                <p className="text-app-muted text-sm leading-relaxed bg-app-surface rounded-md px-4 py-3 whitespace-pre-wrap">
                  {row.previous}
                </p>
              ) : (
                <p className="text-app-muted/40 text-sm italic bg-app-surface rounded-md px-4 py-3">
                  {t.review.newKey}
                </p>
              )}
            </div>
          )}
          <div>
            <p className="text-app-muted text-[10px] uppercase tracking-wider font-medium mb-1.5">
              {t.review.colTranslation}
            </p>
            <p className="text-app-text text-sm leading-relaxed bg-app-surface rounded-md px-4 py-3 whitespace-pre-wrap">
              {row.translated}
            </p>
          </div>
        </div>

        <div className="border-t border-app-border pt-4">
          <p className="text-app-muted text-[10px] uppercase tracking-wider font-medium mb-3">
            {t.review.annotation}
          </p>
          <AnnotationPanel
            key={row.key}
            row={row}
            existing={annotation}
            onSave={(a) => onSave(row.key, a)}
            onRemove={() => onRemove(row.key)}
          />
        </div>
      </div>
    </div>
  );
});

export default RowDetailView;
