import browser from "webextension-polyfill";
import {
  ARBITER_MESSAGE_TYPE,
  ArbiterMessageType,
  type ArbiterMessage,
} from "../background/arbiter";
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
    return this.proxyCall("connect", [config]);
  }

  public async getTransactions(
    predicate?: (t: Transaction) => boolean,
  ): Promise<Transaction[] | null> {
    const txs = await this.proxyCall<Transaction[] | null>(
      "getTransactions",
      [],
    );
    if (txs && predicate) {
      return txs.filter(predicate);
    }
    return txs;
  }

  public async getAccounts(): Promise<Account[] | null> {
    return this.proxyCall("getAccounts", []);
  }

  public async getAccountByName(name: string): Promise<Account | null> {
    return this.proxyCall("getAccountByName", [name]);
  }

  public async updateTransaction(transaction: Transaction): Promise<void> {
    return this.proxyCall("updateTransaction", [transaction]);
  }

  public async createTransaction(payload: ImportTransaction): Promise<void> {
    return this.proxyCall("createTransaction", [payload]);
  }

  public async splitTransaction(
    originalTx: Transaction,
    splits: Partial<Transaction>[],
  ): Promise<void> {
    return this.proxyCall("splitTransaction", [originalTx, splits]);
  }

  public subscribe(callback: (state: BridgeState) => void): () => void {
    const timer = setInterval(async () => {
      try {
        const s = await this.proxyCall<BridgeState>("state", []);
        callback(s);
      } catch {
        callback({
          connected: false,
          context: { type: "UNKNOWN", accountId: null },
        });
      }
    }, 2000);

    return () => clearInterval(timer);
  }

  public state(): BridgeState {
    return {
      connected: false,
      context: { type: "UNKNOWN", accountId: null },
    };
  }

  public disconnect(): void {
    // No-op remotely
  }

  private async proxyCall<T>(method: string, args: unknown[]): Promise<T> {
    const msg: ArbiterMessage = {
      type: ARBITER_MESSAGE_TYPE,
      action: ArbiterMessageType.PROXY_REQUEST,
      payload: { method, args },
    };

    const response = (await browser.runtime.sendMessage(msg)) as {
      success: boolean;
      data?: unknown;
      error?: string;
    };

    if (!response) throw new Error("No response from Arbiter");

    if (response.success) {
      return response.data as T;
    } else {
      throw new Error(response.error || "Proxy call failed");
    }
  }
}
