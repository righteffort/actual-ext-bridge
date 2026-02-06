import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BridgeConnector } from "../src/core/bridge-connector";
// import { LocalBridge } from "../src/core/local-bridge";
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

  it("should handle proxy requests when primary", async () => {
    sendMessageSpy.mockResolvedValue({ tabId: 123 });
    connector.start();

    // Mock LocalBridge
    const mockBridge = {
      getAccounts: vi.fn().mockResolvedValue([{ id: "acc-1" }]),
    };
    // TODO: unfortunately mockBridge won't get used ...

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
