// Plugin System Types — matches Plugin API in CLAUDE.md

export type Capability =
  | "analytics:read"
  | "analytics:write"
  | "ui:panel"
  | "ui:toolbar"
  | "data:read"
  | "data:write"
  | "fs:read"
  | "fs:write"
  | "ipc:external"
  | "core:events"
  | "reports:generate";

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  minCoreVersion: string;
  description: string;
  author: string;
  capabilities: Capability[];
  ipcContracts: ContractRef[];
  registrations?: {
    panels?: PanelRegistration[];
    analysisTypes?: string[];
    chartTypes?: string[];
    dataConnectors?: string[];
  };
}

export interface ContractRef {
  method: string;
  version: string;
}

export interface PanelRegistration {
  id: string;
  title: string;
  icon: string;
}

export interface PluginContext {
  id: string;
  capabilities: Set<Capability>;
  eventBus: EventBus;
  logger: PluginLogger;
}

export interface Plugin {
  initialize(ctx: PluginContext): Promise<void>;
  activate(): Promise<void>;
  deactivate(): Promise<void>;
  onError?(error: Error): void;
}

export interface EventBus {
  emit(event: string, payload: unknown): void;
  on(event: string, handler: (payload: unknown) => void): () => void;
  off(event: string, handler: (payload: unknown) => void): void;
}

export interface PluginLogger {
  debug(msg: string, ...args: unknown[]): void;
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
}
