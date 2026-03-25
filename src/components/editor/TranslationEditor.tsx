import { useEditorStore } from "../../stores/editorStore";
import { useT, interp } from "../../i18n";
import SourceSection from "./SourceSection";
import TranslationInput from "./TranslationInput";
import ProposalsSection from "./ProposalsSection";

export default function TranslationEditor() {
  const { selectedKey, keys, selectedIndex, targetLocale, sourceFile } = useEditorStore();
  const t = useT();

  return (
    <div className="flex flex-col h-full">
      {/* Sub-header: source → target · filename · position */}
      <div className="flex items-center gap-2 px-4 h-9 bg-app-surface border-b border-app-border shrink-0">
        <span className="text-app-muted text-xs uppercase tracking-wider">
          {sourceFile?.locale ?? "—"}
        </span>
        <span className="text-app-muted text-xs">→</span>
        <span className="text-app-text text-xs font-semibold uppercase tracking-wider">
          {targetLocale ?? "—"}
        </span>
        <span className="text-app-muted text-xs">·</span>
        <span className="text-app-muted text-xs font-mono truncate flex-1">
          {sourceFile?.relativePath.split("/").pop() ?? "—"}
        </span>
        <span className="text-app-muted text-xs shrink-0">
          {keys.length > 0 ? interp(t.editor.position, { current: selectedIndex + 1, total: keys.length }) : "—"}
        </span>
      </div>

      {/* Scrollable editor content */}
      <div className="flex-1 overflow-y-auto">
        {selectedKey ? (
          <>
            <SourceSection source={selectedKey.source} context={selectedKey.context} />
            <TranslationInput key={selectedKey.key} />
            <ProposalsSection proposals={selectedKey.proposals} />
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-app-muted text-sm">
            {t.editor.selectKeyPrompt}
          </div>
        )}
      </div>
    </div>
  );
}
