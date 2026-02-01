/**
 * The "Traffic Cop" running in the Background Service Worker.
 * Enforces the Single Master policy across multiple Actual Budget tabs.
 */
import browser from "webextension-polyfill";
import {
  ARBITER_MESSAGE_TYPE,
  ArbiterMessageType,
  type ArbiterMessage,
} from "./arbiter"; // Self-referencing for types? No, I should define types here or importing from constants if moved.
// Wait, the previous file had the types IN IT. I will keep them here.

// Re-defining for self-containment as per previous file structure
export const ARBITER_MESSAGE_TYPE_CONST = "ACTUAL_BRIDGE_ARBITER";

export enum ArbiterMessageTypeEnum {
  HEARTBEAT = "HEARTBEAT",
  CLAIM_PRIMARY = "CLAIM_PRIMARY",
  PRIMARY_CHANGED = "PRIMARY_CHANGED",
  PROXY_REQUEST = "PROXY_REQUEST",
  PROXY_RESPONSE = "PROXY_RESPONSE",
  GET_TAB_ID = "GET_TAB_ID",
}

export interface ArbiterMessageInterface<T = unknown> {
  type: typeof ARBITER_MESSAGE_TYPE_CONST;
  action: ArbiterMessageTypeEnum;
  payload?: T;
  requestId?: string;
}

export class BridgeArbiter {
  private primaryTabId: number | null = null;
  private lastHeartbeatTime: number = 0;
  private heartbeatTimeout: NodeJS.Timeout | null = null;
  private static readonly TIMEOUT_MS = 5000;

  constructor() {
    this.handleMessage = this.handleMessage.bind(this);
    this.handleTabRemoved = this.handleTabRemoved.bind(this);
  }

  public start(): void {
    browser.runtime.onMessage.addListener(this.handleMessage);
    browser.tabs.onRemoved.addListener(this.handleTabRemoved);
  }

  public getPrimaryId(): number | null {
    return this.primaryTabId;
  }

  public setPrimary(tabId: number): void {
    if (this.primaryTabId === tabId) return;

    this.primaryTabId = tabId;
    this.lastHeartbeatTime = Date.now();

    // Broadcast the new Primary ID to ALL tabs
    this.broadcastChange(tabId);
    this.monitorHeartbeat();
  }

  // Updated to return Promise (Polyfill style)
  private handleMessage(
    message: unknown,
    sender: browser.Runtime.MessageSender,
  ): Promise<unknown> | void {
    const msg = message as ArbiterMessageInterface;

    // Allow simple ID request without strict typing if needed
    if (!msg || typeof msg !== "object") return;

    // Handle "Who Am I?" request from content scripts
    if (msg.action === ArbiterMessageTypeEnum.GET_TAB_ID) {
      return Promise.resolve({ tabId: sender.tab?.id || null });
    }

    // Strict protocol check for other messages
    if (msg.type !== ARBITER_MESSAGE_TYPE_CONST) return;

    const tabId = sender.tab?.id;

    switch (msg.action) {
      case ArbiterMessageTypeEnum.HEARTBEAT:
        if (tabId && tabId === this.primaryTabId) {
          this.lastHeartbeatTime = Date.now();
          this.monitorHeartbeat();
        }
        break;

      case ArbiterMessageTypeEnum.CLAIM_PRIMARY:
        if (tabId) this.setPrimary(tabId);
        break;

      case ArbiterMessageTypeEnum.PROXY_REQUEST:
        return this.handleProxyRequest(msg);
    }
  }

  private handleTabRemoved(tabId: number) {
    if (tabId === this.primaryTabId) {
      console.log(`[Arbiter] Primary tab ${tabId} closed.`);
      this.primaryTabId = null;
      this.broadcastChange(null);
    }
  }

  private monitorHeartbeat() {
    if (this.heartbeatTimeout) clearTimeout(this.heartbeatTimeout);
    if (!this.primaryTabId) return;

    this.heartbeatTimeout = setTimeout(() => {
      if (Date.now() - this.lastHeartbeatTime > BridgeArbiter.TIMEOUT_MS) {
        console.warn(`[Arbiter] Primary tab ${this.primaryTabId} timed out.`);
        this.primaryTabId = null;
        this.broadcastChange(null);
      }
    }, BridgeArbiter.TIMEOUT_MS + 100);
  }

  private broadcastChange(newPrimaryId: number | null) {
    const msg: ArbiterMessageInterface = {
      type: ARBITER_MESSAGE_TYPE_CONST,
      action: ArbiterMessageTypeEnum.PRIMARY_CHANGED,
      payload: { primaryTabId: newPrimaryId },
    };

    // Send to all tabs
    browser.tabs.query({}).then((tabs) => {
      for (const tab of tabs) {
        if (tab.id) {
          browser.tabs.sendMessage(tab.id, msg).catch(() => {});
        }
      }
    });

    // Also notify UI (Side Panel)
    browser.runtime.sendMessage(msg).catch(() => {});
  }

  private async handleProxyRequest(
    msg: ArbiterMessageInterface,
  ): Promise<unknown> {
    if (!this.primaryTabId) {
      return { success: false, error: "No Primary Tab Connected" };
    }
    try {
      return await browser.tabs.sendMessage(this.primaryTabId, msg);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: errorMsg || "Failed to reach Primary Tab",
      };
    }
  }
}

// Export aliases to match previous imports if needed, though they are usually imported from here.
export const ARBITER_MESSAGE_TYPE = ARBITER_MESSAGE_TYPE_CONST;
export const ArbiterMessageType = ArbiterMessageTypeEnum;
export type ArbiterMessage = ArbiterMessageInterface;
