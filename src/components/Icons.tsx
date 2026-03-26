/** Central icon library — all SVG icons used across the app. */

interface IconProps {
  className?: string;
  style?: React.CSSProperties;
}

// ─── Editor / UI ─────────────────────────────────────────────────────────────

/** Radix-style filled copy icon — two overlapping documents. */
export function IconCopy({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 15 15"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M1 9.5C1 10.33 1.67 11 2.5 11H4v-1H2.5A.5.5 0 0 1 2 9.5v-7A.5.5 0 0 1 2.5 2h7a.5.5 0 0 1 .5.5V4h-4.5C4.67 4 4 4.67 4 5.5v7C4 13.33 4.67 14 5.5 14h7c.83 0 1.5-.67 1.5-1.5v-7C14 4.67 13.33 4 12.5 4H11V2.5C11 1.67 10.33 1 9.5 1h-7C1.67 1 1 1.67 1 2.5v7ZM5 5.5A.5.5 0 0 1 5.5 5h7a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-.5.5h-7a.5.5 0 0 1-.5-.5v-7Z"
      />
    </svg>
  );
}

/** Radix-style filled checkmark. */
export function IconCheck({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 15 15"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M11.467 3.727a.75.75 0 0 1 .181 1.045l-4.25 6.5a.75.75 0 0 1-1.22.077L3.427 8.1a.75.75 0 1 1 1.146-.97l2.092 2.474 3.756-5.742a.75.75 0 0 1 1.046-.135Z"
      />
    </svg>
  );
}

/** Stroke chevron — direction controls which way it points. */
export function IconChevron({
  direction,
  className,
}: IconProps & { direction: "up" | "down" | "left" | "right" }) {
  const paths = {
    right: "M9 5l7 7-7 7",
    left: "M15 19l-7-7 7-7",
    down: "M19 9l-7 7-7-7",
    up: "M5 15l7-7 7 7",
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={paths[direction]} />
    </svg>
  );
}

/** Filled right-pointing triangle — used for sidebar group toggles. */
export function IconTriangleRight({ className, style }: IconProps) {
  return (
    <svg
      viewBox="0 0 10 10"
      fill="currentColor"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <path d="M3 2l4 3-4 3V2z" />
    </svg>
  );
}

/** X / close icon. */
export function IconX({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

/** Open folder. */
export function IconFolder({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      aria-hidden="true"
      className={className}
    >
      <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    </svg>
  );
}

/** Pencil / edit. */
export function IconPencil({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  );
}

/** Settings gear. */
export function IconGear({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.75}
      aria-hidden="true"
      className={className}
    >
      <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

/** Eye — show password. */
export function IconEye({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/** Eye with slash — hide password. */
export function IconEyeSlash({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

// ─── Window controls ─────────────────────────────────────────────────────────
// These keep special viewBoxes and shapeRendering for pixel-perfect rendering.

export function IconWindowMinimize({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 10 1"
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden="true"
      className={className}
    >
      <rect width="10" height="1" />
    </svg>
  );
}

export function IconWindowRestore({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      shapeRendering="crispEdges"
      aria-hidden="true"
      className={className}
    >
      <rect
        x="2.5"
        y="0.5"
        width="7"
        height="7"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d="M0.5 2.5 L0.5 9.5 L7.5 9.5"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function IconWindowMaximize({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      shapeRendering="crispEdges"
      aria-hidden="true"
      className={className}
    >
      <rect
        x="0.5"
        y="0.5"
        width="9"
        height="9"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function IconWindowClose({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      shapeRendering="geometricPrecision"
      strokeLinecap="round"
      aria-hidden="true"
      className={className}
    >
      <line
        x1="1"
        y1="1"
        x2="9"
        y2="9"
        strokeWidth="1.2"
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1="9"
        y1="1"
        x2="1"
        y2="9"
        strokeWidth="1.2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
