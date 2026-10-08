import type { ReactNode } from "react";
import { Rnd } from "react-rnd";
import PxIcon, { isPxIconName } from "@/components/PxIcon";

interface Props {
  title: string;
  /** A PxIcon name (preferred) or a short text glyph (legacy emoji). */
  icon?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  minimized: boolean;
  /** The front-most window: stronger shadow + accent line on the title bar. */
  active?: boolean;
  onFocus: () => void;
  onClose: () => void;
  onMinimizeToggle: () => void;
  onDragStop: (x: number, y: number) => void;
  onResizeStop: (width: number, height: number, x: number, y: number) => void;
  children: ReactNode;
}

const DRAG_HANDLE_CLASS = "pyorex-window-drag-handle";
const TITLE_BAR_HEIGHT = 34;

export default function FloatingWindow({
  title,
  icon,
  x,
  y,
  width,
  height,
  zIndex,
  minimized,
  active = false,
  onFocus,
  onClose,
  onMinimizeToggle,
  onDragStop,
  onResizeStop,
  children,
}: Props) {
  return (
    <Rnd
      // react-rnd injects an inline `display: inline-block`, which silently
      // defeated the `flex flex-col` class: the body never filled the window and
      // Plotly charts collapsed (0 px) or overflowed. Force flex inline.
      style={{ zIndex, display: "flex" }}
      position={{ x, y }}
      size={{ width, height: minimized ? TITLE_BAR_HEIGHT : height }}
      minWidth={280}
      minHeight={minimized ? TITLE_BAR_HEIGHT : 180}
      bounds="parent"
      dragHandleClassName={DRAG_HANDLE_CLASS}
      enableResizing={!minimized}
      onDragStart={onFocus}
      onDragStop={(_e, d) => onDragStop(d.x, d.y)}
      onResizeStart={onFocus}
      onResizeStop={(_e, _dir, ref, _delta, pos) =>
        onResizeStop(ref.offsetWidth, ref.offsetHeight, pos.x, pos.y)
      }
      className={`flex flex-col overflow-hidden rounded-lg border bg-panel ${
        active ? "border-line-strong shadow-window-active" : "border-line shadow-window"
      }`}
      onMouseDown={onFocus}
    >
      <div
        className={`${DRAG_HANDLE_CLASS} flex h-[34px] shrink-0 cursor-move select-none items-center gap-2 border-b border-line bg-raised pl-3 pr-1.5 ${
          active ? "shadow-[inset_0_2px_0_var(--color-accent)]" : ""
        }`}
      >
        {icon &&
          (isPxIconName(icon) ? (
            <PxIcon name={icon} className={`h-4 w-4 ${active ? "text-accent-fg" : "text-muted"}`} />
          ) : (
            <span className="text-xs">{icon}</span>
          ))}
        <span className={`flex-1 truncate text-[12.5px] font-semibold ${active ? "text-fg" : "text-muted"}`}>{title}</span>
        <button
          onClick={onMinimizeToggle}
          title={minimized ? "Restaurar" : "Minimizar"}
          aria-label={minimized ? "Restaurar" : "Minimizar"}
          className="flex h-6 w-6 items-center justify-center rounded text-xs text-muted hover:bg-hover hover:text-fg"
        >
          {minimized ? "▢" : "–"}
        </button>
        <button
          onClick={onClose}
          title="Cerrar"
          aria-label="Cerrar"
          className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-hover hover:text-danger"
        >
          <PxIcon name="close" className="h-3.5 w-3.5" />
        </button>
      </div>
      {!minimized && <div className="flex-1 overflow-hidden">{children}</div>}
    </Rnd>
  );
}
