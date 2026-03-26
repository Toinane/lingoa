import React from "react";
import { useT } from "../../i18n";

// React.memo is safe: useT() subscribes to settingsStore directly,
// so language changes still trigger a re-render regardless of memo.
const ShortcutBar = React.memo(function ShortcutBar() {
  const t = useT();

  const shortcuts = [
    { keys: ["Ctrl", "↵"], label: t.editor.saveAndNextHint },
    { keys: ["Shift", "↓↑"], label: t.editor.saveAndNavigateHint },
    { keys: ["Ctrl", "S"], label: t.editor.saveNowHint },
  ];

  return (
    <div className="fixed bottom-3 right-4 flex items-center gap-3 pointer-events-none select-none">
      {shortcuts.map(({ keys, label }) => (
        <span
          key={label}
          className="flex items-center gap-1 text-app-muted/50 text-[10px]"
        >
          {keys.map((k) => (
            <kbd
              key={k}
              className="bg-app-surface border border-app-border/50 rounded px-1 py-px text-[10px] font-mono leading-tight"
            >
              {k}
            </kbd>
          ))}
          <span>{label}</span>
        </span>
      ))}
    </div>
  );
});

export default ShortcutBar;
