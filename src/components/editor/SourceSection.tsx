import { useState, useCallback, useRef, useEffect } from "react";
import { useT } from "../../i18n";
import { IconCopy, IconCheck, IconChevron } from "../Icons";

interface Props {
  source: string;
  context?: string;
  keyName?: string;
  secondaryLocale?: string | null;
  secondarySource?: string | null;
  availableLocales?: string[];
  onSetSecondaryLocale?: (locale: string | null) => void;
}

function LocalePicker({
  value,
  options,
  placeholder,
  onChange,
}: {
  value: string | null;
  options: string[];
  placeholder: string;
  onChange: (locale: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1 text-xs font-mono transition-colors ${
          value
            ? "text-app-muted hover:text-app-text uppercase tracking-wider"
            : "text-app-muted/50 hover:text-app-muted"
        }`}
      >
        {value ?? placeholder}
        <IconChevron direction="down" className="w-2.5 h-2.5" />
      </button>
      {open && options.length > 0 && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-app-surface border border-app-border rounded-md shadow-md py-1 min-w-20">
          {options.map((l) => (
            <button
              key={l}
              onClick={() => {
                onChange(l);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-1.5 text-xs font-mono transition-colors ${
                l === value
                  ? "text-app-accent"
                  : "text-app-text hover:bg-app-surface-2"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SourceSection({
  source,
  context,
  keyName,
  secondaryLocale,
  secondarySource,
  availableLocales,
  onSetSecondaryLocale,
}: Props) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(source);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [source]);

  return (
    <div className="border-b border-app-border">
      <div className="px-6 pt-4 pb-2 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-xs uppercase tracking-wider text-app-muted shrink-0">
            {t.editor.sourceString}
          </p>
          {keyName && (
            <>
              <span className="text-app-muted/40 shrink-0">·</span>
              <span
                className="text-xs font-mono text-app-muted/60 truncate"
                title={keyName}
              >
                {keyName}
              </span>
            </>
          )}
        </div>
        <button
          onClick={handleCopy}
          title={copied ? t.editor.copied : t.editor.copySource}
          className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
            copied
              ? "text-key-green"
              : "text-app-muted hover:text-app-text hover:bg-app-surface-2"
          }`}
        >
          {copied ? (
            <IconCheck className="w-3.5 h-3.5" />
          ) : (
            <IconCopy className="w-3.5 h-3.5" />
          )}
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

        {/* Secondary reference language */}
        {onSetSecondaryLocale && (availableLocales?.length ?? 0) > 0 && (
          <div className="mt-3 pt-3 border-t border-app-border/50">
            <div className="flex items-center gap-2 mb-1.5">
              <LocalePicker
                value={secondaryLocale ?? null}
                options={availableLocales ?? []}
                placeholder={t.editor.addReference}
                onChange={onSetSecondaryLocale}
              />
              {secondaryLocale && (
                <button
                  onClick={() => onSetSecondaryLocale(null)}
                  className="text-app-muted/40 hover:text-app-muted transition-colors leading-none"
                  title={t.editor.removeReference}
                >
                  ×
                </button>
              )}
            </div>
            {secondaryLocale &&
              (secondarySource ? (
                <p className="text-app-muted text-sm leading-relaxed whitespace-pre-wrap">
                  {secondarySource}
                </p>
              ) : (
                <p className="text-app-muted/30 text-xs italic">—</p>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
