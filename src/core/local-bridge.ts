import { createBirpc } from "birpc";
import {
  BridgeConnectionError,
  BridgeContextError,
  BridgeDuplicateError,
  BridgeError,
} from "../errors";
import type {
  GuestRpcInterface,
  HostRpcInterface,
} from "../shared/rpc-interface";
import type {
  BridgeState,
  ImportTransaction,
  Transaction,
  Account,
  ActualBridge,
} from "../types";

// @ts-expect-error - The plugin creates this virtual module
import guestLogicScript from "./guest-logic.ts?inline-js";

export class LocalBridge implements ActualBridge {
  private internalState: BridgeState = {
    connected: false,
    context: { type: "UNKNOWN", accountId: null },
  };
  private listeners = new Set<(state: BridgeState) => void>();
  private baseUrl = "";
  private rpc: ReturnType<
    typeof createBirpc<GuestRpcInterface, HostRpcInterface>
  > | null = null;

  public async connect(config: { baseUrl: string }): Promise<void> {
    this.baseUrl = config.baseUrl;

    // Create RPC instance
    const hostRpc: HostRpcInterface = {
      onStateUpdate: async (state: BridgeState) => {
        this.internalState = state;
        this.notifyListeners();
      },
    };

    this.rpc = createBirpc<GuestRpcInterface, HostRpcInterface>(hostRpc, {
      post: (data) => window.postMessage(data, this.baseUrl),
      on: (fn) => {
        const handler = (event: MessageEvent) => {
          if (event.origin === this.baseUrl) {
            fn(event.data);
          }
        };
        window.addEventListener("message", handler);
        return () => window.removeEventListener("message", handler);
      },
    });

    // Inject guest script
    const script = document.createElement("script");
    script.textContent = guestLogicScript;
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);

    try {
      await this.rpc.handshake();
    } catch (e) {
      const details = e instanceof Error ? e.message : String(e);
      throw new BridgeConnectionError(
        `Handshake failed. Is the URL correct? ${details}`,
      );
    }
  }

  public subscribe(callback: (state: BridgeState) => void): () => void {
    this.listeners.add(callback);
    callback(this.internalState);
    return () => this.listeners.delete(callback);
  }

  public state(): BridgeState {
    return this.internalState;
  }

  /**
   * Fetches all transactions, optionally filtering them on the client side.
   */
  public async getTransactions(
    predicate?: (t: Transaction) => boolean,
  ): Promise<Transaction[]> {
    if (!this.rpc) throw new BridgeError("Not connected");

    const all = await this.rpc.getTransactions();
    if (predicate) {
      return all.filter(predicate);
    }
    return all;
  }

  public async getAccounts(): Promise<Account[]> {
    if (!this.rpc) throw new BridgeError("Not connected");

    return await this.rpc.getAccounts();
  }

  /**
   * Helper: Fetches all accounts and finds one by name (case-insensitive).
   */
  public async getAccountByName(name: string): Promise<Account | null> {
    const accounts = await this.getAccounts();
    if (!accounts) return null;
    return (
      accounts.find((a) => a.name.toLowerCase() === name.toLowerCase()) || null
    );
  }

  // TODO: support partial update!
  public async updateTransaction(transaction: Transaction): Promise<void> {
    if (!this.rpc) throw new BridgeError("Not connected");
    if (!transaction.id)
      throw new BridgeError("Transaction ID required for update.");

    await this.rpc.updateTransaction(transaction);
  }

  public async createTransaction(payload: ImportTransaction): Promise<void> {
    if (!this.rpc) throw new BridgeError("Not connected");
    if (!payload.account) {
      throw new BridgeContextError("Account ID is mandatory for creation.");
    }
    // Context check logic preserved
    if (
      this.internalState.context.type === "SINGLE_ACCOUNT" &&
      this.internalState.context.accountId !== payload.account
    ) {
      throw new BridgeContextError(
        `Current view (${this.internalState.context.accountId}) matches not target (${payload.account}).`,
      );
    }

    try {
      await this.rpc.createTransaction(payload);
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as Error & { code: string }).code === "DUPLICATE"
      ) {
        throw new BridgeDuplicateError(
          (error as Error & { importedId?: string }).importedId ||
            payload.imported_id ||
            "unknown",
        );
      }
      throw error;
    }
  }

  public async splitTransaction(
    _originalTx: Transaction,
    _splits: Partial<Transaction>[],
  ): Promise<void> {
    console.warn("splitTransaction not yet implemented");
    return Promise.resolve();
    // TODO: actually implement, something like this:
    // if (!originalTx.id) {
    //   throw new BridgeError("Original transaction ID is required for splitting.");
    // }

    // // Logic:
    // // 1. We construct a new transaction object based on the original.
    // // 2. We attach the 'subtransactions' array.
    // // 3. We call updateTransaction (which calls onSave internally).
    // // Actual Budget handles splits by updating the parent transaction's subtransactions field.

    // // Validate splits sum? Optional, but Actual handles validation usually.
    // // We just construct the payload.

    // const updatedTx: Transaction = {
    //   ...originalTx,
    //   is_parent: true, // Mark as parent
    //   subtransactions: splits as Transaction[], // Cast partials to full if backend accepts them, or we might need to merge defaults.
    //   // Note: Actual's onSave usually expects the full structure.
    //   // If splits are Partial, we might need to fill in gaps (like account/date from parent if missing).
    // };

    // // Fill in defaults for splits if missing
    // updatedTx.subtransactions = splits.map(split => ({
    //     ...split,
    //     // Inherit from parent if not specified
    //     account: split.account || originalTx.account,
    //     date: split.date || originalTx.date,
    //     // ID should be generated or exist. If new, it might be null/undefined?
    //     // Actual's internal logic usually handles new subtransactions if they lack IDs?
    //     // Or we should generate UUIDs.
    //     // For safety in this bridge, we assume the caller provided IDs or the backend handles it.
    // } as Transaction));

    // await this.updateTransaction(updatedTx);
  }

  public disconnect(): void {
    this.rpc = null;
    this.listeners.clear();
    this.internalState.connected = false;
  }

  private notifyListeners() {
    this.listeners.forEach((l) => l(this.internalState));
  }
}
