/**
 * Core type definitions.
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
 * State snapshot.
 */
export interface BridgeState {
  connected: boolean;
  context: BridgeContext;
}

/**
 * Shared interface for both Local (Content Script) and Remote (Background/UI) bridges.
 */
export interface ActualBridge {
  getTransactions(
    predicate?: (t: Transaction) => boolean,
  ): Promise<Transaction[]>;

  getAccounts(): Promise<Account[]>;

  getAccountByName(name: string): Promise<Account | null>;

  updateTransaction(transaction: Transaction): Promise<void>;

  // Note: Doesn't support subtransactions.
  createTransaction(payload: ImportTransaction): Promise<void>;

  subscribe(callback: (state: BridgeState) => void): () => void;

  state(): Promise<BridgeState>;
}
