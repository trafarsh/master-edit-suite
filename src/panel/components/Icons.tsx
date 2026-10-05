/** Inline stroke icons (24x24 grid) so the panel needs no icon font or network. */
import type { ReactNode } from "react";

function Svg({ children, size = 20 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const Icon = {
  autoEdit: () => (
    <Svg>
      <path d="M4 20 15 9" />
      <path d="m14 5 1-2 1 2 2 1-2 1-1 2-1-2-2-1z" />
      <path d="m19 12 .7-1.3L21 10l-1.3-.7L19 8l-.7 1.3L17 10l1.3.7z" />
    </Svg>
  ),
  library: () => (
    <Svg>
      <rect x="3" y="4" width="5" height="16" rx="1" />
      <rect x="10" y="4" width="5" height="16" rx="1" />
      <path d="m17 5 3.5 14.5" />
    </Svg>
  ),
  ai: () => (
    <Svg>
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
      <rect x="7" y="7" width="10" height="10" rx="2" />
      <path d="M10 14.5 11.5 9.5h1L14 14.5M10.5 13h3" />
    </Svg>
  ),
  transitions: () => (
    <Svg>
      <rect x="3" y="6" width="11" height="12" rx="1.5" />
      <path d="M17 6h2.5A1.5 1.5 0 0 1 21 7.5v9a1.5 1.5 0 0 1-1.5 1.5H17" />
      <path d="m8 10 3 2-3 2" />
    </Svg>
  ),
  general: () => (
    <Svg>
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="18" cy="18" r="2" />
    </Svg>
  ),
  ease: () => (
    <Svg>
      <path d="M4 20C10 20 9 4 20 4" />
      <circle cx="4" cy="20" r="1.5" />
      <circle cx="20" cy="4" r="1.5" />
    </Svg>
  ),
  fx: () => (
    <Svg>
      <path d="M10 5H7.5A1.5 1.5 0 0 0 6 6.5V19M4 11h5" />
      <path d="m13 11 7 8M20 11l-7 8" />
    </Svg>
  ),
  project: () => (
    <Svg>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="m10 11 4 2-4 2z" />
    </Svg>
  ),
  settings: () => (
    <Svg>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </Svg>
  ),
  close: () => (
    <Svg size={14}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  ),
  refresh: () => (
    <Svg size={16}>
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 4v7h-7" />
    </Svg>
  ),
  folder: () => (
    <Svg size={16}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </Svg>
  ),
};

export type IconName = keyof typeof Icon;
