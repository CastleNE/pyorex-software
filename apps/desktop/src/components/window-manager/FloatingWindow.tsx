import type { ReactNode } from "react";
import { Rnd } from "react-rnd";

interface Props {
  title: string;
  icon?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  minimized: boolean;
  onFocus: () => void;
  onClose: () => void;
  onMinimizeToggle: () => void;
  onDragStop: (x: number, y: number) => void;
  onResizeStop: (width: number, height: number, x: number, y: number) => void;
  children: ReactNode;
}

const DRAG_HANDLE_CLASS = "pyorex-window-drag-handle";

export default function FloatingWindow({
  title,
  icon,
  x,
  y,
  width,
  height,
  zIndex,
  minimized,
  onFocus,
  onClose,
  onMinimizeToggle,
  onDragStop,
  onResizeStop,
  children,
}: Props) {
  return (
    <Rnd
      style={{ zIndex }}
      position={{ x, y }}
      size={{ width, height: minimized ? 34 : height }}
      minWidth={280}
      minHeight={minimized ? 34 : 180}
      bounds="parent"
      dragHandleClassName={DRAG_HANDLE_CLASS}
      enableResizing={!minimized}
      onDragStart={onFocus}
      onDragStop={(_e, d) => onDragStop(d.x, d.y)}
      onResizeStart={onFocus}
      onResizeStop={(_e, _dir, ref, _delta, pos) =>
        onResizeStop(ref.offsetWidth, ref.offsetHeight, pos.x, pos.y)
      }
      className="flex flex-col overflow-hidden rounded-md border border-zinc-700 bg-zinc-850 shadow-2xl"
      onMouseDown={onFocus}
    >
      <div
        className={`${DRAG_HANDLE_CLASS} flex shrink-0 select-none items-center gap-1.5 border-b border-zinc-700 bg-zinc-800 px-2.5 py-1.5 cursor-move`}
      >
        {icon && <span className="text-xs">{icon}</span>}
        <span className="flex-1 truncate text-xs font-medium text-zinc-300">{title}</span>
        <button
          onClick={onMinimizeToggle}
          title={minimized ? "Restore" : "Minimize"}
          className="flex h-5 w-5 items-center justify-center rounded text-xs text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200"
        >
          {minimized ? "▢" : "–"}
        </button>
        <button
          onClick={onClose}
          title="Close"
          className="flex h-5 w-5 items-center justify-center rounded text-xs text-zinc-500 hover:bg-zinc-700 hover:text-red-400"
        >
          ✕
        </button>
      </div>
      {!minimized && <div className="flex-1 overflow-hidden">{children}</div>}
    </Rnd>
  );
}
