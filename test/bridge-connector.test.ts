import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BridgeConnector } from "../src/content/bridge-connector";
import {
  ROUTER_MESSAGE_TYPE,
  RouterMessageType,
} from "../src/background/rpc-router";
import browser from "webextension-polyfill";

// Mock the ContentScriptBridge
vi.mock("../src/content/content-script-bridge.ts", () => ({
  ContentScriptBridge: class MockContentScriptBridge {
    connect = vi.fn();
    getAccounts = vi.fn().mockResolvedValue([{ id: "acc-1" }]);
    getTransactions = vi.fn().mockResolvedValue([]);
    nonExistentMethod = undefined;
  },
}));

describe("BridgeConnector", () => {
  let connector: BridgeConnector;
  let onMessageListeners: ((
    message: unknown,
    sender: unknown,
    sendResponse: () => void,
  ) => void)[] = [];
  let lockRequestSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onMessageListeners = [];
    browser.runtime.onMessage.addListener = vi.fn((fn) =>
      onMessageListeners.push(fn),
    );
    browser.runtime.sendMessage = vi.fn().mockResolvedValue({});

    // Mock navigator.locks
    lockRequestSpy = vi.fn().mockImplementation(async (name, callback) => {
      // Simulate successful lock acquisition
      const mockLock = { name };
      return callback(mockLock);
    });
    Object.defineProperty(global.navigator, "locks", {
      value: { request: lockRequestSpy },
      writable: true,
    });

    connector = new BridgeConnector();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should handle invalid method names gracefully", async () => {
    const proxyMsg = {
      type: ROUTER_MESSAGE_TYPE,
      action: RouterMessageType.PROXY_REQUEST,
      payload: { method: "nonExistentMethod", args: [] },
    };

    // Simulate the connector being started and having a listener
    connector.start();
    const listener = onMessageListeners[0];
    const response = await listener(proxyMsg, {}, () => {});

    expect(response).toEqual({
      success: false,
      error: "Method nonExistentMethod not found",
    });
  });

  it("should handle method execution errors", async () => {
    // Mock a method that throws an error
    const mockBridge = {
      connect: vi.fn(),
      throwingMethod: vi.fn().mockRejectedValue(new Error("Test error")),
    };
    
    // Replace the bridge instance
    (connector as any).csBridge = mockBridge;

    const proxyMsg = {
      type: ROUTER_MESSAGE_TYPE,
      action: RouterMessageType.PROXY_REQUEST,
      payload: { method: "throwingMethod", args: [] },
    };

    connector.start();
    const listener = onMessageListeners[0];
    const response = await listener(proxyMsg, {}, () => {});

    expect(response).toEqual({
      success: false,
      error: "Test error",
    });
  });

  it("should ignore non-router messages", async () => {
    const nonRouterMsg = { type: "OTHER_MESSAGE", action: "SOME_ACTION" };

    connector.start();
    const listener = onMessageListeners[0];
    const response = await listener(nonRouterMsg, {}, () => {});

    expect(response).toBeUndefined();
  });

  it("should handle successful method calls", async () => {
    const proxyMsg = {
      type: ROUTER_MESSAGE_TYPE,
      action: RouterMessageType.PROXY_REQUEST,
      payload: { method: "getAccounts", args: [] },
    };

    connector.start();
    const listener = onMessageListeners[0];
    const response = await listener(proxyMsg, {}, () => {});

    expect(response).toEqual({
      success: true,
      data: [{ id: "acc-1" }],
    });
  });

  it("should attempt to acquire lock on start", async () => {
    connector.start();

    expect(lockRequestSpy).toHaveBeenCalledWith(
      expect.stringContaining("-content-script-lock"),
      expect.any(Function),
    );
  });
});
