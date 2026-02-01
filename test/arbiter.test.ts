import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  BridgeArbiter,
  ArbiterMessageType,
  ARBITER_MESSAGE_TYPE,
} from "../src/background/arbiter";

describe("BridgeArbiter", () => {
  let arbiter: BridgeArbiter;
  let onMessageListeners: any[] = [];
  let tabSendMessageSpy: any;

  beforeEach(() => {
    onMessageListeners = [];
    // @ts-ignore
    global.browser.runtime.onMessage.addListener = (fn) =>
      onMessageListeners.push(fn);

    tabSendMessageSpy = vi.fn().mockResolvedValue({});
    // @ts-ignore
    global.browser.tabs.sendMessage = tabSendMessageSpy;
    // @ts-ignore
    global.browser.tabs.query = vi
      .fn()
      .mockResolvedValue([{ id: 1 }, { id: 2 }]);

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

    onMessageListeners.forEach((fn) => fn(msg, sender, () => {}));

    expect(arbiter.getPrimaryId()).toBe(100);
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

    // Wait > 5s
    vi.advanceTimersByTime(6000);

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
    await onMessageListeners[0](msg, {}, () => {});

    expect(tabSendMessageSpy).toHaveBeenCalledWith(100, msg);
  });
});
