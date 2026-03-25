import type { TranslationKeyWithState, KeyState } from "../../types";
import { useT } from "../../i18n";

const STATE_COLORS: Record<KeyState, string> = {
  translated: "#3fb950",
  "own-pending": "#d29922",
  "other-pending": "#58a6ff",
  untranslated: "#f85149",
};

interface Props {
  item: TranslationKeyWithState;
  isSelected: boolean;
  isGrouped?: boolean;
  onClick: () => void;
}

export default function KeyItem({ item, isSelected, isGrouped = false, onClick }: Props) {
  const t = useT();

  const STATE_TITLES: Record<KeyState, string> = {
    translated: t.keyItem.states.translated,
    "own-pending": t.keyItem.states.ownPending,
    "other-pending": t.keyItem.states.otherPending,
    untranslated: t.keyItem.states.untranslated,
  };

  const displayText = item.editorTranslation || item.source || item.key;

  // Inside an accordion group, show only the leaf portion of the key (after first dot)
  const dotIdx = item.key.indexOf(".");
  const leafKey = isGrouped && dotIdx !== -1 ? item.key.slice(dotIdx + 1) : item.key;

  return (
    <button
      data-selected={isSelected}
      onClick={onClick}
      className={`w-full h-full flex items-start gap-2.5 text-left transition-colors group ${
        isGrouped ? "pl-6 pr-3 py-2" : "px-3 py-2"
      } ${
        isSelected
          ? "bg-app-accent/20 text-app-text"
          : "hover:bg-app-surface-2 text-app-muted hover:text-app-text"
      }`}
    >
      <span
        className="shrink-0 w-2 h-2 rounded-full mt-1"
        style={{ backgroundColor: STATE_COLORS[item.state] }}
        title={STATE_TITLES[item.state]}
      />

      <span className="flex-1 min-w-0">
        <span
          className={`block text-xs truncate leading-tight ${isSelected ? "text-app-text" : ""}`}
        >
          {displayText}
        </span>
        <span className="block font-mono text-xs text-app-muted/60 truncate mt-0.5">
          {leafKey}
        </span>
      </span>

      {item.proposals.length > 0 && (
        <span className="shrink-0 text-xs text-app-muted bg-app-surface-2 rounded px-1 mt-0.5">
          {item.proposals.length}
        </span>
      )}
    </button>
  );
}
