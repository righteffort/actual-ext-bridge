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
    browser.storage = {
      session: {
        get: storageGetSpy,
        set: storageSetSpy,
      },
    } as any;

    tabSendMessageSpy = vi.fn().mockResolvedValue({});
    browser.tabs.sendMessage = tabSendMessageSpy;

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
    await listener(msg, { tab: { id: 123 } }, () => {});

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
    await listener(msg, {}, () => {});

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
    const result = await listener(msg, {}, () => {});

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
    const result = await listener(msg, {}, () => {});

    expect(result).toEqual({
      success: false,
      error: "Failed to reach Primary Tab 789: Tab not found",
    });
  });

  it("should ignore non-router messages", async () => {
    const msg = { type: "OTHER_MESSAGE", action: "SOME_ACTION" };

    const listener = onMessageListeners[0];
    const result = await listener(msg, {}, () => {});

    expect(result).toBeUndefined();
    expect(storageGetSpy).not.toHaveBeenCalled();
    expect(tabSendMessageSpy).not.toHaveBeenCalled();
  });

  it("should warn when CLAIM_PRIMARY has no tab id", async () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const msg = {
      type: ROUTER_MESSAGE_TYPE,
      action: RouterMessageType.CLAIM_PRIMARY,
    };

    const listener = onMessageListeners[0];
    await listener(msg, {}, () => {});

    expect(consoleSpy).toHaveBeenCalledWith(
      "AXB: Received CLAIM_PRIMARY message with no tab id",
    );
    expect(storageSetSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});
