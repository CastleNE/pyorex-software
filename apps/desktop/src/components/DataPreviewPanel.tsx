/**
 * "Data Preview" — VS Code/QGIS-style dockable panel wrapping DataGrid.
 * Docked (default): normal flex child at the bottom of DataScreen's canvas,
 * resizable via a top splitter. Floating: position:absolute within
 * `containerRef`, movable/resizable from any edge, with magnetic snap-back
 * to docked when dropped near the bottom. Minimized: collapsed to the title
 * bar only. Closed: unmounted.
 *
 * The panel is ONE persistent component instance across all four states —
 * only inline style (position/x/y/width/height) changes, so `DataGrid`
 * itself is never remounted by a dock/undock/minimize transition. Its
 * sort/filter/heatmap already live in data-ops-store (survive remounts
 * regardless); this additionally preserves scroll position, TanStack column
 * widths, and the already-loaded page (no refetch flicker).
 */
import { useCallback, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type RefObject } from "react";
import DataGrid from "@/components/DataGrid";
import type { WorkspaceAreaHandle } from "@/components/window-manager/types";
import {
  useDataPreviewStore,
  MIN_DOCKED_HEIGHT,
  MIN_FLOATING_WIDTH,
  MIN_FLOATING_HEIGHT,
  DOCK_ZONE_PX,
  TITLE_BAR_HEIGHT,
  type FloatingRect,
} from "@/stores/data-preview-store";

interface Props {
  containerRef: RefObject<HTMLDivElement | null>;
  workspaceRef: RefObject<WorkspaceAreaHandle | null>;
  onDockZoneChange: (active: boolean) => void;
}

type ResizeDir = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const UNDOCK_THRESHOLD = 6;

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), Math.max(min, max));
}

export default function DataPreviewPanel({ containerRef, workspaceRef, onDockZoneChange }: Props) {
  const status = useDataPreviewStore((s) => s.status);
  const dockedHeight = useDataPreviewStore((s) => s.dockedHeight);
  const floatingRect = useDataPreviewStore((s) => s.floatingRect);
  const minimize = useDataPreviewStore((s) => s.minimize);
  const restore = useDataPreviewStore((s) => s.restore);
  const close = useDataPreviewStore((s) => s.close);
  const dock = useDataPreviewStore((s) => s.dock);
  const undock = useDataPreviewStore((s) => s.undock);
  const setDockedHeight = useDataPreviewStore((s) => s.setDockedHeight);
  const setFloatingRect = useDataPreviewStore((s) => s.setFloatingRect);

  // Live values during an active drag/resize gesture — bypass the store so
  // the panel tracks the cursor at full frame rate; committed on mouseup.
  const liveHeightRef = useRef<number | null>(null);
  const liveRectRef = useRef<FloatingRect | null>(null);
  const dockZoneActiveRef = useRef(false);
  const forceRender = useForceRender();

  if (status === "closed") return null;

  const isFloating = status === "floating";
  const isMinimized = status === "minimized";
  const effectiveDockedHeight = liveHeightRef.current ?? dockedHeight;
  const effectiveRect = liveRectRef.current ?? floatingRect;

  function getContainerSize() {
    const el = containerRef.current;
    return { width: el?.clientWidth ?? 0, height: el?.clientHeight ?? 0 };
  }

  function setDockZoneActive(active: boolean) {
    if (dockZoneActiveRef.current === active) return;
    dockZoneActiveRef.current = active;
    onDockZoneChange(active);
  }

  // ---- Splitter resize (docked only) ----
  function startSplitterDrag(e: ReactMouseEvent) {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = dockedHeight;
    const { height: containerHeight } = getContainerSize();

    function onMove(ev: MouseEvent) {
      const next = clamp(startHeight - (ev.clientY - startY), MIN_DOCKED_HEIGHT, containerHeight - 80);
      liveHeightRef.current = next;
      forceRender();
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      if (liveHeightRef.current !== null) setDockedHeight(liveHeightRef.current);
      liveHeightRef.current = null;
      forceRender();
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  // ---- Title bar drag: undock (while docked) or move (while floating) ----
  function startTitleBarDrag(e: ReactMouseEvent) {
    if (status === "docked") startUndockDrag(e);
    else if (status === "floating") startMoveDrag(e);
  }

  function startUndockDrag(e: ReactMouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const { width: containerWidth, height: containerHeight } = getContainerSize();
    const seed: FloatingRect = { x: 0, y: containerHeight - dockedHeight, width: containerWidth, height: dockedHeight };
    let undocked = false;

    function onMove(ev: MouseEvent) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!undocked) {
        if (Math.hypot(dx, dy) < UNDOCK_THRESHOLD) return;
        undocked = true;
        undock(seed);
      }
      const updated: FloatingRect = {
        ...seed,
        x: clamp(seed.x + dx, 0, Math.max(0, containerWidth - seed.width)),
        y: clamp(seed.y + dy, 0, Math.max(0, containerHeight - seed.height)),
      };
      liveRectRef.current = updated;
      setDockZoneActive(updated.y + updated.height >= containerHeight - DOCK_ZONE_PX);
      forceRender();
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      finishFloatingDrag();
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  function startMoveDrag(e: ReactMouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startRect = floatingRect;
    const { width: containerWidth, height: containerHeight } = getContainerSize();

    function onMove(ev: MouseEvent) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const updated: FloatingRect = {
        ...startRect,
        x: clamp(startRect.x + dx, 0, Math.max(0, containerWidth - startRect.width)),
        y: clamp(startRect.y + dy, 0, Math.max(0, containerHeight - startRect.height)),
      };
      liveRectRef.current = updated;
      setDockZoneActive(updated.y + updated.height >= containerHeight - DOCK_ZONE_PX);
      forceRender();
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      finishFloatingDrag();
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  function finishFloatingDrag() {
    const rect = liveRectRef.current;
    const shouldDock = dockZoneActiveRef.current;
    liveRectRef.current = null;
    setDockZoneActive(false);
    if (!rect) return;
    if (shouldDock) dock(rect.height);
    else setFloatingRect(rect);
    forceRender();
  }

  // ---- Floating resize (8 handles) ----
  function startResizeDrag(e: ReactMouseEvent, dir: ResizeDir) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startRect = floatingRect;
    const { width: containerWidth, height: containerHeight } = getContainerSize();

    function onMove(ev: MouseEvent) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      let { x, y, width, height } = startRect;

      if (dir.includes("e")) width = clamp(startRect.width + dx, MIN_FLOATING_WIDTH, containerWidth - startRect.x);
      if (dir.includes("s")) height = clamp(startRect.height + dy, MIN_FLOATING_HEIGHT, containerHeight - startRect.y);
      if (dir.includes("w")) {
        const clampedDx = clamp(dx, -startRect.x, startRect.width - MIN_FLOATING_WIDTH);
        x = startRect.x + clampedDx;
        width = startRect.width - clampedDx;
      }
      if (dir.includes("n")) {
        const clampedDy = clamp(dy, -startRect.y, startRect.height - MIN_FLOATING_HEIGHT);
        y = startRect.y + clampedDy;
        height = startRect.height - clampedDy;
      }

      liveRectRef.current = { x, y, width, height };
      forceRender();
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      if (liveRectRef.current) setFloatingRect(liveRectRef.current);
      liveRectRef.current = null;
      forceRender();
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  const style: CSSProperties = isFloating
    ? {
        position: "absolute",
        left: effectiveRect.x,
        top: effectiveRect.y,
        width: effectiveRect.width,
        height: isMinimized ? TITLE_BAR_HEIGHT : effectiveRect.height,
        zIndex: 100,
      }
    : {
        position: "relative",
        width: "100%",
        height: isMinimized ? TITLE_BAR_HEIGHT : effectiveDockedHeight,
        flexShrink: 0,
      };

  return (
    <div
      style={style}
      className={`flex flex-col overflow-hidden bg-zinc-850 ${
        isFloating ? "rounded-md border border-zinc-700 shadow-2xl" : "border-t border-zinc-700"
      }`}
    >
      {status === "docked" && (
        <div
          onMouseDown={startSplitterDrag}
          className="absolute -top-1 left-0 z-10 h-2 w-full cursor-row-resize"
          title="Drag to resize"
        />
      )}
      {isFloating && !isMinimized && <ResizeHandles onResizeStart={startResizeDrag} />}

      <div
        onMouseDown={startTitleBarDrag}
        className="flex shrink-0 select-none items-center gap-1.5 border-b border-zinc-700 bg-zinc-800 px-2.5 py-1.5 cursor-move"
      >
        <span className="text-xs">📋</span>
        <span className="flex-1 truncate text-xs font-medium text-zinc-300">Data Preview</span>
        <button
          onClick={() => (isMinimized ? restore() : minimize())}
          title={isMinimized ? "Restore" : "Minimize"}
          className="flex h-5 w-5 items-center justify-center rounded text-xs text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200"
        >
          {isMinimized ? "▢" : "–"}
        </button>
        <button
          onClick={close}
          title="Close"
          className="flex h-5 w-5 items-center justify-center rounded text-xs text-zinc-500 hover:bg-zinc-700 hover:text-red-400"
        >
          ✕
        </button>
      </div>

      {!isMinimized && (
        <div className="min-h-0 flex-1 overflow-hidden">
          <DataGrid workspaceRef={workspaceRef} />
        </div>
      )}
    </div>
  );
}

function ResizeHandles({ onResizeStart }: { onResizeStart: (e: ReactMouseEvent, dir: ResizeDir) => void }) {
  const edge = "absolute z-10";
  return (
    <>
      <div className={`${edge} inset-x-0 top-0 h-1.5 cursor-ns-resize`} onMouseDown={(e) => onResizeStart(e, "n")} />
      <div className={`${edge} inset-x-0 bottom-0 h-1.5 cursor-ns-resize`} onMouseDown={(e) => onResizeStart(e, "s")} />
      <div className={`${edge} inset-y-0 left-0 w-1.5 cursor-ew-resize`} onMouseDown={(e) => onResizeStart(e, "w")} />
      <div className={`${edge} inset-y-0 right-0 w-1.5 cursor-ew-resize`} onMouseDown={(e) => onResizeStart(e, "e")} />
      <div className={`${edge} left-0 top-0 h-2.5 w-2.5 cursor-nwse-resize`} onMouseDown={(e) => onResizeStart(e, "nw")} />
      <div className={`${edge} right-0 top-0 h-2.5 w-2.5 cursor-nesw-resize`} onMouseDown={(e) => onResizeStart(e, "ne")} />
      <div className={`${edge} bottom-0 left-0 h-2.5 w-2.5 cursor-nesw-resize`} onMouseDown={(e) => onResizeStart(e, "sw")} />
      <div className={`${edge} bottom-0 right-0 h-2.5 w-2.5 cursor-nwse-resize`} onMouseDown={(e) => onResizeStart(e, "se")} />
    </>
  );
}

// Drag/resize math writes into refs (not React state) so mousemove doesn't
// round-trip through the Zustand store on every frame; this ticks a dummy
// counter to force DataPreviewPanel to re-render and read the fresh ref.
function useForceRender() {
  const [, setTick] = useState(0);
  return useCallback(() => setTick((t) => t + 1), []);
}
