import { useEffect, useRef, type RefObject } from 'react';
import Plotly from 'plotly.js-dist-min';

/**
 * Keeps a Plotly chart sized to its container when the container changes size without a window resize (a panel
 * opening below it, a split being enlarged). Returns the ref to put on the container.
 */
export function usePlotResize(plot: RefObject<HTMLElement | null>) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let frame = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { if (plot.current?.isConnected) void Plotly.Plots.resize(plot.current); });
    });
    ro.observe(el);
    return () => { cancelAnimationFrame(frame); ro.disconnect(); };
  }, [plot]);
  return box;
}
