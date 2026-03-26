import React, {
  useRef,
  useEffect,
  useState,
  useMemo,
  useCallback,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEditorStore } from "../../stores/editorStore";
import { useT, interp } from "../../i18n";
import type { KeyState, TranslationKeyWithState } from "../../types";
import { IconTriangleRight } from "../Icons";
import KeyItem from "./KeyItem";
import { STATE_COLORS, worstStateOf } from "../../constants/keyState";

type Filter = "all" | KeyState;

// ─── Virtual row types ────────────────────────────────────────────────────────

type GroupHeaderRow = {
  type: "header";
  name: string;
  count: number;
  worstState: KeyState;
  isOpen: boolean;
};
type KeyRow = {
  type: "key";
  item: TranslationKeyWithState;
  storeIndex: number;
  isGrouped: boolean;
};
type VirtualRow = GroupHeaderRow | KeyRow;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildRows(
  visible: TranslationKeyWithState[],
  filteredIndex: Map<string, number>,
  closedGroups: Set<string>,
  isSearching: boolean,
): VirtualRow[] {
  // While searching: flat sorted list, no group structure
  if (isSearching) {
    return visible.map((item) => ({
      type: "key" as const,
      item,
      storeIndex: filteredIndex.get(item.key) ?? 0,
      isGrouped: false,
    }));
  }

  const rootKeys: TranslationKeyWithState[] = [];
  const groups = new Map<string, TranslationKeyWithState[]>();

  for (const k of visible) {
    const dot = k.key.indexOf(".");
    if (dot === -1) {
      rootKeys.push(k);
    } else {
      const g = k.key.slice(0, dot);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(k);
    }
  }

  const rows: VirtualRow[] = [];

  // Root keys (no namespace) – flat, no header
  for (const k of rootKeys) {
    rows.push({
      type: "key",
      item: k,
      storeIndex: filteredIndex.get(k.key) ?? 0,
      isGrouped: false,
    });
  }

  // Namespace groups – sorted alphabetically
  for (const [name, ks] of [...groups.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const isOpen = !closedGroups.has(name);
    rows.push({
      type: "header",
      name,
      count: ks.length,
      worstState: worstStateOf(ks),
      isOpen,
    });
    if (isOpen) {
      for (const k of ks) {
        rows.push({
          type: "key",
          item: k,
          storeIndex: filteredIndex.get(k.key) ?? 0,
          isGrouped: true,
        });
      }
    }
  }

  return rows;
}

// ─── Component ───────────────────────────────────────────────────────────────

const ITEM_HEIGHT = 50;

const FILTERS: {
  value: Filter;
  label_key: keyof ReturnType<typeof useT>["keyList"]["filters"];
  color: string | null;
}[] = [
  { value: "all", label_key: "all", color: null },
  { value: "untranslated", label_key: "todo", color: "#f85149" },
  { value: "other-pending", label_key: "review", color: "#58a6ff" },
  { value: "own-pending", label_key: "mine", color: "#d29922" },
  { value: "translated", label_key: "done", color: "#3fb950" },
];

// 2×2 grid of state-color dots shown for the "All" filter in compact mode
function AllDotsIcon() {
  return (
    <span className="grid grid-cols-2 gap-px w-3 h-3 shrink-0">
      <span className="rounded-full" style={{ background: "#f85149" }} />
      <span className="rounded-full" style={{ background: "#58a6ff" }} />
      <span className="rounded-full" style={{ background: "#d29922" }} />
      <span className="rounded-full" style={{ background: "#3fb950" }} />
    </span>
  );
}

export default function KeyList() {
  const {
    filteredKeys,
    selectedIndex,
    selectedKey,
    searchQuery,
    setSearchQuery,
    selectKey,
    keys,
  } = useEditorStore();
  const t = useT();

  const [activeFilter, setActiveFilter] = useState<Filter>("all");
  const [closedGroups, setClosedGroups] = useState<Set<string>>(new Set());
  const [compactFilters, setCompactFilters] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const filterBarRef = useRef<HTMLDivElement>(null);

  // Switch to dots-only when the filter bar is too narrow to show labels
  useEffect(() => {
    const el = filterBarRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setCompactFilters(entry.contentRect.width < 200);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Reset accordion state when a new file is loaded
  useEffect(() => {
    setClosedGroups(new Set());
    setActiveFilter("all");
  }, [keys]);

  const toggleGroup = useCallback((name: string) => {
    setClosedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const visibleKeys = useMemo(
    () =>
      activeFilter === "all"
        ? filteredKeys
        : filteredKeys.filter((k) => k.state === activeFilter),
    [filteredKeys, activeFilter],
  );

  // Pre-compute key → storeIndex once per filteredKeys change (O(n)) so
  // buildRows doesn't call indexOf() per item (which would be O(n²)).
  const filteredIndex = useMemo(
    () => new Map(filteredKeys.map((k, i) => [k.key, i])),
    [filteredKeys],
  );

  const rows = useMemo(
    () => buildRows(visibleKeys, filteredIndex, closedGroups, !!searchQuery),
    [visibleKeys, filteredIndex, closedGroups, searchQuery],
  );

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 8,
  });

  // Auto-open a group when the selected key lands inside a closed one
  useEffect(() => {
    if (!selectedKey || searchQuery) return;
    const dot = selectedKey.key.indexOf(".");
    if (dot === -1) return;
    const group = selectedKey.key.slice(0, dot);
    setClosedGroups((prev) => {
      if (!prev.has(group)) return prev;
      const next = new Set(prev);
      next.delete(group);
      return next;
    });
  }, [selectedKey, searchQuery]);

  // Reset scroll position when filter or search changes so the virtualizer
  // doesn't keep a stale scrollTop that pushes items out of view
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [activeFilter, searchQuery]);

  // Scroll to the selected key row only when the selection itself changes
  useEffect(() => {
    const rowIdx = rows.findIndex(
      (r) => r.type === "key" && r.item.key === selectedKey?.key,
    );
    if (rowIdx >= 0) {
      virtualizer.scrollToIndex(rowIdx, { align: "auto" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex]);

  const total = keys.length;
  const translated = keys.filter((k) => k.state === "translated").length;
  const pct = total > 0 ? Math.round((translated / total) * 100) : 0;

  return (
    <div className="flex flex-col h-full">
      {/* Progress bar — top of sidebar */}
      <div className="px-3 pt-2.5 pb-2 shrink-0">
        <div className="flex justify-between text-xs text-app-muted mb-1">
          <span>{interp(t.keyList.progress, { translated, total })}</span>
          <span>{pct}%</span>
        </div>
        <div className="h-1 bg-app-surface-2 rounded-full overflow-hidden">
          <div
            className="h-full bg-key-green rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Search */}
      <div className="px-3 pb-2 shrink-0">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t.keyList.searchPlaceholder}
          className="w-full bg-app-base border border-app-border rounded-md px-3 py-1.5 text-app-text placeholder-app-muted text-xs focus:outline-none focus:border-app-accent transition-colors"
        />
      </div>

      {/* Filter tabs — compact (dots) when the bar is too narrow for labels */}
      <div
        ref={filterBarRef}
        className="flex shrink-0 border-b border-app-border"
      >
        {FILTERS.map((f) => {
          const label = t.keyList.filters[f.label_key];
          const isActive = activeFilter === f.value;
          return (
            <button
              key={f.value}
              onClick={() => setActiveFilter(f.value)}
              title={label}
              className={`flex-1 min-w-0 flex items-center justify-center py-1 px-1 transition-colors border-b-2 -mb-px ${
                isActive
                  ? "border-app-accent text-app-text"
                  : "border-transparent text-app-muted hover:text-app-text"
              }`}
            >
              {compactFilters ? (
                f.color === null ? (
                  <AllDotsIcon />
                ) : (
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: f.color }}
                  />
                )
              ) : (
                <span className="flex items-center gap-1 min-w-0">
                  {f.color !== null && (
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: f.color }}
                    />
                  )}
                  <span className="truncate text-[11px]">{label}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Virtualised list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="px-3 py-6 text-center text-app-muted text-xs">
            {searchQuery ? t.keyList.noKeysSearch : t.keyList.noKeysCategory}
          </div>
        ) : (
          <div
            style={{ height: virtualizer.getTotalSize(), position: "relative" }}
          >
            {virtualizer.getVirtualItems().map((vItem) => {
              const row = rows[vItem.index];
              return (
                <div
                  key={vItem.index}
                  style={{
                    position: "absolute",
                    top: vItem.start,
                    left: 0,
                    right: 0,
                    height: vItem.size,
                  }}
                >
                  {row.type === "header" ? (
                    <GroupHeader row={row} onToggle={toggleGroup} />
                  ) : (
                    <KeyItem
                      item={row.item}
                      isSelected={row.storeIndex === selectedIndex}
                      isGrouped={row.isGrouped}
                      onClick={() => void selectKey(row.storeIndex)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Group header ─────────────────────────────────────────────────────────────

const GroupHeader = React.memo(function GroupHeader({
  row,
  onToggle,
}: {
  row: GroupHeaderRow;
  onToggle: (name: string) => void;
}) {
  return (
    <button
      onClick={() => onToggle(row.name)}
      className="w-full h-full flex items-center gap-2 px-3 bg-app-surface border-b border-app-border hover:bg-app-surface-2 transition-colors"
    >
      <IconTriangleRight
        className="shrink-0 w-2.5 h-2.5 text-app-muted transition-transform"
        style={{ transform: row.isOpen ? "rotate(90deg)" : "rotate(0deg)" }}
      />
      <span className="flex-1 min-w-0 text-xs font-medium text-app-text truncate text-left">
        {row.name}
      </span>
      <span className="shrink-0 text-xs text-app-muted tabular-nums">
        {row.count}
      </span>
      <span
        className="shrink-0 w-2 h-2 rounded-full"
        style={{ backgroundColor: STATE_COLORS[row.worstState] }}
        title={row.worstState}
      />
    </button>
  );
});
