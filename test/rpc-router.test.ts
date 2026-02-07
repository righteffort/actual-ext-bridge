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
  let storageGetSpy: ReturnType<typeof vi.fn>;
  let storageSetSpy: ReturnType<typeof vi.fn>;
  let tabSendMessageSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onMessageListeners = [];
    browser.runtime.onMessage.addListener = vi.fn((fn) =>
      onMessageListeners.push(fn),
    );

    storageGetSpy = vi.fn().mockResolvedValue({});
    storageSetSpy = vi.fn().mockResolvedValue(undefined);
    
    // Mock the entire storage API structure
    Object.defineProperty(browser, 'storage', {
      value: {
        session: {
          get: storageGetSpy,
          set: storageSetSpy,
        },
      },
      writable: true,
      configurable: true,
    });

    tabSendMessageSpy = vi.fn().mockResolvedValue({});
    Object.defineProperty(browser.tabs, 'sendMessage', {
      value: tabSendMessageSpy,
      writable: true,
      configurable: true,
    });

    router = new RpcRouter();
    router.start();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should persist primary tab to storage", async () => {
    const msg = {
      type: ROUTER_MESSAGE_TYPE,
      action: RouterMessageType.CLAIM_PRIMARY,
    };

    const listener = onMessageListeners[0];
    expect(listener).toBeDefined();
    if (!listener) throw new Error("Listener not found");
    await listener(msg, { tab: { id: 123 } }, vi.fn());

    expect(storageSetSpy).toHaveBeenCalledWith({ primaryTabId: 123 });
  });

  it("should read primary tab from storage on first proxy request", async () => {
    storageGetSpy.mockResolvedValue({ primaryTabId: 456 });

    const msg = {
      type: ROUTER_MESSAGE_TYPE,
      action: RouterMessageType.PROXY_REQUEST,
      payload: { method: "test" },
    };

    const listener = onMessageListeners[0];
    expect(listener).toBeDefined();
    if (!listener) throw new Error("Listener not found");
    await listener(msg, {}, vi.fn());

    expect(storageGetSpy).toHaveBeenCalledWith("primaryTabId");
    expect(tabSendMessageSpy).toHaveBeenCalledWith(456, msg);
  });

  it("should return error when no primary tab is set", async () => {
    storageGetSpy.mockResolvedValue({});

    const msg = {
      type: ROUTER_MESSAGE_TYPE,
      action: RouterMessageType.PROXY_REQUEST,
      payload: { method: "test" },
    };

    const listener = onMessageListeners[0];
    expect(listener).toBeDefined();
    if (!listener) throw new Error("Listener not found");
    const result = await listener(msg, {}, vi.fn());

    expect(result).toEqual({
      success: false,
      error: "No Primary Tab Connected",
    });
  });

  it("should handle tab communication errors gracefully", async () => {
    storageGetSpy.mockResolvedValue({ primaryTabId: 789 });
    tabSendMessageSpy.mockRejectedValue(new Error("Tab not found"));

    const msg = {
      type: ROUTER_MESSAGE_TYPE,
      action: RouterMessageType.PROXY_REQUEST,
      payload: { method: "test" },
    };

    const listener = onMessageListeners[0];
    expect(listener).toBeDefined();
    if (!listener) throw new Error("Listener not found");
    const result = await listener(msg, {}, vi.fn());

    expect(result).toEqual({
      success: false,
      error: "Failed to reach Primary Tab 789: Tab not found",
    });
  });

  it("should ignore non-router messages", async () => {
    const msg = { type: "OTHER_MESSAGE", action: "SOME_ACTION" };

    const listener = onMessageListeners[0];
    expect(listener).toBeDefined();
    if (!listener) throw new Error("Listener not found");
    const result = await listener(msg, {}, vi.fn());

    expect(result).toBeUndefined();
    expect(storageGetSpy).not.toHaveBeenCalled();
    expect(tabSendMessageSpy).not.toHaveBeenCalled();
  });

});
