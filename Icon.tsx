import type { ReactNode } from 'react';

type IconProps = { size?: number; strokeWidth?: number; className?: string; filled?: boolean; style?: React.CSSProperties };

function Svg({ size = 20, className, children, filled = false, strokeWidth = 1.8, style }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const Icon = {
  home: (p: IconProps) => (
    <Svg {...p}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M9.5 21v-6h5v6" /></Svg>
  ),
  box: (p: IconProps) => (
    <Svg {...p}><path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" /><path d="M3 8l9 5 9-5" /><path d="M12 13v8" /></Svg>
  ),
  swap: (p: IconProps) => (
    <Svg {...p}><path d="M8 3 4 7l4 4" /><path d="M4 7h16" /><path d="m16 21 4-4-4-4" /><path d="M20 17H4" /></Svg>
  ),
  user: (p: IconProps) => (
    <Svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" /></Svg>
  ),
  search: (p: IconProps) => (
    <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Svg>
  ),
  bell: (p: IconProps) => (
    <Svg {...p}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></Svg>
  ),
  heart: (p: IconProps) => (
    <Svg {...p} filled={p.filled}><path d="M12 20.5 4.6 13a4.8 4.8 0 0 1 0-6.8 4.6 4.6 0 0 1 6.7 0l.7.7.7-.7a4.6 4.6 0 0 1 6.7 0 4.8 4.8 0 0 1 0 6.8Z" /></Svg>
  ),
  plus: (p: IconProps) => (
    <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>
  ),
  star: (p: IconProps) => (
    <Svg {...p} filled={p.filled}><path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9Z" /></Svg>
  ),
  check: (p: IconProps) => (
    <Svg {...p}><path d="m4.5 12.5 5 5 10-11" /></Svg>
  ),
  x: (p: IconProps) => (
    <Svg {...p}><path d="M6 6l12 12M18 6 6 18" /></Svg>
  ),
  chevronL: (p: IconProps) => (
    <Svg {...p}><path d="m14.5 5.5-6.5 6.5 6.5 6.5" /></Svg>
  ),
  chevronR: (p: IconProps) => (
    <Svg {...p}><path d="m9.5 5.5 6.5 6.5-6.5 6.5" /></Svg>
  ),
  chevronD: (p: IconProps) => (
    <Svg {...p}><path d="m5.5 9.5 6.5 6.5 6.5-6.5" /></Svg>
  ),
  camera: (p: IconProps) => (
    <Svg {...p}><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" /><circle cx="12" cy="13" r="3.5" /></Svg>
  ),
  mapPin: (p: IconProps) => (
    <Svg {...p}><path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11Z" /><circle cx="12" cy="10" r="2.5" /></Svg>
  ),
  shield: (p: IconProps) => (
    <Svg {...p}><path d="M12 3 5 5.5V11c0 4.5 3 8 7 9.5 4-1.5 7-5 7-9.5V5.5Z" /><path d="m9 11.5 2 2 4-4.5" /></Svg>
  ),
  clock: (p: IconProps) => (
    <Svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Svg>
  ),
  flame: (p: IconProps) => (
    <Svg {...p}><path d="M12 22c4 0 7-2.7 7-7 0-3.2-2-5.6-4-7.7C13.5 5.6 13 3.6 13.4 2c-2.3 1.5-4.4 4-5 6.5C6.7 8.4 5 10 5 12.8 5 17 7.5 22 12 22Z" /><path d="M12 22c-1.8 0-3-1.4-3-3.2 0-2.2 2-3.4 3-5.3 1 1.9 3 3.1 3 5.3 0 1.8-1.2 3.2-3 3.2Z" /></Svg>
  ),
  message: (p: IconProps) => (
    <Svg {...p}><path d="M21 12a8.5 8.5 0 0 1-8.5 8.5c-1.6 0-3.2-.4-4.5-1.2L3 21l1.7-5A8.5 8.5 0 1 1 21 12Z" /></Svg>
  ),
  edit: (p: IconProps) => (
    <Svg {...p}><path d="M4 20h4L20 8l-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></Svg>
  ),
  trash: (p: IconProps) => (
    <Svg {...p}><path d="M4 7h16M9 7V5h6v2M6.5 7l1 13h9l1-13" /><path d="M10 11v5M14 11v5" /></Svg>
  ),
  settings: (p: IconProps) => (
    <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87 1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z" /></Svg>
  ),
  logout: (p: IconProps) => (
    <Svg {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></Svg>
  ),
  eye: (p: IconProps) => (
    <Svg {...p}><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z" /><circle cx="12" cy="12" r="2.5" /></Svg>
  ),
  eyeOff: (p: IconProps) => (
    <Svg {...p}><path d="m3 3 18 18" /><path d="M10.6 5.2A10.6 10.6 0 0 1 12 5.5c6.5 0 10 6.5 10 6.5a17 17 0 0 1-3 3.8M6.6 6.6A16 16 0 0 0 2 12s3.5 6.5 10 6.5a10 10 0 0 0 4.4-1" /></Svg>
  ),
  flag: (p: IconProps) => (
    <Svg {...p}><path d="M5 21V4" /><path d="M5 4h13l-2.5 4L18 12H5" /></Svg>
  ),
  ban: (p: IconProps) => (
    <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="m5.5 5.5 13 13" /></Svg>
  ),
  arrowL: (p: IconProps) => (
    <Svg {...p}><path d="M19 12H5" /><path d="m11 6-6 6 6 6" /></Svg>
  ),
  arrowR: (p: IconProps) => (
    <Svg {...p}><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></Svg>
  ),
  bolt: (p: IconProps) => (
    <Svg {...p}><path d="M13 2 4 14h6l-1 8 9-12h-6Z" /></Svg>
  ),
  grid: (p: IconProps) => (
    <Svg {...p}><rect x="3.5" y="3.5" width="7" height="7" rx="1" /><rect x="13.5" y="3.5" width="7" height="7" rx="1" /><rect x="3.5" y="13.5" width="7" height="7" rx="1" /><rect x="13.5" y="13.5" width="7" height="7" rx="1" /></Svg>
  ),
  barChart: (p: IconProps) => (
    <Svg {...p}><path d="M4 20V10M10 20V4M16 20v-8M22 20H2" /></Svg>
  ),
  lock: (p: IconProps) => (
    <Svg {...p}><rect x="4.5" y="10.5" width="15" height="10" rx="2" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" /></Svg>
  ),
  tag: (p: IconProps) => (
    <Svg {...p}><path d="M3 3h8l10 10-8 8L3 11Z" /><circle cx="8.5" cy="8.5" r="1.5" /></Svg>
  ),
  send: (p: IconProps) => (
    <Svg {...p}><path d="m22 2-11 11" /><path d="M22 2 15 22l-4-9-9-4Z" /></Svg>
  ),
  refresh: (p: IconProps) => (
    <Svg {...p}><path d="M20 11a8 8 0 0 0-14.9-3M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4" /></Svg>
  ),
  credit: (p: IconProps) => (
    <Svg {...p}><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 9.5h19M6 15h4" /></Svg>
  ),
  phone: (p: IconProps) => (
    <Svg {...p}><rect x="7" y="2.5" width="10" height="19" rx="2" /><path d="M10.5 18.5h3" /></Svg>
  ),
};

export type IconName = keyof typeof Icon;
