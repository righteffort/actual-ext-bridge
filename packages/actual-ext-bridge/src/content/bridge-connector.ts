/**
 * Content Script side of communication protocol between RpcRouter and ContentScriptBridge.
 * * Ensures there is only one primary content script.
 * * Registers the primary with the service worker.
 * * Forwards requests from BackgroundBridge (by way of RpcRouter) to ContentScriptBridge.
 */
import browser from "webextension-polyfill";
import {
  ROUTER_MESSAGE_TYPE,
  RouterMessageType,
  type RouterMessage,
} from "../background/rpc-router";

import { ContentScriptBridge } from "./content-script-bridge.ts";

export class BridgeConnector {
  private csBridge: ContentScriptBridge = new ContentScriptBridge();

  constructor() {
    this.handleRuntimeMessage = this.handleRuntimeMessage.bind(this);
  }

  // Note that this never resolves, so the caller should not await.
  public async start() {
    console.log("AXB: trying to acquire lock...");
    await navigator.locks.request(
      `${browser.runtime.id}-content-script-lock`,
      async (lock) => {
        if (!lock) {
          throw new Error("AXB: lock should never be null");
        }
        console.log(`AXB: obtained lock ${lock.name}`);
        this.csBridge.connect();
        browser.runtime.onMessage.addListener(this.handleRuntimeMessage);
        browser.runtime.sendMessage({
          type: ROUTER_MESSAGE_TYPE,
          action: RouterMessageType.CLAIM_PRIMARY,
        });
        return new Promise(() => {
          // Hold the lock forever.
        });
      },
    );
    console.log("AXB: bridge-connector start done");
  }

  private handleRuntimeMessage(
    message: unknown,
    _sender: browser.Runtime.MessageSender,
  ): Promise<unknown> | undefined {
    console.debug(
      `AXB: handleRuntimeMessage(${JSON.stringify(message)}) from ${JSON.stringify(_sender)}`,
    );
    const msg = message as RouterMessage;
    if (!msg || msg.type !== ROUTER_MESSAGE_TYPE) return undefined;

    switch (msg.action) {
      case RouterMessageType.PROXY_REQUEST:
        if (this.csBridge) {
          return this.handleProxyRequest(msg);
        } else {
          return Promise.resolve({
            success: false,
            error: "No Bridge",
          });
        }

      default:
        return undefined;
    }
  }

  private async handleProxyRequest(msg: RouterMessage): Promise<unknown> {
    const req = msg.payload as { method: string; args: unknown[] };
    if (!this.csBridge) {
      console.warn("AXB: csBridge not set?!");
    }
    try {
      // @ts-expect-error - Dynamic dispatch
      if (typeof this.csBridge[req.method] === "function") {
        // @ts-expect-error - Dynamic dispatch
        const result = await this.csBridge[req.method](...req.args);
        return { success: true, data: result };
      } else {
        return { success: false, error: `Method ${req.method} not found` };
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`AXB: ${msg}`);
      return { success: false, error: msg };
    }
  }
}
