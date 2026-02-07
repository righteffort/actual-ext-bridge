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

    this.rpc = createBirpc<GuestRpcInterface, HostRpcInterface>(hostRpc, {
      post: (data) => {
        console.debug(`AXB: host window.postMessage(${JSON.stringify(data)})`);
        window.postMessage({ ...data, axbTarget: "GUEST" });
      },
      on: (fn) => {
        const handler = (event: MessageEvent) => {
          console.debug(
            `AXB: host received message event=${JSON.stringify(event)} event.data=${JSON.stringify(event.data)}`, // TODO: remove
          );
          if (event.origin === window.origin) {
            if (event?.data?.axbTarget === "HOST") {
              fn(event.data);
            } else {
              console.debug(`AXB: host dropped ${JSON.stringify(event.data)}`); // TODO: remove
            }
          }
        };
        window.addEventListener("message", handler);
        return () => window.removeEventListener("message", handler);
      },
    });

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

  public async updateTransaction(
    transaction: Transaction,
    field?: string,
  ): Promise<void> {
    if (!this.rpc) throw new BridgeError("AXB: Not connected");
    if (!transaction.id)
      throw new BridgeError("AXB: Transaction ID required for update.");
    if (transaction.subtransactions) {
      throw new BridgeError(
        "AXB: updateTransaction does not support subtransactions. Try splitTransaction",
      );
    }
    await this.rpc.updateTransaction(transaction, undefined, field);
  }

  public async splitTransaction(
    t: Transaction,
    subtransactions_in: Partial<Transaction>[],
  ): Promise<void> {
    if (!this.rpc) throw new BridgeError("AXB: Not connected");
    const subtransactions = subtransactions_in.map((s) => ({
      ...s,
      id: crypto.randomUUID(),
      is_child: true,
      parent_id: t.id,
      account: t.account,
      date: t.date,
      amount: s.amount || 0,
    }));
    await this.rpc.updateTransaction(
      { ...t, is_parent: true },
      subtransactions,
    );
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

  private notifyListeners() {
    console.debug(
      `AXB: local-bridge notifying ${this.listeners.size} listeners`,
    );
    this.listeners.forEach((l) => l(this.internalState));
  }
}
