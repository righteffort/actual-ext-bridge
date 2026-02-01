/**
 * Core type definitions for the Actual Budget Bridge.
 * Aligns with actual-types.ts and api_reference_2.ts.
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
  // User correction: subtransactions is recursive Transaction[]
  subtransactions?: Transaction[];
}

/**
 * Represents a transaction object specifically for import/creation operations.
 */
export interface ImportTransaction {
  /** Required. The ID of the account this transaction belongs to */
  account: string; // UUID
  /** Required. Transaction date in YYYY-MM-DD format */
  date: string;
  /** Integer amount (e.g., $120.30 -> 12030) */
  amount?: number;
  /** UUID of existing payee */
  payee?: string;
  /** If given, a payee will be created/resolved with this name */
  payee_name?: string;
  /** Raw description for display purposes */
  imported_payee?: string;
  category?: string; // UUID
  notes?: string;
  /**
   * Arbitrary string for deduplication.
   * If omitted or blank, transaction will not be de-duped.
   */
  imported_id?: string;
  cleared?: boolean;
  subtransactions?: {
    amount: number;
    category?: string;
    notes?: string;
  }[];
}

export type BridgeContext =
  | { type: "SINGLE_ACCOUNT"; accountId: string }
  | { type: "ALL_ACCOUNTS"; accountId: null }
  | { type: "UNKNOWN"; accountId: null };

export interface Account {
  id: string;
  name: string;
}

export interface BridgeState {
  /** True if the driver is successfully hooked into React internals */
  connected: boolean;
  /** Details about the current view */
  context: BridgeContext;
  /** The list of transactions currently loaded in the UI */
  transactions: Transaction[] | null;
  /** Available accounts (if visible in the current view/props) */
  accounts: Account[] | null;
}
