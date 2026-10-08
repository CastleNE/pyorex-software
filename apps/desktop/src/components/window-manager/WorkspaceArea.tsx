import { forwardRef, useImperativeHandle, useRef, useState, type ReactNode } from "react";
import FloatingWindow from "@/components/window-manager/FloatingWindow";
import type { ToolWindowDescriptor, WorkspaceAreaHandle } from "@/components/window-manager/types";

interface OpenWindowState extends ToolWindowDescriptor {
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  minimized: boolean;
}

interface Props {
  emptyState?: ReactNode;
  /** Windows float over the content below (transparent, click-through layer) instead of an own canvas. */
  overlay?: boolean;
  /** Optional strip pinned above the windows layer, always visible regardless of open-window count. */
  banner?: ReactNode;
}

const DEFAULT_POS = { x: 24, y: 24, width: 480, height: 360 };
const CASCADE_OFFSET = 28;

/**
 * Single window-manager instance shared by DATA and Data Analysis — each
 * screen mounts its OWN <WorkspaceArea>, so their open-window sets never mix
 * (a Calculated Column window opened from DATA must not appear in Data
 * Analysis, and vice versa).
 */
const WorkspaceArea = forwardRef<WorkspaceAreaHandle, Props>(function WorkspaceArea(
  { emptyState, banner, overlay = false },
  ref
) {
  const [windows, setWindows] = useState<OpenWindowState[]>([]);
  const zCounter = useRef(10);

  function bringToFront(id: string) {
    zCounter.current += 1;
    const z = zCounter.current;
    setWindows((prev) => prev.map((w) => (w.id === id ? { ...w, zIndex: z } : w)));
  }

  useImperativeHandle(ref, () => ({
    openWindow(descriptor) {
      setWindows((prev) => {
        if (prev.some((w) => w.id === descriptor.id)) {
          zCounter.current += 1;
          const z = zCounter.current;
          return prev.map((w) => (w.id === descriptor.id ? { ...w, minimized: false, zIndex: z } : w));
        }
        zCounter.current += 1;
        const idx = prev.length;
        const pos = descriptor.defaultPos ?? DEFAULT_POS;
        return [
          ...prev,
          {
            ...descriptor,
            x: pos.x + idx * CASCADE_OFFSET,
            y: pos.y + idx * CASCADE_OFFSET,
            width: pos.width,
            height: pos.height,
            zIndex: zCounter.current,
            minimized: false,
          },
        ];
      });
    },
    closeWindow(id) {
      setWindows((prev) => prev.filter((w) => w.id !== id));
    },
    focusWindow(id) {
      bringToFront(id);
    },
  }));

  const topZ = windows.reduce((max, w) => Math.max(max, w.zIndex), -Infinity);

  return (
    <div className={overlay ? "pointer-events-none absolute inset-0 z-20 overflow-hidden" : "flex flex-1 flex-col overflow-hidden bg-app"}>
      {banner}
      <div className={overlay ? "relative h-full w-full [&>*]:pointer-events-auto" : "px-canvas relative flex-1 overflow-hidden"}>
        {windows.length === 0 && emptyState}
        {windows.map((w) => (
          <FloatingWindow
            key={w.id}
            title={w.title}
            icon={w.icon}
            x={w.x}
            y={w.y}
            width={w.width}
            height={w.height}
            zIndex={w.zIndex}
            minimized={w.minimized}
            active={w.zIndex === topZ}
            onFocus={() => bringToFront(w.id)}
            onClose={() => setWindows((prev) => prev.filter((win) => win.id !== w.id))}
            onMinimizeToggle={() =>
              setWindows((prev) => prev.map((win) => (win.id === w.id ? { ...win, minimized: !win.minimized } : win)))
            }
            onDragStop={(x, y) =>
              setWindows((prev) => prev.map((win) => (win.id === w.id ? { ...win, x, y } : win)))
            }
            onResizeStop={(width, height, x, y) =>
              setWindows((prev) => prev.map((win) => (win.id === w.id ? { ...win, width, height, x, y } : win)))
            }
          >
            {w.render()}
          </FloatingWindow>
        ))}
      </div>
    </div>
  );
});

export default WorkspaceArea;
