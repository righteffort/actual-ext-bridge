import {
  BridgeConnectionError,
  BridgeContextError,
  BridgeDuplicateError,
  BridgeError,
} from "../errors";
import {
  type BridgeMessage,
  GuestMessageType,
  HostMessageType,
  SOURCE_GUEST,
  SOURCE_HOST,
  TARGET_ORIGIN_VAR,
} from "../shared/constants";
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
  private pendingRequests = new Map<
    string,
    { resolve: (val: unknown) => void; reject: (err: unknown) => void }
  >();
  private baseUrl = "";

  constructor() {
    this.handleMessage = this.handleMessage.bind(this);
  }

  public async connect(config: { baseUrl: string }): Promise<void> {
    this.baseUrl = config.baseUrl;
    window.addEventListener("message", this.handleMessage);
    const scriptContent = (guestLogicScript as string).replace(
      TARGET_ORIGIN_VAR,
      this.baseUrl,
    );
    const script = document.createElement("script");
    script.textContent = scriptContent;
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);

    try {
      await this.send(HostMessageType.HANDSHAKE_INIT, {});
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

  // --- RPC Methods ---

  /**
   * Fetches all transactions, optionally filtering them on the client side.
   */
  public async getTransactions(
    predicate?: (t: Transaction) => boolean,
  ): Promise<Transaction[] | null> {
    const all = await this.send<Transaction[]>(
      HostMessageType.GET_TRANSACTIONS,
      {},
    );
    if (!all) return null;
    if (predicate) {
      return all.filter(predicate);
    }
    return all;
  }

  public async getAccounts(): Promise<Account[] | null> {
    const accounts = await this.send<Account[]>(
      HostMessageType.GET_ACCOUNTS,
      {},
    );
    return accounts || null;
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

  public async saveTransaction(transaction: Transaction): Promise<void> {
    if (!transaction.id)
      throw new BridgeError("Transaction ID required for save.");
    await this.send(HostMessageType.SAVE_TRANSACTION, transaction);
  }

  public async createTransaction(payload: ImportTransaction): Promise<void> {
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
      await this.send(HostMessageType.CREATE_TRANSACTION, payload);
    } catch (error: unknown) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code: string }).code === "DUPLICATE"
      ) {
        throw new BridgeDuplicateError(
          (error as { importedId?: string }).importedId ||
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
  }

  public disconnect(): void {
    window.removeEventListener("message", this.handleMessage);
    this.listeners.clear();
    this.internalState.connected = false;
  }

  private send<T>(type: HostMessageType, payload: unknown): Promise<T> {
    const id = crypto.randomUUID();
    const msg: BridgeMessage = {
      source: SOURCE_HOST,
      type,
      payload,
      id,
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new BridgeError("Request timed out"));
        }
      }, 5000);

      this.pendingRequests.set(id, {
        resolve: (val) => {
          clearTimeout(timeout);
          resolve(val as T);
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
      });
      window.postMessage(msg, this.baseUrl);
    });
  }

  private handleMessage(event: MessageEvent) {
    if (event.origin !== this.baseUrl) {
      return;
    }
    const data = event.data as BridgeMessage;
    if (!data || data.source !== SOURCE_GUEST) {
      return;
    }

    switch (data.type) {
      case GuestMessageType.STATE_UPDATE:
        this.internalState = data.payload as BridgeState;
        this.notifyListeners();
        break;

      case GuestMessageType.HANDSHAKE_ACK:
      case GuestMessageType.COMMAND_RESPONSE:
        if (data.id && this.pendingRequests.has(data.id)) {
          const request = this.pendingRequests.get(data.id);
          if (request) {
            const { resolve, reject } = request;
            this.pendingRequests.delete(data.id);
            const response = data.payload as {
              success: boolean;
              data?: unknown;
              error?: string;
              code?: string;
              importedId?: string;
            };

            if (response.success) {
              resolve(response.data);
            } else {
              if (response.code === "DUPLICATE") {
                const duplicateInfo = {
                  message: response.error,
                  code: "DUPLICATE",
                  importedId: response.importedId,
                };
                reject(duplicateInfo);
              } else {
                reject(new BridgeError(response.error || "Unknown error"));
              }
            }
          }
        }
        break;
    }
  }

  private notifyListeners() {
    this.listeners.forEach((l) => l(this.internalState));
  }
}
