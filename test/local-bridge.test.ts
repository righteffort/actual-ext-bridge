import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LocalBridge } from "../src/core/local-bridge";
import { HostMessageType, GuestMessageType } from "../src/shared/constants";

// Mock the guest logic script import
vi.mock("../src/core/guest-logic.ts?inline-js", () => ({
  default: 'window.postMessage({ type: "ACTUAL_BRIDGE_GUEST_LOADED" }, "*")',
}));

describe("LocalBridge", () => {
  let bridge: LocalBridge;
  const baseUrl = "https://actual.test";

  beforeEach(() => {
    document.head.innerHTML = "";
    bridge = new LocalBridge();

    // Mock window.postMessage to intercept bridge messages
    const mockPostMessage = vi.fn((message: any, targetOrigin: string) => {
      const event = new MessageEvent("message", {
        data: message,
        origin: targetOrigin,
        source: window,
      });
      setTimeout(() => {
        window.dispatchEvent(event);
      }, 0);
    });
    window.postMessage = mockPostMessage as any;
  });

  let messageHandlers: ((event: MessageEvent) => void)[] = [];

  afterEach(() => {
    bridge.disconnect();
    vi.restoreAllMocks();
    // Clean up all message handlers registered during tests
    messageHandlers.forEach((handler) => {
      window.removeEventListener("message", handler);
    });
    messageHandlers = [];
  });

  // Helper function to register and track message handlers
  const addMessageHandler = (handler: (event: MessageEvent) => void) => {
    messageHandlers.push(handler);
    window.addEventListener("message", handler);
  };

  // Helper to create proper MessageEvent with correct origin
  const mockMessageEvent = (data: any) => {
    const event = new MessageEvent("message", {
      data,
      origin: baseUrl,
      source: window,
    });
    setTimeout(() => {
      window.dispatchEvent(event);
    }, 0);
  };

  it("should inject the guest script on connect", async () => {
    const messageHandler = (event: MessageEvent) => {
      const data = event.data;
      if (data && data.type === HostMessageType.HANDSHAKE_INIT) {
        // Reply with ACK asynchronously to simulate real behavior
        mockMessageEvent({
          source: "actual-bridge-guest",
          type: GuestMessageType.HANDSHAKE_ACK,
          id: data.id,
          payload: { success: true },
        });
      }
    };

    addMessageHandler(messageHandler);

    await bridge.connect({ baseUrl });

    // Verify script tag was created
    const script = document.head.querySelector("script");
    expect(script).toBeTruthy();
    expect(script!.textContent).toContain("window.postMessage");
  });

  it("should handle getTransactions", async () => {
    const messageHandler = (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.source !== "actual-bridge-host") return;

      if (data.type === HostMessageType.HANDSHAKE_INIT) {
        mockMessageEvent({
          source: "actual-bridge-guest",
          type: GuestMessageType.HANDSHAKE_ACK,
          id: data.id,
          payload: { success: true },
        });
      } else if (data.type === HostMessageType.GET_TRANSACTIONS) {
        mockMessageEvent({
          source: "actual-bridge-guest",
          type: GuestMessageType.COMMAND_RESPONSE,
          id: data.id,
          payload: { success: true, data: [{ id: "tx-1", amount: 100 }] },
        });
      }
    };

    addMessageHandler(messageHandler);

    await bridge.connect({ baseUrl });
    const txs = await bridge.getTransactions();

    expect(txs).toHaveLength(1);
    expect(txs?.[0]?.id).toBe("tx-1");
  });

  it("should handle getAccounts", async () => {
    const messageHandler = (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.source !== "actual-bridge-host") return;

      if (data.type === HostMessageType.HANDSHAKE_INIT) {
        mockMessageEvent({
          source: "actual-bridge-guest",
          type: GuestMessageType.HANDSHAKE_ACK,
          id: data.id,
          payload: { success: true },
        });
      } else if (data.type === HostMessageType.GET_ACCOUNTS) {
        mockMessageEvent({
          source: "actual-bridge-guest",
          type: GuestMessageType.COMMAND_RESPONSE,
          id: data.id,
          payload: { success: true, data: [{ id: "acc-1", name: "Checking" }] },
        });
      }
    };

    addMessageHandler(messageHandler);

    await bridge.connect({ baseUrl });
    const accounts = await bridge.getAccounts();

    expect(accounts).toHaveLength(1);
    expect(accounts?.[0]?.name).toBe("Checking");
  });

  it("should getAccountByName", async () => {
    const messageHandler = (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.source !== "actual-bridge-host") return;

      if (data.type === HostMessageType.HANDSHAKE_INIT) {
        mockMessageEvent({
          source: "actual-bridge-guest",
          type: GuestMessageType.HANDSHAKE_ACK,
          id: data.id,
          payload: { success: true },
        });
      } else if (data.type === HostMessageType.GET_ACCOUNTS) {
        mockMessageEvent({
          source: "actual-bridge-guest",
          type: GuestMessageType.COMMAND_RESPONSE,
          id: data.id,
          payload: { success: true, data: [{ id: "acc-1", name: "Savings" }] },
        });
      }
    };

    addMessageHandler(messageHandler);

    await bridge.connect({ baseUrl });
    const account = await bridge.getAccountByName("savings"); // Case insensitive
    expect(account).toBeTruthy();
    expect(account?.id).toBe("acc-1");
  });
});
