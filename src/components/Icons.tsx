import type { CSSProperties, SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

const base = (size: number): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  "aria-hidden": true,
});

export const IconGrid = ({ size = 14, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <rect x="1.8" y="1.8" width="4.6" height="4.6" rx=".8" />
    <rect x="9.6" y="1.8" width="4.6" height="4.6" rx=".8" />
    <rect x="1.8" y="9.6" width="4.6" height="4.6" rx=".8" />
    <rect x="9.6" y="9.6" width="4.6" height="4.6" rx=".8" />
  </svg>
);

export const IconList = ({ size = 14, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M2.4 3.6h11.2M2.4 8h11.2M2.4 12.4h11.2" />
  </svg>
);

export const IconClock = ({ size = 14, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <circle cx="8" cy="8" r="6.1" />
    <path d="M8 4.7V8l2.4 1.5" />
  </svg>
);

export const IconPlay = ({ size = 14, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M5.4 3.6l7 4.4-7 4.4z" strokeLinejoin="round" />
  </svg>
);

export const IconStar = ({ size = 14, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M8 2.4l1.72 3.6 3.88.5-2.86 2.72.74 3.86L8 11.2l-3.48 1.88.74-3.86L2.4 6.5l3.88-.5z" strokeLinejoin="round" />
  </svg>
);

export const IconStarFilled = ({ size = 14, ...p }: P) => (
  <svg {...base(size)} fill="currentColor" stroke="none" {...p}>
    <path d="M8 2.4l1.72 3.6 3.88.5-2.86 2.72.74 3.86L8 11.2l-3.48 1.88.74-3.86L2.4 6.5l3.88-.5z" strokeLinejoin="round" />
  </svg>
);

export const IconSearch = ({ size = 14, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <circle cx="7" cy="7" r="4.6" />
    <path d="M10.5 10.5L14 14" />
  </svg>
);

export const IconPlus = ({ size = 14, ...p }: P) => (
  <svg {...base(size)} strokeWidth={1.8} {...p}>
    <path d="M8 3.4v9.2M3.4 8h9.2" />
  </svg>
);

export const IconSettings = ({ size = 14, ...p }: P) => (
  <svg {...base(size)} strokeWidth={1.4} {...p}>
    <circle cx="8" cy="8" r="2.2" />
    <path d="M8 1.8v1.9M8 12.3v1.9M1.8 8h1.9M12.3 8h1.9M3.7 3.7l1.3 1.3M11 11l1.3 1.3M12.3 3.7L11 5M5 11l-1.3 1.3" />
  </svg>
);

export const IconX = ({ size = 12, ...p }: P) => (
  <svg {...base(size)} strokeWidth={1.8} {...p}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </svg>
);

export const IconChevronLeft = ({ size = 13, ...p }: P) => (
  <svg {...base(size)} strokeWidth={1.7} {...p}>
    <path d="M9.6 3.4L5 8l4.6 4.6" />
  </svg>
);

export const IconChevronRight = ({ size = 14, ...p }: P) => (
  <svg {...base(size)} strokeWidth={1.7} {...p}>
    <path d="M6.2 3.4L10.8 8l-4.6 4.6" />
  </svg>
);

export const IconChevronDown = ({ size = 11, ...p }: P) => (
  <svg {...base(size)} strokeWidth={2} {...p}>
    <path d="M4 6.4L8 10.2l4-3.8" />
  </svg>
);

export const IconCheck = ({ size = 11, ...p }: P) => (
  <svg {...base(size)} strokeWidth={2.4} {...p}>
    <path d="M3 8.4l3.2 3.2L13 4.8" />
  </svg>
);

export const IconCopy = ({ size = 13, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <rect x="5.4" y="5.4" width="8.2" height="8.2" rx="1.4" />
    <path d="M10.6 5.4V3.8c0-.8-.6-1.4-1.4-1.4H3.8c-.8 0-1.4.6-1.4 1.4v5.4c0 .8.6 1.4 1.4 1.4h1.6" />
  </svg>
);

export const IconLock = ({ size = 13, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <rect x="3.2" y="7" width="9.6" height="6.6" rx="1.4" />
    <path d="M5.4 7V5.2a2.6 2.6 0 015.2 0V7" />
  </svg>
);

export const IconStop = ({ size = 13, ...p }: P) => (  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden {...p}>
    <rect x="3.6" y="3.6" width="8.8" height="8.8" rx="1.4" />
  </svg>
);

export const IconDots = ({ size = 14, ...p }: P) => (
  <svg {...base(size)} strokeWidth={1.6} {...p}>
    <path d="M3 8h.01M8 8h.01M13 8h.01" strokeLinecap="round" />
  </svg>
);

export const IconFolder = ({ size = 14, ...p }: P) => (
  <svg {...base(size)} strokeWidth={1.5} {...p}>
    <path d="M2 4.6c0-.7.6-1.2 1.2-1.2h2.9l1.4 1.6h4.3c.7 0 1.2.5 1.2 1.2v5.4c0 .7-.5 1.2-1.2 1.2H3.2c-.6 0-1.2-.5-1.2-1.2z" strokeLinejoin="round" />
  </svg>
);

export const IconRefresh = ({ size = 14, ...p }: P) => (
  <svg {...base(size)} strokeWidth={1.5} {...p}>
    <path d="M13.2 7.2a5.2 5.2 0 10-1.6 4.1" strokeLinecap="round" />
    <path d="M13.6 3.2v4.2h-4.2" strokeLinejoin="round" />
  </svg>
);

export const IconImage = ({ size = 14, ...p }: P) => (
  <svg {...base(size)} strokeWidth={1.5} {...p}>
    <rect x="2.2" y="3" width="11.6" height="10" rx="1.6" />
    <circle cx="6" cy="6.6" r="1.1" />
    <path d="M3 11.6l3.2-2.8 2.4 2.1 2.2-2.2 2.2 2.4" strokeLinejoin="round" />
  </svg>
);

export const IconTag = ({ size = 14, ...p }: P) => (
  <svg {...base(size)} strokeWidth={1.5} {...p}>
    <path d="M2.6 8.2V3.4c0-.5.4-.9.9-.9h4.8l5 5-5.6 5.6z" strokeLinejoin="round" />
    <circle cx="5.6" cy="5.6" r=".9" />
  </svg>
);

export const IconKey = ({ size = 14, ...p }: P) => (
  <svg {...base(size)} strokeWidth={1.5} {...p}>
    <circle cx="5.4" cy="10.6" r="2.6" />
    <path d="M7.3 8.7l6-6M10.6 2.7l2.4 2.4M9.3 5.2l1.9 1.9" strokeLinecap="round" />
  </svg>
);

export const IconTrash = ({ size = 14, ...p }: P) => (
  <svg {...base(size)} strokeWidth={1.5} {...p}>
    <path d="M2.8 4.6h10.4M6 4.6V3.4c0-.5.4-.9.9-.9h2.2c.5 0 .9.4.9.9v1.2M4.4 4.6l.6 7.6c0 .6.5 1 1 1h4c.6 0 1-.4 1-1l.6-7.6" strokeLinejoin="round" />
  </svg>
);

export const IconEyeOff = ({ size = 14, ...p }: P) => (
  <svg {...base(size)} strokeWidth={1.5} {...p}>
    <path d="M2 8s2.2-3.6 6-3.6S14 8 14 8s-2.2 3.6-6 3.6S2 8 2 8z" strokeLinejoin="round" />
    <path d="M3.4 3.4l9.2 9.2" strokeLinecap="round" />
  </svg>
);

export const IconEye = ({ size = 14, ...p }: P) => (
  <svg {...base(size)} strokeWidth={1.5} {...p}>
    <path d="M2 8s2.2-3.6 6-3.6S14 8 14 8s-2.2 3.6-6 3.6S2 8 2 8z" strokeLinejoin="round" />
    <circle cx="8" cy="8" r="1.7" />
  </svg>
);

export const IconDownload = ({ size = 14, ...p }: P) => (
  <svg {...base(size)} strokeWidth={1.5} {...p}>
    <path d="M8 2.6v7.2M5 7l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2.8 12.4h10.4" strokeLinecap="round" />
  </svg>
);

export const IconMonitor = ({ size = 14, ...p }: P) => (
  <svg {...base(size)} strokeWidth={1.5} {...p}>
    <rect x="1.9" y="2.9" width="12.2" height="8.2" rx="1.4" />
    <path d="M5.6 13.4h4.8M8 11.1v2.3" strokeLinecap="round" />
  </svg>
);

export const IconGamepad = ({ size = 14, ...p }: P) => (
  <svg {...base(size)} strokeWidth={1.5} {...p}>
    <path d="M4.4 4.4h7.2c1.5 0 2.7 1.3 2.5 2.8l-.5 3.6c-.2 1.2-1.5 1.8-2.5 1.1L9.6 10.6H6.4L4.9 11.9c-1 .8-2.3.1-2.5-1.1l-.5-3.6C1.7 5.7 2.9 4.4 4.4 4.4z" strokeLinejoin="round" />
    <path d="M4.8 6.6v1.6M4 7.4h1.6M11 7.2h.01M12 8.2h.01" strokeLinecap="round" />
  </svg>
);

export const IconSort = ({ size = 12, ...p }: P) => (
  <svg {...base(size)} strokeWidth={1.8} {...p}>
    <path d="M4 3.4v9.2M2 10.6l2 2 2-2M12 12.6V3.4M10 5.4l2-2 2 2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconInfo = ({ size = 14, ...p }: P) => (
  <svg {...base(size)} strokeWidth={1.5} {...p}>
    <circle cx="8" cy="8" r="6.2" />
    <path d="M8 7.2v4M8 4.9h.01" strokeLinecap="round" />
  </svg>
);

export const IconScan = ({ size = 14, ...p }: P) => (
  <svg {...base(size)} strokeWidth={1.5} {...p}>
    <path d="M2 5.6c0-.9.7-1.6 1.6-1.6h2.2L7.3 5.6h5.1c.9 0 1.6.7 1.6 1.6v4.2c0 .9-.7 1.6-1.6 1.6H3.6c-.9 0-1.6-.7-1.6-1.6z" strokeLinejoin="round" />
    <circle cx="8" cy="8.9" r="1.6" />
    <path d="M8 6.7v.5M8 10.6v.5M5.8 8.9h.5M9.7 8.9h.5" strokeLinecap="round" />
  </svg>
);

export const IconSteam = ({ size = 14, ...p }: P) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden {...p}>
    <path d="M8 1.4a6.6 6.6 0 00-6.57 6.02l3.53 1.46a1.87 1.87 0 011.06-.33h.09l1.57-2.27v-.03a2.5 2.5 0 112.5 2.5h-.06l-2.24 1.6v.08a1.87 1.87 0 11-3.73-.12L1.6 9.15A6.6 6.6 0 108 1.4zm-2.4 9.99a1.35 1.35 0 11.74-.43l-.95.43zm4.94-2.96a1.86 1.86 0 110-3.72 1.86 1.86 0 010 3.72z" />
  </svg>
);

export const IconEpic = ({ size = 14, ...p }: P) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden {...p}>
    <path d="M3 1.3h7.4L14 2.9v9.9l-2.5 1.9H3.7L1.6 13V3.4zM5.5 4.4v6.9h4.6v-1.4H7.3v-1.3h2.4V7.3H7.3V5.8h2.8V4.4z" />
  </svg>
);

export const IconSettings2 = IconSettings;

/* ─── 成就图标（24 视窗）─── */
type AP = SVGProps<SVGSVGElement> & { size?: number };

const aBase = (size: number): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  "aria-hidden": true,
});

const AGlyphs = [
  <g key="a">
    <circle cx="12" cy="12" r="7.6" />
    <path d="M12 7.4V12l3 1.8" />
  </g>,
  <g key="b">
    <path d="M12 3.4l2.5 5.3 5.7.75-4.2 4 1.08 5.65L12 16.4l-5.08 2.7L8 13.45l-4.2-4 5.7-.75z" strokeLinejoin="round" />
  </g>,
  <g key="c">
    <path d="M4.5 18.5V9L12 4.5 19.5 9v9.5z" strokeLinejoin="round" />
    <path d="M9.5 18.5v-5h5v5" />
  </g>,
  <g key="d">
    <path d="M5 19l5.5-11 3 6 2-3.5L19 19z" strokeLinejoin="round" />
  </g>,
  <g key="e">
    <rect x="4.5" y="4.5" width="15" height="15" rx="2.5" />
    <path d="M9 12l2.2 2.2L15.5 10" />
  </g>,
  <g key="f">
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 3.2v2.4M12 18.4v2.4M3.2 12h2.4M18.4 12h2.4" />
  </g>,
  <g key="g">
    <path d="M5.5 4.5h13v15l-6.5-3.4-6.5 3.4z" strokeLinejoin="round" />
  </g>,
  <g key="h">
    <circle cx="12" cy="12" r="7.7" />
    <circle cx="12" cy="12" r="2.6" />
  </g>,
  <g key="i">
    <path d="M7 4.5h10l-1.4 5.2a3.8 3.8 0 01-7.2 0z" strokeLinejoin="round" />
    <path d="M12 13.6v4.9M9 19.5h6" />
  </g>,
  <g key="j">
    <path d="M12 4.5v15M4.5 12h15" strokeLinecap="round" />
  </g>,
  <g key="k">
    <circle cx="12" cy="12" r="7.6" />
    <path d="M8.4 12h7.2" />
  </g>,
  <g key="l">
    <path d="M12 15.4c-3 0-5.2-2-5.2-4.4S9 6.6 12 6.6s5.2 2 5.2 4.4" strokeLinecap="round" />
    <circle cx="12" cy="15.4" r="1.2" />
  </g>,
  <g key="m">
    <path d="M12 5.4c4.2 0 7.4 3 8.4 6.6-1 3.6-4.2 6.6-8.4 6.6s-7.4-3-8.4-6.6c1-3.6 4.2-6.6 8.4-6.6z" />
    <path d="M9.6 9.6l4.8 4.8M14.4 9.6l-4.8 4.8" />
  </g>,
];

export const IconAch = ({ size = 20, index = 0, ...p }: AP & { index?: number }) => (
  <svg {...aBase(size)} {...p}>
    {AGlyphs[index % AGlyphs.length]}
  </svg>
);

export type GlyphPattern = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export function glyphStyle(pattern: GlyphPattern): CSSProperties {
  switch (pattern) {
    case 1:
      return {
        backgroundImage:
          "repeating-radial-gradient(circle at 32% 26%, rgba(255,255,255,.45) 0 1px, transparent 1px 13px)",
      };
    case 2:
      return {
        backgroundImage:
          "repeating-linear-gradient(116deg, rgba(255,255,255,.40) 0 1.5px, transparent 1.5px 10px)",
      };
    case 3:
      return {
        backgroundImage:
          "radial-gradient(circle at 70% 66%, rgba(255,255,255,.55) 0 24px, transparent 25px), radial-gradient(circle at 70% 66%, transparent 0 38px, rgba(255,255,255,.22) 39px, transparent 40px)",
      };
    case 4:
      return {
        backgroundImage:
          "conic-gradient(from 196deg at 50% 112%, rgba(255,255,255,.36) 0 20deg, transparent 20deg 36deg)",
      };
    case 5:
      return {
        backgroundImage: "radial-gradient(rgba(255,255,255,.45) 1px, transparent 1.4px)",
        backgroundSize: "11px 11px",
      };
    case 6:
      return {
        backgroundImage: "repeating-linear-gradient(90deg, rgba(255,255,255,.36) 0 3px, transparent 3px 9px)",
        maskImage: "linear-gradient(0deg, transparent 4%, #000 92%)",
        WebkitMaskImage: "linear-gradient(0deg, transparent 4%, #000 92%)",
      };
    case 7:
      return {
        backgroundImage:
          "linear-gradient(52deg, transparent 44%, rgba(255,255,255,.35) 44% 45%, transparent 45%), linear-gradient(52deg, transparent 62%, rgba(255,255,255,.2) 62% 62.6%, transparent 62.6%)",
      };
    case 8:
    default:
      return {
        backgroundImage:
          "repeating-conic-gradient(from 0deg at 20% 80%, rgba(255,255,255,.3) 0 6deg, transparent 6deg 16deg)",
      };
  }
}

export function patternFor(id: string): GlyphPattern {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 8;
  return ((h % 8) + 1) as GlyphPattern;
}
