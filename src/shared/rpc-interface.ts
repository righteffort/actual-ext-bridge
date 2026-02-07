import type {
  Transaction,
  ImportTransaction,
  Account,
  BridgeState,
} from "../types";

/**
 * RPC interface exposed by InjectedActual to LocalBridge
 */
export interface InjectedActualRpc {
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
  updateTransaction(
    transaction: Transaction,
    subtransactions?: Transaction[],
    field?: string,
  ): Promise<void>;

  /**
   * Create a new transaction
   */
  createTransaction(payload: ImportTransaction): Promise<void>;
}

/**
 * RPC interface exposed by LocalBridge to InjectedActual
 */
export interface ContentScriptRpc {
  /**
   * Called on state changes (navigation, connection status, etc.)
   */
  onStateUpdate(state: BridgeState): Promise<void>;

  /**
   * Called when InjectedActual is ready
   */
  handshake(): Promise<{ success: boolean }>;
}

/**
 * Constants used to tag RPC messages, in order to avoid routing loops.
 */
export const CONTENT_SCRIPT_RPC_TAG = "CONTENT_SCRIPT";
export const INJECTED_RPC_TAG = "INJECTED";
