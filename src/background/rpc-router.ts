/**
 * Route messages to the current primary Actual content script.
 */
import browser from "webextension-polyfill";

export const ROUTER_MESSAGE_TYPE = "AXB_ROUTER";

export enum RouterMessageType {
  CLAIM_PRIMARY = "CLAIM_PRIMARY",
  PROXY_REQUEST = "PROXY_REQUEST",
}

export interface RouterMessage<T = unknown> {
  type: typeof ROUTER_MESSAGE_TYPE;
  action: RouterMessageType;
  payload?: T;
  requestId?: string;
}

export class RpcRouter {
  private primaryTabId: number | null = null;

  constructor() {
    this.handleMessage = this.handleMessage.bind(this);
  }

  public start(): void {
    console.log(`AXB: router start`);
    browser.runtime.onMessage.addListener(this.handleMessage);
  }

  private async getPrimaryTabId(): Promise<number | null> {
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

  private setPrimary(tabId: number): void {
    if (this.primaryTabId === tabId) return;
    browser.storage.session.set({ primaryTabId: tabId });
    this.primaryTabId = tabId;
  }

  private handleMessage(
    message: unknown,
    sender: browser.Runtime.MessageSender,
  ): Promise<unknown> | undefined {
    const msg = message as RouterMessage;
    if (msg?.type !== ROUTER_MESSAGE_TYPE) return undefined;
    const tabId = sender.tab?.id;

    switch (msg.action) {
      case RouterMessageType.CLAIM_PRIMARY:
        if (!tabId) {
          console.warn("AXB: Received CLAIM_PRIMARY message with no tab id");
        } else {
          this.setPrimary(tabId);
        }
        return undefined;
      case RouterMessageType.PROXY_REQUEST:
        return this.handleProxyRequest(msg);
      default:
        return undefined;
    }
  }

  private async handleProxyRequest(msg: RouterMessage): Promise<unknown> {
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
