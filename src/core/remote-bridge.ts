import type {
  BridgeState,
  ImportTransaction,
  Transaction,
  Account,
  ActualBridge,
} from "../types";

export class RemoteBridge implements ActualBridge {
  constructor(tabId?: number) {
    void tabId;
  }

  public async connect(config: { baseUrl: string }): Promise<void> {
    void config;
    return Promise.resolve();
  }

  public async getTransactions(
    predicate?: (t: Transaction) => boolean,
  ): Promise<Transaction[] | null> {
    void predicate;
    return Promise.resolve(null);
  }

  public async getAccounts(): Promise<Account[] | null> {
    return Promise.resolve(null);
  }

  public async getAccountByName(name: string): Promise<Account | null> {
    void name;
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

  public async splitTransaction(
    originalTx: Transaction,
    splits: Partial<Transaction>[],
  ): Promise<void> {
    void originalTx;
    void splits;
    return Promise.resolve();
  }

  public subscribe(callback: (state: BridgeState) => void): () => void {
    callback({
      connected: false,
      context: { type: "UNKNOWN", accountId: null },
    });
    return () => void 0;
  }

  public state(): BridgeState {
    return {
      connected: false,
      context: { type: "UNKNOWN", accountId: null },
    };
  }

  public disconnect(): void {
    // Stub
  }
}
