/**
 * Core type definitions for the Actual Budget Bridge.
 */

export interface Transaction {
  id: string; // UUID
  is_parent?: boolean;
  is_child?: boolean;
  parent_id?: string; // UUID
  account: string; // UUID
  category?: string; // UUID
  amount: number; // integer
  payee?: string; // UUID
  notes?: string;
  date: string; // YYYY-MM-DD
  imported_id?: string;
  imported_payee?: string;
  cleared?: boolean;
  reconciled?: boolean;
  subtransactions?: Transaction[];
}

export interface ImportTransaction {
  account: string;
  date: string;
  amount?: number;
  payee?: string;
  payee_name?: string;
  imported_payee?: string;
  category?: string;
  notes?: string;
  imported_id?: string;
  cleared?: boolean;
  subtransactions?: {
    amount: number;
    category?: string;
    notes?: string;
  }[];
}

export type AccountsEnum =
  | "SINGLE_ACCOUNT"
  | "ALL_ACCOUNTS"
  | "ON_BUDGET_ACCOUNTS"
  | "OFF_BUDGET_ACCOUNTS"
  | "UNKNOWN";
export type BridgeContext =
  | { type: "SINGLE_ACCOUNT"; accountId: string }
  | {
      type: "ALL_ACCOUNTS" | "OFF_BUDGET_ACCOUNTS" | "ON_BUDGET_ACCOUNTS";
      accountId: null;
    }
  | { type: "UNKNOWN"; accountId: null };

export interface Account {
  id: string;
  name: string;
}

/**
 * LIGHTWEIGHT state snapshot.
 * Does NOT contain the full lists of transactions or accounts.
 */
export interface BridgeState {
  connected: boolean;
  context: BridgeContext;
}

/**
 * Shared interface for both Local (Content Script) and Remote (Background/UI) bridges.
 */
export interface ActualBridge {
  connect(config: { baseUrl: string }): Promise<void>;

  getTransactions(
    predicate?: (t: Transaction) => boolean,
  ): Promise<Transaction[]>;

  getAccounts(): Promise<Account[]>;

  getAccountByName(name: string): Promise<Account | null>;

  updateTransaction(transaction: Transaction): Promise<void>;

  createTransaction(payload: ImportTransaction): Promise<void>;

  splitTransaction(
    originalTx: Transaction,
    splits: Partial<Transaction>[],
  ): Promise<void>;

  subscribe(callback: (state: BridgeState) => void): () => void;

  state(): BridgeState;

  disconnect?(): void; // Optional on RemoteBridge usually, but good to have
}
