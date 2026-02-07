// TODO: Test that primary is read/written from browser.storage.session

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  RpcRouter,
  RouterMessageType,
  ROUTER_MESSAGE_TYPE,
} from "../src/background/rpc-router";
import browser from "webextension-polyfill";

describe("RpcRouter", () => {
  let router: RpcRouter;
  let onMessageListeners: ((
    message: unknown,
    sender: unknown,
    sendResponse: () => void,
  ) => void)[] = [];
  let tabSendMessageSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onMessageListeners = [];
    browser.runtime.onMessage.addListener = vi.fn((fn) =>
      onMessageListeners.push(fn),
    );

    tabSendMessageSpy = vi.fn().mockResolvedValue({});
    browser.tabs.sendMessage =
      tabSendMessageSpy as typeof browser.tabs.sendMessage;
    browser.tabs.query = vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]);

    router = new RpcRouter();
    router.start();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("should route proxy requests to primary", async () => {
    // router.setPrimary(100);  TODO: we need a proper way to set this

    const msg = {
      type: ROUTER_MESSAGE_TYPE,
      action: RouterMessageType.PROXY_REQUEST,
      payload: { method: "foo" },
    };

    // We send from "Background" or "Popup" (no tab id or different tab id)
    const listener = onMessageListeners[0];
    if (listener) {
      await listener(msg, {}, () => {
        // Empty sendResponse callback - not used in this test
      });
    }

    expect(tabSendMessageSpy).toHaveBeenCalledWith(100, msg);
  });
});
