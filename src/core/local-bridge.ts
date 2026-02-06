import browser from "webextension-polyfill";
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

export class LocalBridge implements ActualBridge {
  private internalState: BridgeState = {
    connected: false,
    context: { type: "UNKNOWN", accountId: null },
  };
  private listeners = new Set<(state: BridgeState) => void>();
  private rpc: ReturnType<
    typeof createBirpc<GuestRpcInterface, HostRpcInterface>
  > | null = null;

  public async connect(): Promise<void> {
    // Wait for guest to signal it's ready
    let handshakeResolve: () => void;
    const handshakePromise = new Promise<void>((resolve, reject) => {
      handshakeResolve = resolve;
      setTimeout(() => {
        reject(
          new BridgeConnectionError(
            "Guest script failed to initialize within timeout",
          ),
        );
      }, 5000);
    });

    // Create RPC instance
    const hostRpc: HostRpcInterface = {
      onStateUpdate: async (state: BridgeState) => {
        this.internalState = state;
        this.notifyListeners();
      },
      handshake: async () => {
        handshakeResolve();
        return { success: true };
      },
    };

    console.log("AXB: host creating birpc...");
    this.rpc = createBirpc<GuestRpcInterface, HostRpcInterface>(hostRpc, {
      post: (data) => {
        console.debug(`AXB: host window.postMessage(${JSON.stringify(data)})`);
        window.postMessage({ ...data, axbTarget: "GUEST" }, "*"); // TODO: yikes!
      },
      on: (fn) => {
        const handler = (event: MessageEvent) => {
          //          if (event.data.m) {
          console.debug(
            `AXB: host received message event=${JSON.stringify(event)} event.data=${JSON.stringify(event.data)}`,
          );
          // }
          //          if (true || event.origin === window.origin) {  // TODO: yikes
          // if (event.data.m) {
          //   console.debug(
          //     `AXB: host received message event.data=${JSON.stringify(event.data)}`,
          //   );
          // }
          if (event?.data?.axbTarget === "HOST") {
            // TODO: ???
            fn(event.data);
          } else {
            console.debug(`AXB: host dropped ${JSON.stringify(event.data)}`);
          }
          //          }
        };
        window.addEventListener("message", handler);
        return () => window.removeEventListener("message", handler);
      },
    });
    console.log("AXB: .. host created birpc");

    // Inject the main world script
    // TODO: make parameterizable and plumb through from BridgeConnector.start
    const scriptUrl = browser.runtime.getURL("src/content/guest-logic.js");
    console.log(`AXB: injecting script from ${scriptUrl}`);
    const script = document.createElement("script");
    script.src = scriptUrl;
    script.onload = function () {
      (this as HTMLScriptElement).remove();
    };
    (document.head || document.documentElement).appendChild(script);

    // Wait for handshake
    try {
      await handshakePromise;
    } catch (e) {
      const details = e instanceof Error ? e.message : String(e);
      const msg = `Connection failed. Is the URL correct? ${details}`;
      console.warn(`AXB: ${msg}`);
      throw new BridgeConnectionError(`AXB: ${msg}`);
    }
  }

  public subscribe(callback: (state: BridgeState) => void): () => void {
    this.listeners.add(callback);
    callback(this.internalState);
    return () => this.listeners.delete(callback);
  }

  public state(): Promise<BridgeState> {
    return Promise.resolve(this.internalState);
  }

  /**
   * Fetches all transactions, optionally filtering them on the client side.
   */
  public async getTransactions(
    predicate?: (t: Transaction) => boolean,
  ): Promise<Transaction[]> {
    console.log("AXB: (host) getTransactions");
    if (!this.rpc) throw new BridgeError("AXB: Not connected");

    console.log(`AXB: this.rpc keys ${JSON.stringify(Object.keys(this.rpc))}`);
    const all = await this.rpc.getTransactions();
    console.log("AXB: (host) guest.getTransactions returned"); // not reached!
    if (predicate) {
      return all.filter(predicate);
    }
    return all;
  }

  public async getAccounts(): Promise<Account[]> {
    if (!this.rpc) throw new BridgeError("AXB: Not connected");

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
    if (!this.rpc) throw new BridgeError("AXB: Not connected");
    if (!transaction.id)
      throw new BridgeError("AXB: Transaction ID required for update.");

    await this.rpc.updateTransaction(transaction);
  }

  public async createTransaction(payload: ImportTransaction): Promise<void> {
    if (!this.rpc) throw new BridgeError("AXB: Not connected");
    if (!payload.account) {
      throw new BridgeContextError(
        "AXB: Account ID is mandatory for creation.",
      );
    }
    // Context check logic preserved
    if (
      this.internalState.context.type === "SINGLE_ACCOUNT" &&
      this.internalState.context.accountId !== payload.account
    ) {
      throw new BridgeContextError(
        `AXB: Current view (${this.internalState.context.accountId}) matches not target (${payload.account}).`,
      );
    }

    try {
      await this.rpc.createTransaction(payload);
    } catch (e) {
      if (
        e instanceof Error &&
        "code" in e &&
        (e as Error & { code: string }).code === "DUPLICATE"
      ) {
        throw new BridgeDuplicateError(
          (e as Error & { importedId?: string }).importedId ||
            payload.imported_id ||
            "unknown",
        );
      }
      throw e;
    }
  }

  public async splitTransaction(
    _originalTx: Transaction,
    _splits: Partial<Transaction>[],
  ): Promise<void> {
    console.warn("AXB: splitTransaction not yet implemented");
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
    console.debug(
      `AXB: local-bridge notifying ${this.listeners.size} listeners`,
    );
    this.listeners.forEach((l) => l(this.internalState));
  }
}
