import type {
  BridgeMessage,
  AnyBridgeResponse,
  Transaction,
  ProtocolMap,
  BridgeCommand,
  BridgeState,
  BridgeBroadcast,
} from "./types";
import injectedCode from "./injected.ts?inline-js";

type ResolveFn = (value: unknown) => void;
type RejectFn = (reason?: unknown) => void;

export class ActualBridge {
  private listeners = new Map<
    string,
    { resolve: ResolveFn; reject: RejectFn }
  >();
  private subscribers: ((state: BridgeState) => void)[] = [];

  private lastState: BridgeState = {
    connected: false,
    context: { type: "UNKNOWN", accountId: null },
    transactions: null,
  };

  constructor() {
    window.addEventListener("message", this.handleWindowMessage.bind(this));
  }

  public async connect(config?: {
    baseUrl?: string;
  }): Promise<ProtocolMap["HANDSHAKE"]["res"]> {
    const script = document.createElement("script");
    let codeToInject = injectedCode;
    const origin = config?.baseUrl || window.location.origin;
    codeToInject = codeToInject.replace("__ACTUAL_ORIGIN__", origin);
    script.textContent = codeToInject;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
    return this.sendCommand("HANDSHAKE", undefined);
  }

  public subscribe(callback: (state: BridgeState) => void): () => void {
    this.subscribers.push(callback);
    callback(this.lastState);
    return () => {
      this.subscribers = this.subscribers.filter((cb) => cb !== callback);
    };
  }

  public state(): BridgeState {
    return this.lastState;
  }

  public async getTransactions(): Promise<
    ProtocolMap["GET_TRANSACTIONS"]["res"]
  > {
    return this.sendCommand("GET_TRANSACTIONS", undefined);
  }

  public async saveTransaction(
    transaction: Transaction,
  ): Promise<ProtocolMap["SAVE_TRANSACTION"]["res"]> {
    if (!transaction.id)
      throw new Error("Transaction ID is required for updates.");
    return this.sendCommand("SAVE_TRANSACTION", transaction);
  }

  public async importTransaction(
    payload: ProtocolMap["IMPORT_TRANSACTION"]["req"],
  ): Promise<ProtocolMap["IMPORT_TRANSACTION"]["res"]> {
    if (!payload.imported_id)
      throw new Error("imported_id is required for deduplication.");
    return this.sendCommand("IMPORT_TRANSACTION", payload);
  }

  public async splitTransaction(
    originalTx: Transaction,
    splits: Partial<Transaction>[],
  ): Promise<ProtocolMap["SAVE_TRANSACTION"]["res"]> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { category, ...baseTx } = originalTx;

    const splitPayload = {
      ...baseTx,
      is_parent: true,
      subtransactions: splits.map((split) => ({
        ...split,
        id: crypto.randomUUID(),
        parent_id: originalTx.id,
        is_child: true,
        account: originalTx.account,
        date: originalTx.date,
        payee: originalTx.payee,
      })),
    };
    return this.saveTransaction(splitPayload as Transaction);
  }

  private sendCommand<C extends BridgeCommand>(
    command: C,
    payload: ProtocolMap[C]["req"],
  ): Promise<ProtocolMap[C]["res"]> {
    const messageId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      // Cast specialized promise functions to generic storage types
      this.listeners.set(messageId, {
        resolve: resolve as ResolveFn,
        reject: reject as RejectFn,
      });

      const message: BridgeMessage<C> = {
        type: "ACTUAL_BRIDGE_CMD",
        messageId,
        command,
        payload,
      };

      window.postMessage(message, "*");
      setTimeout(() => {
        if (this.listeners.has(messageId)) {
          this.listeners.delete(messageId);
          reject(new Error(`Bridge timeout for command: ${command}`));
        }
      }, 1000);
    });
  }

  private handleWindowMessage(event: MessageEvent) {
    const data = event.data;
    if (data?.type !== "ACTUAL_BRIDGE_DATA") return;

    if (data.messageId === "BROADCAST_STATE_UPDATE") {
      this.lastState = (data as BridgeBroadcast).payload;
      this.subscribers.forEach((cb) => cb(this.lastState));
      return;
    }

    const response = data as AnyBridgeResponse;

    if (response.messageId) {
      const listener = this.listeners.get(response.messageId);
      if (listener) {
        const { resolve, reject } = listener;
        this.listeners.delete(response.messageId);
        if (response.error) reject(new Error(response.error));
        else resolve(response.payload);
      }
    }
  }
}
