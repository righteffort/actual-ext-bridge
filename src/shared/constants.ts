/**
 * Constants shared between the Guest (Main World) and Host (Isolated World).
 */

export const TARGET_ORIGIN_VAR = "__ACTUAL_BRIDGE_TARGET_ORIGIN__";
export const TEST_ORIGIN = "https://localhost";
export const SOURCE_GUEST = "actual-bridge-guest";
export const SOURCE_HOST = "actual-bridge-host";

export enum GuestMessageType {
  HANDSHAKE_ACK = "HANDSHAKE_ACK",
  STATE_UPDATE = "STATE_UPDATE",
  COMMAND_RESPONSE = "COMMAND_RESPONSE",
}

export enum HostMessageType {
  HANDSHAKE_INIT = "HANDSHAKE_INIT",
  GET_TRANSACTIONS = "GET_TRANSACTIONS",
  GET_ACCOUNTS = "GET_ACCOUNTS",
  SAVE_TRANSACTION = "SAVE_TRANSACTION",
  CREATE_TRANSACTION = "CREATE_TRANSACTION",
}

export interface BridgeMessage<T = unknown> {
  source: string;
  type: string;
  payload: T;
  id?: string;
}
