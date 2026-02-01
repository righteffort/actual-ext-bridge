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
import type { BridgeState, ImportTransaction, Transaction } from "../types";

// This import is handled by the custom Vite plugin.
// It resolves to a string containing the minified IIFE of guest-logic.ts.
// @ts-expect-error - The plugin creates this virtual module
import guestLogicScript from "./guest-logic.ts?inline-js";

/**
 * The Host-side bridge implementation running in the Content Script (Isolated World).
 * Manages the injection of the guest logic and proxies messages.
 */
export class LocalBridge {
  private internalState: BridgeState = {
    connected: false,
    context: { type: "UNKNOWN", accountId: null },
    transactions: null,
    accounts: null,
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

  /**
   * Establishes the connection to the Actual Budget Main World.
   * Injects the driver script.
   */
  public async connect(config: { baseUrl: string }): Promise<void> {
    if (this.baseUrl) {
      // Already connected or connecting, but we allow reconfiguration
      console.warn("LocalBridge: Re-connecting or already connected.");
    }
    this.baseUrl = config.baseUrl;

    // 1. Setup Listener
    window.addEventListener("message", this.handleMessage);

    // 2. Prepare Script
    // Replace the magic string with the actual authorized origin
    const scriptContent = (guestLogicScript as string).replace(
      TARGET_ORIGIN_VAR,
      this.baseUrl,
    );

    // 3. Inject
    const script = document.createElement("script");
    script.textContent = scriptContent;
    script.onload = () => script.remove(); // Clean up DOM
    (document.head || document.documentElement).appendChild(script);

    // 4. Wait for Handshake (optional, but good practice to verify)
    // We send an INIT message and wait for ACK.
    // However, the guest logic starts polling immediately.
    // We'll rely on the first state update or handshake ack.

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
    // Send current state immediately
    callback(this.internalState);
    return () => this.listeners.delete(callback);
  }

  public state(): BridgeState {
    return this.internalState;
  }

  public async getTransactions(): Promise<Transaction[] | null> {
    const response = await this.send<Transaction[]>(
      HostMessageType.GET_TRANSACTIONS,
      {},
    );
    return response || null;
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

    // We verify context match to avoid data corruption (writing to wrong account view)
    // Although the API allows writing to a specific account, the Guest Logic finds handlers
    // on the *current* view. If we are viewing Account A and try to write to Account B,
    // using the handlers from Account A's props might be dangerous or impossible.
    // For safety, we enforce that the View matches the Target Account.
    if (
      this.internalState.context.type === "SINGLE_ACCOUNT" &&
      this.internalState.context.accountId !== payload.account
    ) {
      // Ideally we would warn, but Actual's internal onAdd might handle it if the data is structured right.
      // However, strictly adhering to the "User's View" philosophy:
      throw new BridgeContextError(
        `Current view (Account ${this.internalState.context.accountId}) does not match target account (${payload.account}).`,
      );
    }

    try {
      await this.send(HostMessageType.CREATE_TRANSACTION, payload);
    } catch (error: unknown) {
      // Re-hydrate custom duplicate error
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
    // Not fully implemented in this pass, but structure is here
    // Logic would be: calculate diff, update originalTx.subtransactions, call saveTransaction
    console.warn("splitTransaction not yet implemented");
    return Promise.resolve();
  }

  public disconnect(): void {
    window.removeEventListener("message", this.handleMessage);
    this.listeners.clear();
    // We cannot easily "un-inject" the guest logic, but we stop listening.
    this.internalState.connected = false;
  }

  // ---------------------------------------------------------------------------
  // Internal Messaging
  // ---------------------------------------------------------------------------

  private send<T>(type: HostMessageType, payload: unknown): Promise<T> {
    const id = crypto.randomUUID();
    const msg: BridgeMessage = {
      source: SOURCE_HOST,
      type,
      payload,
      id,
    };

    return new Promise((resolve, reject) => {
      // Timeout safety
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

      // Send to Main World
      window.postMessage(msg, this.baseUrl);
    });
  }

  private handleMessage(event: MessageEvent) {
    if (event.origin !== this.baseUrl) return;
    const data = event.data as BridgeMessage;
    if (!data || data.source !== SOURCE_GUEST) return;

    switch (data.type) {
      case GuestMessageType.STATE_UPDATE:
        this.internalState = data.payload as BridgeState;
        this.notifyListeners();
        break;

      case GuestMessageType.HANDSHAKE_ACK:
      case GuestMessageType.COMMAND_RESPONSE:
        if (data.id && this.pendingRequests.has(data.id)) {
          // Use non-null assertion guard or simple if
          const request = this.pendingRequests.get(data.id);
          if (request) {
            const { resolve, reject } = request;
            this.pendingRequests.delete(data.id);

            // Reconstruct strict response shape
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
              // Reconstruct typed error if possible
              if (response.code === "DUPLICATE") {
                // Pass an object that mimics the error properties so the catch block
                // in createTransaction can reconstruct the class instance
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
