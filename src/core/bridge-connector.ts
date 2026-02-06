import browser from "webextension-polyfill";
import {
  ARBITER_MESSAGE_TYPE,
  ArbiterMessageType,
  type ArbiterMessage,
} from "../background/arbiter";
import type { LocalBridge } from "./local-bridge";

export class BridgeConnector {
  private isPrimary = false;
  private myTabId: number | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private listeners = new Set<(isPrimary: boolean) => void>();
  private localBridge: LocalBridge | null = null;

  constructor() {
    this.handleRuntimeMessage = this.handleRuntimeMessage.bind(this);
  }

  public async start() {
    browser.runtime.onMessage.addListener(this.handleRuntimeMessage);
    // Fetch our Tab ID immediately on start
    // TODO: try again periodically if it isn't available the first time around (race condition with background script startup?)
    console.log("AXB: calling fetchTabId...");
    await this.fetchTabId();
    console.log("AXB: called fetchTabId...");
    console.log("AXB: trying to acquire lock...");
    await navigator.locks.request(
      `${browser.runtime.id}-super-duper-lock`,
      async (lock) => {
        if (!lock) {
          throw new Error("AXB: how can lock be falsy?");
        }
        console.log(`AXB: obtained lock ${lock.name}`);
        return new Promise(() => {
          // Optional: If you ever needed to voluntarily resign, you would call resolve()
          // For now, we just hang here.
        });
      },
    );
  }

  public registerBridge(bridge: LocalBridge): void {
    this.localBridge = bridge;
  }

  public async claimPrimary(): Promise<void> {
    const msg: ArbiterMessage = {
      type: ARBITER_MESSAGE_TYPE,
      action: ArbiterMessageType.CLAIM_PRIMARY,
    };
    await browser.runtime.sendMessage(msg);
  }

  public on(
    event: "primary-changed",
    callback: (isPrimary: boolean) => void,
  ): void {
    if (event === "primary-changed") {
      this.listeners.add(callback);
    }
  }

  private async fetchTabId() {
    try {
      const response = (await browser.runtime.sendMessage({
        type: ARBITER_MESSAGE_TYPE,
        action: ArbiterMessageType.GET_TAB_ID,
      })) as { tabId?: number };

      if (response && typeof response.tabId === "number") {
        this.myTabId = response.tabId;
      }
    } catch (e) {
      console.error("AXB: Failed to fetch Tab ID", e);
    }
  }

  private handleRuntimeMessage(
    message: unknown,
    _sender: browser.Runtime.MessageSender,
  ): Promise<unknown> | undefined {
    console.log(
      `AXB: handleRuntimeMessage(${JSON.stringify(message)}) from ${JSON.stringify(_sender)}`,
    );
    const msg = message as ArbiterMessage;
    if (!msg || msg.type !== ARBITER_MESSAGE_TYPE) return undefined;

    switch (msg.action) {
      case ArbiterMessageType.PRIMARY_CHANGED: {
        const payload = msg.payload as { primaryTabId: number | null };
        void this.handlePrimaryChange(payload.primaryTabId);
        return undefined;
      }

      case ArbiterMessageType.PROXY_REQUEST:
        if (this.isPrimary && this.localBridge) {
          return this.handleProxyRequest(msg);
        } else {
          return Promise.resolve({
            success: false,
            error: "Not Primary or No Bridge",
          });
        }

      default:
        return undefined;
    }
  }

  private async handlePrimaryChange(primaryId: number | null) {
    // Ensure we have our ID (retry if needed)
    console.log(`AXB: handlePrimaryChange(${primaryId})`);
    if (this.myTabId === null) {
      await this.fetchTabId();
    }

    const amIPrimary = this.myTabId !== null && this.myTabId === primaryId;

    if (this.isPrimary !== amIPrimary) {
      this.isPrimary = amIPrimary;
      this.listeners.forEach((cb) => cb(amIPrimary));

      if (amIPrimary) {
        this.startHeartbeat();
      } else {
        this.stopHeartbeat();
      }
    }
  }

  private startHeartbeat() {
    console.log("AXB: startHeartbeat");
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      console.log("AXB: sending heartbeat ...");
      browser.runtime
        .sendMessage({
          type: ARBITER_MESSAGE_TYPE,
          action: ArbiterMessageType.HEARTBEAT,
        })
        .catch(() => {
          // Background likely dead.
          void this.handlePrimaryChange(null);
        });
      console.log("AXB: ... sent heartbeat");
    }, 2000);
  }

  private stopHeartbeat() {
    console.log("AXB: stopHeartbeat");
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private async handleProxyRequest(msg: ArbiterMessage): Promise<unknown> {
    const req = msg.payload as { method: string; args: unknown[] };
    if (!this.localBridge) return;

    try {
      // @ts-expect-error - Dynamic dispatch
      if (typeof this.localBridge[req.method] === "function") {
        // @ts-expect-error - Dynamic dispatch
        const result = await this.localBridge[req.method](...req.args);
        return { success: true, data: result };
      } else {
        return { success: false, error: `Method ${req.method} not found` };
      }
    } catch (e: unknown) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      return { success: false, error: errorMsg };
    }
  }
}
