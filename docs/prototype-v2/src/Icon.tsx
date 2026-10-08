/**
 * PyOrex icon set — 1.5 px line icons on a 20 px grid, single ink
 * (currentColor). Same set as the design system's Icons group.
 * Usage: <PxIcon name="spectrum" className="h-4 w-4 text-brand" />
 */
import type { ReactElement } from "react";

const PATHS = {
  sun: <><circle cx="10" cy="10" r="3.5" /><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4" /></>,
  moon: <><path d="M16 12.5A6.5 6.5 0 0 1 7.5 4a6.5 6.5 0 1 0 8.5 8.5z" /></>,
  density: <><ellipse cx="10" cy="10" rx="7" ry="5" /><ellipse cx="10" cy="10" rx="4.2" ry="2.8" /><ellipse cx="10" cy="10" rx="1.5" ry="1" /></>,
  ellipse: <><ellipse cx="10" cy="10" rx="7.5" ry="4" transform="rotate(-30 10 10)" /><circle cx="10" cy="10" r=".9" fill="currentColor" /></>,
  hull: <><path d="M3 12 7 4l8 2 2 8-7 3z" /><circle cx="8" cy="10" r=".9" fill="currentColor" /><circle cx="12" cy="9" r=".9" fill="currentColor" /></>,
  regression: <><path d="M3 16 17 5" /><circle cx="5" cy="12" r=".9" fill="currentColor" /><circle cx="9" cy="12" r=".9" fill="currentColor" /><circle cx="12" cy="7" r=".9" fill="currentColor" /><circle cx="15" cy="9" r=".9" fill="currentColor" /></>,
  grid: <><path d="M3 3h14v14H3zM3 8h14M3 12.5h14M8 3v14M12.5 3v14" /></>,
  legend: <><rect x="3" y="4" width="3" height="3" rx=".6" /><rect x="3" y="9" width="3" height="3" rx=".6" /><rect x="3" y="14" width="3" height="3" rx=".6" /><path d="M9 5.5h8M9 10.5h8M9 15.5h6" /></>,
  marginal: <><path d="M3 17h11V6" /><path d="M5 4h2v-1.5M8 4h2V1.5M11 4h2V2.5" /><path d="M16 15h1.5M16 12h3M16 9h2" /></>,
  pointer: <><path d="M5 3l10 6-4.5 1.5L13 16l-2 1-2.5-5.5L5 15z" /></>,
  box: <><rect x="3.5" y="4.5" width="13" height="11" rx="1" strokeDasharray="2.5 2" /></>,
  up: <><path d="M5 12.5 10 7.5l5 5" /></>,
  down: <><path d="M5 7.5 10 12.5l5-5" /></>,
  max: <><rect x="4" y="4" width="12" height="12" rx="1.5" /></>,
  min: <><path d="M5 10h10" /></>,
  palette: <><path d="M10 3a7 7 0 1 0 0 14c1.2 0 1.5-.8 1.2-1.6-.4-1 .2-2 1.3-2H15a3 3 0 0 0 2-3C17 6 14 3 10 3z" /><circle cx="6.5" cy="9" r="1" fill="currentColor" /><circle cx="9" cy="6" r="1" fill="currentColor" /><circle cx="13" cy="6.5" r="1" fill="currentColor" /></>,
  shapes: <><circle cx="6" cy="6" r="3" /><rect x="11" y="3" width="6" height="6" rx=".5" /><path d="M6 11l3.5 6h-7zM14 11l3 3-3 3-3-3z" /></>,
  size: <><circle cx="5" cy="14" r="2" /><circle cx="13" cy="10" r="5" /></>,
  anomaly: <><path d="M2.5 14.5l3-3 2.5 2 3.5-7 2.5 4 3.5-2.5" /><circle cx="11.5" cy="6.5" r="2.3" /></>,
  check: <><path d="M4 10.5l3.5 3.5L16 5.5" /></>,
  cipw: <><circle cx="10" cy="10" r="6.5" /><path d="M10 10V3.5M10 10l5.6 3.3" /></>,
  classify: <><path d="M3 3.5h6.5l7.5 7.5-6 6-8-8z" /><circle cx="6.8" cy="7" r="1.2" /></>,
  clean: <><path d="M4 16.5 11 9.5M12.5 3l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9zM15.5 11l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5z" /></>,
  close: <><path d="M5.5 5.5l9 9M14.5 5.5l-9 9" /></>,
  code: <><path d="M7 6 3 10l4 4M13 6l4 4-4 4M11.2 4 8.8 16" /></>,
  cube: <><path d="M10 2.8l6.3 3.6v7.2L10 17.2l-6.3-3.6V6.4zM10 10v7.2M3.7 6.4 10 10l6.3-3.6" /></>,
  dock: <><rect x="3" y="4" width="14" height="12" rx="1.5" /><path d="M12 4v12" /></>,
  drill: <><path d="M10 2.5v15M7 5h6M7 9h6M7 13h6" /></>,
  export: <><path d="M10 12.5V3M6.5 6.5 10 3l3.5 3.5M3 11.5v5h14v-5" /></>,
  eye: <><path d="M2.5 10s2.8-5 7.5-5 7.5 5 7.5 5-2.8 5-7.5 5-7.5-5-7.5-5z" /><circle cx="10" cy="10" r="2.2" /></>,
  feature: <><path d="M2.5 6h4c1.5 0 2 7 3.5 7s2-7 3.5-7h4" /><path d="M10 15.5v1.5"  /></>,
  filter: <><path d="M3 4.5h14l-5.5 6.2V16l-3-1.4v-3.9z" /></>,
  history: <><path d="M3.5 10a6.5 6.5 0 1 0 2-4.7M3.5 3v3.5H7M10 6.5V10l2.5 1.8" /></>,
  import: <><path d="M10 3v9M6.5 8.5 10 12l3.5-3.5M3 13v3.5h14V13" /></>,
  label: <><path d="M4 5h12M4 10h8M4 15h10" /></>,
  lasso: <><path d="M10 4c4 0 7 2 7 4.5S14 13 10 13 3 11 3 8.5 6 4 10 4z" /><path d="M6.5 12.3c-1.2 1.6-.5 3.6 1.8 4.4" /></>,
  layers: <><path d="M10 3l7 4-7 4-7-4zM3 11l7 4 7-4" /></>,
  library: <><path d="M4 3.5v13M7.5 3.5v13M11 4.2l3.6 12.3M3 16.5h14" /></>,
  log: <><path d="M3 3v14h14" /><path d="M5.5 14c3 0 3.5-8 11-9" /></>,
  magnet: <><path d="M5 3.5v6.5a5 5 0 0 0 10 0V3.5h-3.2V10a1.8 1.8 0 0 1-3.6 0V3.5zM5 6.5h3.2M11.8 6.5H15" /></>,
  map: <><path d="M10 17.5s-5-4.7-5-9a5 5 0 0 1 10 0c0 4.3-5 9-5 9z" /><circle cx="10" cy="8.5" r="1.8" /></>,
  mineral: <><path d="M6 3.5h8l3 4.5-7 8.5L3 8z" /><path d="M3 8h14M8 3.5 10 16.5 12 3.5" /></>,
  more: <><circle cx="5" cy="10" r=".9" fill="currentColor" /><circle cx="10" cy="10" r=".9" fill="currentColor" /><circle cx="15" cy="10" r=".9" fill="currentColor" /></>,
  norm: <><path d="M3 16.5h14M5 16.5V9M10 16.5V5M15 16.5V11" /><path d="M3 4.5h14" strokeDasharray="2 2" /></>,
  pan: <><path d="M10 2.5v15M2.5 10h15M10 2.5 8 4.5M10 2.5l2 2M10 17.5l-2-2M10 17.5l2-2M2.5 10l2-2M2.5 10l2 2M17.5 10l-2-2M17.5 10l-2 2" /></>,
  pca: <><path d="M3 10h14M10 3v14" /><path d="M10 10l4.5-4M10 10 6 5.5M10 10l3 4.5" /></>,
  play: <><path d="M6.5 4.5v11l9-5.5z" /></>,
  plus: <><path d="M10 4v12M4 10h12" /></>,
  project: <><path d="M3 6.5V15a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 17 15V8a1.5 1.5 0 0 0-1.5-1.5H10L8.5 4.5h-4A1.5 1.5 0 0 0 3 6z" /></>,
  scatter: <><path d="M3.5 3v13.5H17" /><circle cx="7" cy="12" r="1.1" fill="currentColor" /><circle cx="9.5" cy="9" r="1.1" fill="currentColor" /><circle cx="13" cy="10.5" r="1.1" fill="currentColor" /><circle cx="14.5" cy="6" r="1.1" fill="currentColor" /></>,
  search: <><circle cx="8.8" cy="8.8" r="5.3" /><path d="M17 17l-4.3-4.3" /></>,
  sliders: <><path d="M4 5h12M4 10h12M4 15h12" /><circle cx="7" cy="5" r="1.6" fill="var(--bg-raised)" /><circle cx="13" cy="10" r="1.6" fill="var(--bg-raised)" /><circle cx="9" cy="15" r="1.6" fill="var(--bg-raised)" /></>,
  spectrum: <><path d="M2.5 12c1.5 0 2-5 3.5-5s2 8 3.5 8 2-11 3.5-11 2 8 4.5 8" /></>,
  spider: <><path d="M3 3v13.5h14.5" /><path d="M5 6.5l2.5 1.5 2.5-.5 2 3 2 .5 2 2" /></>,
  splice: <><path d="M3 13c2-4 4-5 6-5M11 10c2 0 4-1 6-4" /><path d="M10 3v14" strokeDasharray="1.5 2" /></>,
  stats: <><path d="M4.5 16v-5M8.5 16V6M12.5 16V9M16.5 16V4M3 16.5h14.5" /></>,
  table: <><rect x="3" y="4" width="14" height="12" rx="1.5" /><path d="M3 8h14M3 12h14M8 8v8" /></>,
  tas: <><path d="M3 3v13.5h14.5M6.5 16.5 9 11l3-2 4.5-5M10 16.5l2-3.5 5-3.5" /></>,
  ternary: <><path d="M10 3.5 17 16H3z" /><circle cx="10.5" cy="11.5" r="1.2" fill="currentColor" /></>,
  units: <><path d="M4 7h10l-3-3M16 13H6l3 3" /></>,
  warn: <><path d="M10 3.5 17.5 16h-15zM10 8.5v3.5M10 14.2v.1" /></>,
  zoom: <><circle cx="8.8" cy="8.8" r="5.3" /><path d="M17 17l-4.3-4.3M6.5 8.8h4.6M8.8 6.5v4.6" /></>,
} satisfies Record<string, ReactElement>;

export type PxIconName = keyof typeof PATHS;

export function isPxIconName(name: string | undefined): name is PxIconName {
  return !!name && Object.prototype.hasOwnProperty.call(PATHS, name);
}

export default function Icon({ name, size = 18, className = "", title }: { name: PxIconName; size?: number; className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
      className={`pxi ${className}`} style={{ width: size, height: size, flex: "none" }} aria-hidden={title ? undefined : true} role={title ? "img" : undefined}>
      {title && <title>{title}</title>}
      {PATHS[name]}
    </svg>
  );
}
