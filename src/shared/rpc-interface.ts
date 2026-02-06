import type {
  Transaction,
  ImportTransaction,
  Account,
  BridgeState,
} from "../types";

/**
 * RPC interface for communication between LocalBridge (host) and guest-logic (guest).
 * The host calls these methods, and the guest implements them.
 */
export interface GuestRpcInterface {
  /**
   * Get all transactions from the current view
   */
  getTransactions(): Promise<Transaction[]>;

  /**
   * Get all accounts
   */
  getAccounts(): Promise<Account[]>;

  /**
   * Update an existing transaction
   */
  updateTransaction(transaction: Transaction): Promise<void>;

  /**
   * Create a new transaction
   */
  createTransaction(payload: ImportTransaction): Promise<void>;
}

/**
 * RPC interface for communication from guest to host.
 * The guest calls these methods, and the host implements them.
 */
export interface HostRpcInterface {
  /**
   * Called by guest when state changes (navigation, connection status, etc.)
   */
  onStateUpdate(state: BridgeState): Promise<void>;

  /**
   * Called by guest to signal it's ready for communication
   */
  handshake(): Promise<{ success: boolean }>;
}
