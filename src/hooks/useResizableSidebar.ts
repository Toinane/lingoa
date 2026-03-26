import { useState, useCallback } from "react";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function useResizableSidebar(storageKey: string, defaultWidth = 288) {
  const [width, setWidth] = useState(() => {
    const stored = localStorage.getItem(storageKey);
    return stored ? parseInt(stored, 10) : defaultWidth;
  });

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      let w = width;
      const onMove = (ev: MouseEvent) => {
        w = clamp(ev.clientX, 180, 520);
        setWidth(w);
      };
      const onUp = () => {
        localStorage.setItem(storageKey, String(w));
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [storageKey, width],
  );

  return { width, handleResizeStart };
}
