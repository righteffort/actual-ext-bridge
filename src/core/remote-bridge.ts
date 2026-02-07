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

  // TODO: i don't think this makes much sense.
  // public async connect(): Promise<void> {
  //   return this.proxyCall("connect", []);
  // }

  public async getTransactions(
    predicate?: (t: Transaction) => boolean,
  ): Promise<Transaction[]> {
    const txs = await this.proxyCall<Transaction[]>("getTransactions", []);
    if (txs && predicate) {
      return txs.filter(predicate);
    }
    return txs;
  }

  public async getAccounts(): Promise<Account[]> {
    return this.proxyCall("getAccounts", []);
  }

  public async getAccountByName(name: string): Promise<Account | null> {
    return this.proxyCall("getAccountByName", [name]);
  }

  public async updateTransaction(
    transaction: Transaction,
    field?: string,
  ): Promise<void> {
    return this.proxyCall("updateTransaction", [transaction, field]);
  }

  public async splitTransaction(
    t: Transaction,
    subtransactions: Partial<Transaction>[],
  ): Promise<void> {
    return this.proxyCall("splitTransaction", [t, subtransactions]);
  }

  public async createTransaction(payload: ImportTransaction): Promise<void> {
    return this.proxyCall("createTransaction", [payload]);
  }

  public subscribe(callback: (state: BridgeState) => void): () => void {
    // TODO: Anywhere we have interval-based logic I'm suspicious. But anyway ...
    const timer = setInterval(async () => {
      try {
        const s = await this.proxyCall<BridgeState>("state", []);
        console.debug(
          `remote subscribe received ${JSON.stringify(s)} from local.state`,
        );
        callback(s);
      } catch {
        // TODO: perhaps log something here?
        callback({
          connected: false,
          context: { type: "UNKNOWN", accountId: null },
        });
      }
    }, 2000);

    return () => clearInterval(timer);
  }

  public state(): Promise<BridgeState> {
    return this.proxyCall("state", []);
  }

  // public disconnect(): void {
  //   // No-op remotely
  // }

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

    if (!response) throw new Error("AXB: No response from Arbiter");

    if (response.success) {
      return response.data as T;
    } else {
      throw new Error(response.error || "AXB: Proxy call failed");
    }
  }
}
