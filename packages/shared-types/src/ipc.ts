// JSON-RPC 2.0 types for Tauri ↔ Python communication

export interface RpcRequest<T = Record<string, unknown>> {
  jsonrpc: "2.0";
  method: string;
  params: T;
  id: string;
}

export interface RpcResponse<T = unknown> {
  jsonrpc: "2.0";
  result?: T;
  error?: RpcErrorPayload;
  id: string;
}

export interface RpcErrorPayload {
  code: number;
  message: string;
  data?: unknown;
}

// Standard RPC error codes
export const RPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // PyOrex custom errors (>= -32000)
  KMO_TOO_LOW: -32000,
  BARTLETT_FAILED: -32001,
  INSUFFICIENT_SAMPLES: -32002,
  MISSING_VARIABLES: -32003,
} as const;
