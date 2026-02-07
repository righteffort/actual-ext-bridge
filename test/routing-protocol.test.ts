import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RpcRouter } from "../src/background/rpc-router";
import { BridgeConnector } from "../src/content/bridge-connector";
import {
  ROUTER_MESSAGE_TYPE,
  RouterMessageType,
} from "../src/background/rpc-router";
import browser from "webextension-polyfill";

// Mock storage for session data
const mockStorage = new Map<string, unknown>();

// Mock browser APIs
vi.mock("webextension-polyfill", () => ({
  default: {
    runtime: {
      onMessage: {
        addListener: vi.fn(),
      },
      sendMessage: vi.fn(),
      getURL: vi.fn((path) => `chrome-extension://test-id/${path}`),
      id: "test-extension-id",
    },
    storage: {
      session: {
        get: vi.fn((key) => Promise.resolve({ [key]: mockStorage.get(key) })),
        set: vi.fn((data) => {
          Object.entries(data).forEach(([k, v]) => mockStorage.set(k, v));
          return Promise.resolve();
        }),
      },
    },
    tabs: {
      sendMessage: vi.fn(),
    },
  },
}));

// Mock navigator.locks
const mockLocks = new Map<string, { callback: Function; resolve: Function }>();
Object.defineProperty(global.navigator, "locks", {
  value: {
    request: vi.fn((name: string, callback: Function) => {
      return new Promise((resolve) => {
        mockLocks.set(name, { callback, resolve });
        // Simulate immediate lock acquisition
        setTimeout(() => {
          callback({ name });
        }, 0);
      });
    }),
  },
  writable: true,
});

describe("Routing Protocol Integration", () => {
  let router: RpcRouter;
  let connector: BridgeConnector;
  let messageHandlers: Map<string, Function>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.clear();
    mockLocks.clear();
    messageHandlers = new Map();

    // Track message handlers
    (browser.runtime.onMessage.addListener as any).mockImplementation(
      (handler: Function) => {
        const id = Math.random().toString();
        messageHandlers.set(id, handler);
      }
    );

    router = new RpcRouter();
    connector = new BridgeConnector();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should route background requests to primary content script", async () => {
    // Start router
    router.start();

    // Start connector (simulating content script)
    connector.start();

    // Wait for lock acquisition and primary registration
    await vi.waitFor(() => {
      expect(browser.runtime.sendMessage).toHaveBeenCalledWith({
        type: ROUTER_MESSAGE_TYPE,
        action: RouterMessageType.CLAIM_PRIMARY,
      });
    });

    // Simulate the router receiving the CLAIM_PRIMARY message from content script
    const routerHandler = Array.from(messageHandlers.values())[0];
    await routerHandler(
      {
        type: ROUTER_MESSAGE_TYPE,
        action: RouterMessageType.CLAIM_PRIMARY,
      },
      { tab: { id: 123 } }
    );

    // Mock the content script bridge method
    const mockAccounts = [{ id: "acc-1", name: "Test Account" }];
    vi.spyOn(connector["csBridge"], "getAccounts").mockResolvedValue(
      mockAccounts
    );

    // Mock tabs.sendMessage to return what the content script would return
    (browser.tabs.sendMessage as any).mockResolvedValue({
      success: true,
      data: mockAccounts,
    });

    // Simulate background script sending proxy request through router
    const proxyRequest = {
      type: ROUTER_MESSAGE_TYPE,
      action: RouterMessageType.PROXY_REQUEST,
      payload: { method: "getAccounts", args: [] },
    };

    const response = await routerHandler(proxyRequest, {
      tab: { id: 456 }, // Different tab ID to show it routes to primary (123)
    });

    // Router should try to send message to primary tab (123, not 456)
    expect(browser.tabs.sendMessage).toHaveBeenCalledWith(123, proxyRequest);

    expect(response).toEqual({
      success: true,
      data: mockAccounts,
    });
  });

  it("should handle primary tab registration", async () => {
    router.start();

    // Simulate content script claiming primary
    const claimMessage = {
      type: ROUTER_MESSAGE_TYPE,
      action: RouterMessageType.CLAIM_PRIMARY,
    };

    const routerHandler = Array.from(messageHandlers.values())[0];
    await routerHandler(claimMessage, { tab: { id: 456 } });

    // Verify primary tab is stored
    expect(browser.storage.session.set).toHaveBeenCalledWith({
      primaryTabId: 456,
    });
  });

  it("should return error when no primary tab is connected", async () => {
    router.start();

    const proxyRequest = {
      type: ROUTER_MESSAGE_TYPE,
      action: RouterMessageType.PROXY_REQUEST,
      payload: { method: "getAccounts", args: [] },
    };

    const routerHandler = Array.from(messageHandlers.values())[0];
    const response = await routerHandler(proxyRequest, { tab: { id: 123 } });

    expect(response).toEqual({
      success: false,
      error: "No Primary Tab Connected",
    });
  });

  it("should handle content script bridge method errors", async () => {
    router.start();
    connector.start();

    // Wait for primary registration
    await vi.waitFor(() => {
      expect(browser.runtime.sendMessage).toHaveBeenCalled();
    });

    // Mock bridge method to throw error
    vi.spyOn(connector["csBridge"], "getAccounts").mockRejectedValue(
      new Error("Bridge connection failed")
    );

    const proxyRequest = {
      type: ROUTER_MESSAGE_TYPE,
      action: RouterMessageType.PROXY_REQUEST,
      payload: { method: "getAccounts", args: [] },
    };

    // Find content script's message handler
    const contentHandler = Array.from(messageHandlers.values()).find(
      (handler, index) => index === 1 // Second handler should be content script
    );

    if (contentHandler) {
      const response = await contentHandler(proxyRequest, {});
      expect(response).toEqual({
        success: false,
        error: "Bridge connection failed",
      });
    }
  });

  it("should ignore non-router messages", async () => {
    router.start();

    const nonRouterMessage = {
      type: "SOME_OTHER_MESSAGE",
      action: "SOME_ACTION",
    };

    const routerHandler = Array.from(messageHandlers.values())[0];
    const response = await routerHandler(nonRouterMessage, { tab: { id: 123 } });

    expect(response).toBeUndefined();
    expect(browser.tabs.sendMessage).not.toHaveBeenCalled();
  });
});
