/**
 * Proxies messages to the current primary Actual content script.
 * TODO: rename accordingly
 */
import browser from "webextension-polyfill";

export const ARBITER_MESSAGE_TYPE = "ACTUAL_BRIDGE_ARBITER";

export enum ArbiterMessageType {
  CLAIM_PRIMARY = "CLAIM_PRIMARY",
  PROXY_REQUEST = "PROXY_REQUEST",
  // PROXY_RESPONSE = "PROXY_RESPONSE",
}

export interface ArbiterMessage<T = unknown> {
  type: typeof ARBITER_MESSAGE_TYPE;
  action: ArbiterMessageType;
  payload?: T;
  requestId?: string;
}

export class BridgeArbiter {
  private primaryTabId: number | null = null;

  constructor() {
    this.handleMessage = this.handleMessage.bind(this);
  }

  /* public */ start(): void {
    console.log(`AXB: arbiter start`);
    browser.runtime.onMessage.addListener(this.handleMessage);
  }

  async getPrimaryTabId(): Promise<number | null> {
    if (!this.primaryTabId) {
      const { primaryTabId } =
        await browser.storage.session.get("primaryTabId");
      if (typeof primaryTabId !== "number") {
        return null;
      }
      this.primaryTabId = primaryTabId;
    }
    return this.primaryTabId;
  }

  /* public */ setPrimary(tabId: number): void {
    if (this.primaryTabId === tabId) return;
    browser.storage.session.set({ primaryTabId: tabId });
    this.primaryTabId = tabId;
  }

  private handleMessage(
    message: unknown,
    sender: browser.Runtime.MessageSender,
  ): Promise<unknown> | undefined {
    const msg = message as ArbiterMessage;
    console.debug(
      `AXB: arbiter handleMessage received ${JSON.stringify(message)} from ${JSON.stringify(sender)}`,
    );

    // if (!msg || typeof msg !== "object") return undefined;
    if (msg?.type !== ARBITER_MESSAGE_TYPE) return undefined;

    const tabId = sender.tab?.id;

    switch (msg.action) {
      case ArbiterMessageType.CLAIM_PRIMARY:
        if (!tabId) {
          console.warn("AXB: Received CLAIM_PRIMARY message with no tab id");
        } else {
          this.setPrimary(tabId);
        }
        return undefined;

      case ArbiterMessageType.PROXY_REQUEST:
        return this.handleProxyRequest(msg);

      default:
        return undefined;
    }
  }

  private async handleProxyRequest(msg: ArbiterMessage): Promise<unknown> {
    const primaryTabId = await this.getPrimaryTabId();
    if (!primaryTabId) {
      return { success: false, error: "No Primary Tab Connected" };
    }
    try {
      return await browser.tabs.sendMessage(primaryTabId, msg);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`AXB: ${msg}`);
      return {
        success: false,
        error: `Failed to reach Primary Tab ${primaryTabId}: ${msg}`,
      };
    }
  }
}
