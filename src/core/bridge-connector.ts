// Content script logic

import browser from "webextension-polyfill";
import {
  ARBITER_MESSAGE_TYPE,
  ArbiterMessageType,
  type ArbiterMessage,
} from "../background/arbiter";
import { LocalBridge } from "./local-bridge";

export class BridgeConnector {
  private localBridge: LocalBridge = new LocalBridge();

  constructor() {
    this.handleRuntimeMessage = this.handleRuntimeMessage.bind(this);
  }

  // Note that this never resolves, so the caller should not await.
  public async start() {
    console.log("AXB: trying to acquire lock...");
    await navigator.locks.request(
      `${browser.runtime.id}-super-duper-lock`,
      async (lock) => {
        if (!lock) {
          throw new Error("AXB: how can lock be falsy?");
        }
        console.log(`AXB: obtained lock ${lock.name}`);
        this.localBridge.connect();
        browser.runtime.onMessage.addListener(this.handleRuntimeMessage);
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
    console.log(
      `AXB: handleRuntimeMessage(${JSON.stringify(message)}) from ${JSON.stringify(_sender)}`,
    );
    const msg = message as ArbiterMessage;
    if (!msg || msg.type !== ARBITER_MESSAGE_TYPE) return undefined;

    switch (msg.action) {
      case ArbiterMessageType.PROXY_REQUEST:
        if (this.localBridge) {
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

  private async handleProxyRequest(msg: ArbiterMessage): Promise<unknown> {
    const req = msg.payload as { method: string; args: unknown[] };
    if (!this.localBridge) {
      console.warn("AXB: localBridge not set?!");
    }
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
