/**
 * Constants shared between the Guest (Main World) and Host (Isolated World).
 */

// The magic variable used to inject the security origin
export const TARGET_ORIGIN_VAR = "__ACTUAL_BRIDGE_TARGET_ORIGIN__";

// Message event source identifiers
export const SOURCE_GUEST = "actual-bridge-guest";
export const SOURCE_HOST = "actual-bridge-host";

// Internal Message Types (Guest <-> Host)
export enum GuestMessageType {
  HANDSHAKE_ACK = "HANDSHAKE_ACK",
  STATE_UPDATE = "STATE_UPDATE",
  COMMAND_RESPONSE = "COMMAND_RESPONSE",
}

export enum HostMessageType {
  HANDSHAKE_INIT = "HANDSHAKE_INIT",
  GET_TRANSACTIONS = "GET_TRANSACTIONS",
  SAVE_TRANSACTION = "SAVE_TRANSACTION",
  CREATE_TRANSACTION = "CREATE_TRANSACTION",
}

// Internal Protocol for Guest <-> Host
export interface BridgeMessage<T = unknown> {
  source: string;
  type: string;
  payload: T;
  id?: string; // For Request/Response correlation
}
