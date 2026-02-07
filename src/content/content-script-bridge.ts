/**
 * Implementation of ActualBridge interface that runs in the content script.
 */

import browser from "webextension-polyfill";
import { createBirpc } from "birpc";
import {
  BridgeConnectionError,
  BridgeContextError,
  BridgeDuplicateError,
  BridgeError,
} from "../errors";
import {
  type InjectedActualRpc,
  type ContentScriptRpc,
  CONTENT_SCRIPT_RPC_TAG,
  INJECTED_RPC_TAG,
} from "../shared/rpc-interface";
import type {
  BridgeState,
  ImportTransaction,
  Transaction,
  Account,
  ActualBridge,
} from "../types";

export class ContentScriptBridge implements ActualBridge {
  private internalState: BridgeState = {
    connected: false,
    context: { type: "UNKNOWN", accountId: null },
  };
  private listeners = new Set<(state: BridgeState) => void>();
  private rpc: ReturnType<
    typeof createBirpc<InjectedActualRpc, ContentScriptRpc>
  > | null = null;

  public async connect(): Promise<void> {
    // Wait for injected-actual to signal it's ready
    let handshakeResolve: () => void;
    const handshakePromise = new Promise<void>((resolve, reject) => {
      handshakeResolve = resolve;
      setTimeout(() => {
        reject(
          new BridgeConnectionError(
            "injected-actual failed to initialize within timeout",
          ),
        );
      }, 5000);
    });

    const contentScriptRpc: ContentScriptRpc = {
      onStateUpdate: async (state: BridgeState) => {
        this.internalState = state;
        this.notifyListeners();
      },
      handshake: async () => {
        handshakeResolve();
        return { success: true };
      },
    };

    this.rpc = createBirpc<InjectedActualRpc, ContentScriptRpc>(
      contentScriptRpc,
      {
        post: (data) => {
          window.postMessage({ ...data, axbTarget: INJECTED_RPC_TAG });
        },
        on: (fn) => {
          const handler = (event: MessageEvent) => {
            if (event.origin === window.origin) {
              if (event?.data?.axbTarget === CONTENT_SCRIPT_RPC_TAG) {
                fn(event.data);
              }
            }
          };
          window.addEventListener("message", handler);
          return () => window.removeEventListener("message", handler);
        },
      },
    );

    // Inject the main world script
    // TODO: make parameterizable and plumb through from BridgeConnector.start
    const scriptUrl = browser.runtime.getURL("src/content/injected-actual.js");
    console.debug(`AXB: injecting script from ${scriptUrl}`);
    const script = document.createElement("script");
    script.src = scriptUrl;
    script.onload = function () {
      (this as HTMLScriptElement).remove();
    };
    (document.head || document.documentElement).appendChild(script);

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
    if (!this.rpc) throw new BridgeError("AXB: Not connected");
    const all = await this.rpc.getTransactions();
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
   * Fetches all accounts and finds one by name (case-insensitive).
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
    // TODO: we could be a little more permissive, e.g. if we're on
    // ALL_ACCOUNTS and the date range in the current view covers the
    // imported transactions.
    if (
      this.internalState.context.type !== "SINGLE_ACCOUNT" ||
      this.internalState.context.accountId !== payload.account
    ) {
      throw new BridgeContextError(
        `AXB: Current view (${this.internalState.context.accountId}) does not match target (${payload.account}).`,
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
    this.listeners.forEach((l) => l(this.internalState));
  }
}
