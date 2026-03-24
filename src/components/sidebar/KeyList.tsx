import { useRef, useEffect, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEditorStore } from "../../stores/editorStore";
import { useT, interp } from "../../i18n";
import type { KeyState } from "../../types";
import KeyItem from "./KeyItem";

type Filter = "all" | KeyState;

export default function KeyList() {
  const { filteredKeys, selectedIndex, searchQuery, setSearchQuery, switchKey, keys } =
    useEditorStore();
  const t = useT();
  const [activeFilter, setActiveFilter] = useState<Filter>("all");
  const scrollRef = useRef<HTMLDivElement>(null);

  const ITEM_HEIGHT = 50;

  const FILTERS: { value: Filter; label: string; color?: string }[] = [
    { value: "all",           label: t.keyList.filters.all },
    { value: "untranslated",  label: t.keyList.filters.todo,   color: "#f85149" },
    { value: "other-pending", label: t.keyList.filters.review, color: "#58a6ff" },
    { value: "own-pending",   label: t.keyList.filters.mine,   color: "#d29922" },
    { value: "translated",    label: t.keyList.filters.done,   color: "#3fb950" },
  ];

  const visibleKeys =
    activeFilter === "all"
      ? filteredKeys
      : filteredKeys.filter((k) => k.state === activeFilter);

  const total = keys.length;
  const translated = keys.filter((k) => k.state === "translated").length;
  const pct = total > 0 ? Math.round((translated / total) * 100) : 0;

  const virtualizer = useVirtualizer({
    count: visibleKeys.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 8,
  });

  useEffect(() => {
    const visibleIdx = visibleKeys.findIndex(
      (item) => filteredKeys.indexOf(item) === selectedIndex
    );
    if (visibleIdx >= 0) {
      virtualizer.scrollToIndex(visibleIdx, { align: "auto" });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex]);

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="px-3 pt-3 pb-2 shrink-0">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t.keyList.searchPlaceholder}
          className="w-full bg-app-base border border-app-border rounded-md px-3 py-1.5 text-app-text placeholder-app-muted text-xs focus:outline-none focus:border-app-accent transition-colors"
        />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-0.5 px-3 pb-2 shrink-0 overflow-x-auto">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setActiveFilter(f.value)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs whitespace-nowrap transition-colors ${
              activeFilter === f.value
                ? "bg-app-surface-2 text-app-text"
                : "text-app-muted hover:text-app-text"
            }`}
          >
            {f.color && (
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: f.color }} />
            )}
            {f.label}
          </button>
        ))}
      </div>

      {/* Progress bar */}
      <div className="px-3 pb-2 shrink-0">
        <div className="flex justify-between text-xs text-app-muted mb-1">
          <span>{interp(t.keyList.progress, { translated, total })}</span>
          <span>{pct}%</span>
        </div>
        <div className="h-1 bg-app-surface-2 rounded-full overflow-hidden">
          <div className="h-full bg-key-green rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="border-t border-app-border mb-1 shrink-0" />

      {/* Virtualised key list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {visibleKeys.length === 0 ? (
          <div className="px-3 py-6 text-center text-app-muted text-xs">
            {searchQuery ? t.keyList.noKeysSearch : t.keyList.noKeysCategory}
          </div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map((vItem) => {
              const item = visibleKeys[vItem.index];
              const realIndex = filteredKeys.indexOf(item);
              return (
                <div
                  key={item.key}
                  style={{ position: "absolute", top: vItem.start, left: 0, right: 0, height: vItem.size }}
                >
                  <KeyItem
                    item={item}
                    isSelected={realIndex === selectedIndex}
                    onClick={() => switchKey(realIndex)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
