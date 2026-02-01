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

  it("should handle claim primary", async () => {
    const sender = { tab: { id: 100 } };
    const msg = {
      type: ARBITER_MESSAGE_TYPE,
      action: ArbiterMessageType.CLAIM_PRIMARY,
    };

    onMessageListeners.forEach((fn) =>
      fn(msg, sender, () => {
        // Empty sendResponse callback - not used in this test
      }),
    );

    expect(arbiter.getPrimaryId()).toBe(100);

    // Wait for async broadcastChange to complete
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Should broadcast
    expect(tabSendMessageSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: ArbiterMessageType.PRIMARY_CHANGED,
        payload: { primaryTabId: 100 },
      }),
    );
  });

  it("should timeout primary if no heartbeat", async () => {
    vi.useFakeTimers();
    // Claim
    arbiter.setPrimary(100);
    expect(arbiter.getPrimaryId()).toBe(100);

    // Wait for initial broadcast to complete
    await vi.runOnlyPendingTimersAsync();

    // Wait > 5s
    vi.advanceTimersByTime(6000);
    await vi.runOnlyPendingTimersAsync();

    expect(arbiter.getPrimaryId()).toBeNull();

    // Should broadcast revocation (null)
    expect(tabSendMessageSpy).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        payload: { primaryTabId: null },
      }),
    );
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
