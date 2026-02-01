import type { BridgeState, ImportTransaction, Transaction } from "../types";

/**
 * A proxy class for the Extension UI (Popup/Side Panel) to interact with
 * the library. It mimics the `LocalBridge` API but tunnels requests
 * through the Background script to the Content Script.
 */
export class RemoteBridge {
  /**
   * @param tabId The target tab ID to control. If omitted, uses the
   * current Master tab resolved by the Arbiter.
   */
  constructor(tabId?: number) {
    void tabId;
  }

  public async connect(config: { baseUrl: string }): Promise<void> {
    void config;
    return Promise.resolve();
  }

  public async getTransactions(): Promise<Transaction[] | null> {
    return Promise.resolve(null);
  }

  public async saveTransaction(transaction: Transaction): Promise<void> {
    void transaction;
    return Promise.resolve();
  }

  public async createTransaction(payload: ImportTransaction): Promise<void> {
    void payload;
    return Promise.resolve();
  }

  public subscribe(callback: (state: BridgeState) => void): () => void {
    // Stub: Emit default disconnected state once
    callback({
      connected: false,
      context: { type: "UNKNOWN", accountId: null },
      transactions: null,
      accounts: null,
    });
    return () => void 0;
  }

  public state(): BridgeState {
    return {
      connected: false,
      context: { type: "UNKNOWN", accountId: null },
      transactions: null,
      accounts: null,
    };
  }
}
