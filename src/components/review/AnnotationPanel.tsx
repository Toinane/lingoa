import { useState, useRef, useMemo } from "react";
import { useAutoResize } from "../../hooks/useAutoResize";
import { useT } from "../../i18n";
import type { KeyRow } from "../../lib/tauri";

export type AnnotationType = "suggestion" | "comment";

export interface Annotation {
  type: AnnotationType;
  body: string;
}

interface ParsedLine {
  prefix: string;
  value: string;
  suffix: string;
}

function parseRawLine(rawLine: string, path: string): ParsedLine | null {
  if (/\.ya?ml$/i.test(path)) {
    const m = rawLine.match(/^(\s*\S[^:]*:\s*)(.+?)(\s*)$/);
    if (m) return { prefix: m[1], value: m[2], suffix: m[3] };
    return null;
  }
  // JSON: `    "key": "value"` or `    "key": "value",`
  const m = rawLine.match(/^(\s*"[^"]*":\s*")(.*)(")(\s*,?\s*)$/);
  if (m) return { prefix: m[1], value: m[2], suffix: m[3] + m[4] };
  return null;
}

export function AnnotationPanel({
  row,
  existing,
  onSave,
  onRemove,
  onClose,
}: {
  row: KeyRow;
  existing: Annotation | undefined;
  onSave: (annotation: Annotation) => void;
  onRemove: () => void;
  onClose?: () => void;
}) {
  const t = useT();
  const parsed = useMemo(
    () => parseRawLine(row.rawLine, row.path),
    [row.rawLine, row.path],
  );

  const [type, setType] = useState<AnnotationType>(
    existing?.type ?? (row.line > 0 ? "suggestion" : "comment"),
  );

  // Suggestion state: just the translation value (we reconstruct the full line on save)
  const [suggestionValue, setSuggestionValue] = useState<string>(() => {
    if (existing?.type === "suggestion" && parsed) {
      return parseRawLine(existing.body, row.path)?.value ?? existing.body;
    }
    return parsed?.value ?? row.rawLine;
  });

  // Comment state: free-form text
  const [commentBody, setCommentBody] = useState<string>(
    existing?.type === "comment" ? existing.body : "",
  );

  const suggestionRef = useRef<HTMLTextAreaElement>(null);
  const commentRef = useRef<HTMLTextAreaElement>(null);

  useAutoResize(suggestionRef, suggestionValue);
  useAutoResize(commentRef, commentBody);

  const handleSave = () => {
    if (type === "suggestion") {
      if (!suggestionValue.trim()) return;
      const body = parsed
        ? parsed.prefix + suggestionValue + parsed.suffix
        : suggestionValue;
      onSave({ type, body });
    } else {
      if (!commentBody.trim()) return;
      onSave({ type, body: commentBody });
    }
  };

  return (
    <div className="px-4 py-3 bg-app-base">
      {/* Type toggle */}
      <div className="flex gap-1 mb-2.5">
        <button
          onClick={() => setType("suggestion")}
          disabled={row.line === 0}
          title={
            row.line === 0 ? t.review.annotationLineNotInDiffHint : undefined
          }
          className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
            type === "suggestion"
              ? "bg-app-accent text-white"
              : row.line === 0
                ? "text-app-muted/40 cursor-not-allowed"
                : "bg-app-surface-2 text-app-muted hover:text-app-text"
          }`}
        >
          {t.review.annotationTypeSuggestion}
        </button>
        <button
          onClick={() => setType("comment")}
          className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
            type === "comment"
              ? "bg-app-accent text-white"
              : "bg-app-surface-2 text-app-muted hover:text-app-text"
          }`}
        >
          {t.review.annotationTypeComment}
        </button>
      </div>

      {type === "suggestion" ? (
        <textarea
          ref={suggestionRef}
          value={suggestionValue}
          onChange={(e) => setSuggestionValue(e.target.value)}
          rows={1}
          spellCheck={false}
          className="w-full bg-app-surface border border-app-border rounded px-3 py-2 text-sm text-app-text resize-none overflow-hidden focus:outline-none focus:border-app-accent transition-colors"
        />
      ) : (
        <textarea
          ref={commentRef}
          value={commentBody}
          onChange={(e) => setCommentBody(e.target.value)}
          placeholder={t.review.annotationCommentPlaceholder}
          rows={1}
          className="w-full bg-app-surface border border-app-border rounded px-3 py-2 text-sm text-app-text placeholder-app-muted resize-none overflow-hidden focus:outline-none focus:border-app-accent transition-colors"
        />
      )}

      <div className="flex gap-2 mt-2">
        <button
          onClick={handleSave}
          disabled={
            type === "suggestion"
              ? !suggestionValue.trim()
              : !commentBody.trim()
          }
          className="px-3 py-1.5 bg-app-accent hover:bg-app-accent-hover disabled:opacity-40 text-white text-xs font-medium rounded transition-colors"
        >
          {existing ? t.review.annotationUpdate : t.review.annotationAdd}
        </button>
        {existing && (
          <button
            onClick={onRemove}
            className="px-3 py-1.5 bg-app-surface-2 hover:bg-key-red/10 text-key-red text-xs font-medium rounded transition-colors"
          >
            {t.review.annotationRemove}
          </button>
        )}
        {onClose && (
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-app-surface-2 text-app-muted hover:text-app-text text-xs rounded transition-colors"
          >
            {t.review.annotationCancel}
          </button>
        )}
      </div>
    </div>
  );
}
