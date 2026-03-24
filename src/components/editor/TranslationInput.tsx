import { useRef, useEffect, useState } from "react";
import { useEditorStore } from "../../stores/editorStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useT } from "../../i18n";

export default function TranslationInput() {
  const {
    selectedKey, editBuffer, isDirty,
    setEditBuffer, saveCurrentKey,
    navigateCount,
  } = useEditorStore();
  const { spellCheckDefault } = useSettingsStore();
  const t = useT();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [spellCheck, setSpellCheck] = useState(spellCheckDefault);

  useEffect(() => { setSpellCheck(spellCheckDefault); }, [spellCheckDefault]);


  // On key switch: focus + auto-resize to fit the new content
  useEffect(() => {
    if (navigateCount > 0) {
      const ta = textareaRef.current;
      if (ta) {
        ta.style.height = "auto";
        ta.style.height = `${ta.scrollHeight}px`;
        ta.focus();
      }
    }
  }, [navigateCount]);

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
          onChange={(e) => setEditBuffer(e.target.value)}
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
            title={spellCheck ? "Disable spellcheck" : "Enable spellcheck"}
            className={`text-xs transition-colors px-1.5 py-0.5 rounded ${
              spellCheck ? "text-app-accent bg-app-accent/10" : "text-app-muted hover:text-app-text"
            }`}
          >
            ABC
          </button>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-app-muted text-xs hidden md:block">
            <kbd className="bg-app-surface-2 border border-app-border rounded px-1 py-0.5 text-xs">
              Shift+↓
            </kbd>{" "}
            {t.editor.saveAndNextHint}
          </span>
          <button
            onClick={saveCurrentKey}
            disabled={!isDirty}
            className="px-4 py-1.5 bg-app-accent hover:bg-app-accent-hover disabled:opacity-40 disabled:cursor-default text-white text-xs font-medium rounded-md transition-colors"
          >
            {t.editor.save}
          </button>
        </div>
      </div>
    </div>
  );
}
