// TODO: Test that primary is read/written from browser.storage.session

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  BridgeArbiter,
  ArbiterMessageType,
  ARBITER_MESSAGE_TYPE,
} from "../src/background/arbiter";
import browser from "webextension-polyfill";

describe("BridgeArbiter", () => {
  let arbiter: BridgeArbiter;
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

    arbiter = new BridgeArbiter();
    arbiter.start();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("should route proxy requests to primary", async () => {
    arbiter.setPrimary(100);

    const msg = {
      type: ARBITER_MESSAGE_TYPE,
      action: ArbiterMessageType.PROXY_REQUEST,
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
