import { useRef, useEffect, useState, useCallback } from "react";
import { useEditorStore } from "../../stores/editorStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useT } from "../../i18n";

const DEBOUNCE_MS = 600;

export default function TranslationInput() {
  const {
    selectedKey, editBuffer, setEditBuffer, saveCurrentKey,
  } = useEditorStore();
  const { spellCheckDefault } = useSettingsStore();
  const t = useT();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const savedTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const [spellCheck, setSpellCheck] = useState(spellCheckDefault);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => { setSpellCheck(spellCheckDefault); }, [spellCheckDefault]);

  // On mount (which happens on every key change due to key={selectedKey.key} in the parent):
  // focus the textarea and auto-size it to the initial content.
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = `${ta.scrollHeight}px`;
      ta.focus();
    }
    return () => {
      clearTimeout(debounceRef.current);
      clearTimeout(savedTimerRef.current);
    };
  }, []);

  const flashSaved = useCallback(() => {
    setJustSaved(true);
    clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setJustSaved(false), 1500);
  }, []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditBuffer(e.target.value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      await saveCurrentKey();
      flashSaved();
    }, DEBOUNCE_MS);
  }, [setEditBuffer, saveCurrentKey, flashSaved]);

  const sourceLen = selectedKey?.source.length ?? 0;
  const targetLen = editBuffer.length;

  if (!selectedKey) {
    return (
      <div className="px-6 py-10 text-center text-app-muted text-sm">
        {t.editor.selectKeyShort}
      </div>
    );
  }

  return (
    <div className="px-6 py-4">
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={editBuffer}
          onChange={handleChange}
          placeholder={t.editor.enterTranslation}
          rows={3}
          spellCheck={spellCheck}
          className="w-full bg-app-surface-2 border border-app-border rounded-md px-3 py-2.5 text-app-text placeholder-app-muted text-sm resize-y focus:outline-none focus:border-app-accent transition-colors leading-relaxed"
          style={{ minHeight: "80px" }}
        />
      </div>

      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-3">
          <span className="text-app-muted text-xs">{sourceLen} · {targetLen}</span>
          <button
            onClick={() => setSpellCheck((v) => !v)}
            title={spellCheck ? t.editor.spellcheckDisable : t.editor.spellcheckEnable}
            className={`text-[10px] font-mono transition-all px-1.5 py-0.5 rounded border ${
              spellCheck
                ? "text-app-text border-app-border bg-app-surface-2 underline decoration-wavy decoration-key-red"
                : "text-app-muted border-transparent hover:border-app-border hover:text-app-text"
            }`}
          >
            abc
          </button>
        </div>

        <span className={`text-xs transition-all duration-300 ${
          justSaved ? "text-key-green opacity-100" : "opacity-0"
        }`}>
          ✓ {t.editor.saved}
        </span>
      </div>
    </div>
  );
}
