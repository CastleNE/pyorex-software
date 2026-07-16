import type { ReactNode } from "react";

export interface ToolWindowDescriptor {
  id: string;
  title: string;
  icon?: string;
  defaultPos?: { x: number; y: number; width: number; height: number };
  render: () => ReactNode;
}

export interface WorkspaceAreaHandle {
  openWindow: (descriptor: ToolWindowDescriptor) => void;
  closeWindow: (id: string) => void;
  focusWindow: (id: string) => void;
}
