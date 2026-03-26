import { useEffect, type RefObject } from "react";

/** Automatically adjusts a textarea's height to fit its content whenever `value` changes. */
export function useAutoResize(
  ref: RefObject<HTMLTextAreaElement>,
  value: string,
) {
  useEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, [ref, value]);
}
