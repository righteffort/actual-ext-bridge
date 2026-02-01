import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BridgeConnector } from "../src/core/bridge-connector";
import { LocalBridge } from "../src/core/local-bridge";
import {
  ARBITER_MESSAGE_TYPE,
  ArbiterMessageType,
} from "../src/background/arbiter";
import browser from "webextension-polyfill";

describe("BridgeConnector", () => {
  let connector: BridgeConnector;
  let sendMessageSpy: ReturnType<typeof vi.fn>;
  let onMessageListeners: ((
    message: unknown,
    sender: unknown,
    sendResponse: () => void,
  ) => void)[] = [];

  beforeEach(() => {
    onMessageListeners = [];
    // Mock browser runtime
    browser.runtime.onMessage.addListener = vi.fn((fn) =>
      onMessageListeners.push(fn),
    );

    sendMessageSpy = vi.fn().mockResolvedValue({});
    browser.runtime.sendMessage =
      sendMessageSpy as typeof browser.runtime.sendMessage;

    connector = new BridgeConnector();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("should fetch tab ID on start", async () => {
    sendMessageSpy.mockResolvedValue({ tabId: 123 });
    connector.start();
    expect(sendMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ action: ArbiterMessageType.GET_TAB_ID }),
    );
  });

  it("should become primary when notified matching ID", async () => {
    vi.useFakeTimers();
    sendMessageSpy.mockResolvedValue({ tabId: 123 }); // My ID
    connector.start();

    // Simulate fetchTabId completing
    await new Promise(process.nextTick);

    const listener = vi.fn();
    connector.on("primary-changed", listener);

    // Simulate Broadcast
    const msg = {
      type: ARBITER_MESSAGE_TYPE,
      action: ArbiterMessageType.PRIMARY_CHANGED,
      payload: { primaryTabId: 123 },
    };

    await Promise.all(
      onMessageListeners.map((fn) =>
        fn(msg, {}, () => {
          // Empty sendResponse callback - not used in this test
        }),
      ),
    );

    expect(listener).toHaveBeenCalledWith(true);

    // Should start heartbeats
    vi.advanceTimersByTime(2000);
    expect(sendMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ action: ArbiterMessageType.HEARTBEAT }),
    );
  });

  it("should handle proxy requests when primary", async () => {
    sendMessageSpy.mockResolvedValue({ tabId: 123 });
    connector.start();
    // Force primary state for test setup
    // (Simulating the flow is complex, let's just trigger the state change logic)
    // But we need the internal myTabId to be set.
    await new Promise(process.nextTick);

    // Become primary
    const primaryListener = onMessageListeners[0];
    if (primaryListener) {
      await primaryListener(
        {
          type: ARBITER_MESSAGE_TYPE,
          action: ArbiterMessageType.PRIMARY_CHANGED,
          payload: { primaryTabId: 123 },
        },
        {},
        () => {
          // Empty sendResponse callback - not used in this test
        },
      );
    }

    // Mock LocalBridge
    const mockBridge = {
      getAccounts: vi.fn().mockResolvedValue([{ id: "acc-1" }]),
    };
    connector.registerBridge(mockBridge as unknown as LocalBridge);

    // Send Proxy Request
    const proxyMsg = {
      type: ARBITER_MESSAGE_TYPE,
      action: ArbiterMessageType.PROXY_REQUEST,
      payload: { method: "getAccounts", args: [] },
    };

    const proxyListener = onMessageListeners[0];
    let response;
    if (proxyListener) {
      response = await proxyListener(proxyMsg, {}, () => {
        // Empty sendResponse callback - not used in this test
      });
    }

    expect(mockBridge.getAccounts).toHaveBeenCalled();
    expect(response).toEqual({ success: true, data: [{ id: "acc-1" }] });
  });
});
