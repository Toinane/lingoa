import { useEffect, useRef } from "react";

interface Props {
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * Shared modal overlay — sits below the top bar (top-10) so the app chrome
 * remains visible. Handles Escape-to-close and click-outside-to-close.
 */
export default function AppModal({ onClose, children }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      ref={overlayRef}
      className="fixed top-10 inset-x-0 bottom-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      {children}
    </div>
  );
}
