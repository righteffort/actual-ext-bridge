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
    // Setup DOM environment
    document.head.innerHTML = "";
    bridge = new LocalBridge();
    
    // Mock window.postMessage to intercept bridge messages
    const mockPostMessage = vi.fn((message: any, targetOrigin: string) => {
      // Manually trigger our test listener with the correct origin
      const event = new MessageEvent('message', {
        data: message,
        origin: targetOrigin,
        source: window
      });
      
      setTimeout(() => {
        window.dispatchEvent(event);
      }, 0);
    });
    
    // Cast to avoid TypeScript overload issues
    window.postMessage = mockPostMessage as any;
  });

  afterEach(() => {
    bridge.disconnect();
    vi.restoreAllMocks();
  });

  it("should inject the guest script on connect", async () => {
    // Helper to create proper MessageEvent with correct origin
    const mockMessageEvent = (data: any) => {
      const event = new MessageEvent('message', {
        data,
        origin: baseUrl,
        source: window
      });
      setTimeout(() => {
        window.dispatchEvent(event);
      }, 0);
    };
    
    // Simulate the Guest responding to HANDSHAKE_INIT
    window.addEventListener("message", (event) => {
        const data = event.data;
        if (data && data.type === HostMessageType.HANDSHAKE_INIT) {
            // Reply with ACK asynchronously to simulate real behavior
            mockMessageEvent({
                source: "actual-bridge-guest",
                type: GuestMessageType.HANDSHAKE_ACK,
                id: data.id,
                payload: { success: true }
            });
        }
    });

    await bridge.connect({ baseUrl });

    // Verify script tag was created
    const script = document.head.querySelector("script");
    expect(script).toBeTruthy();
    expect(script!.textContent).toContain('window.postMessage');
  });

  it("should send RPC requests and handle responses", async () => {
    // Helper to create proper MessageEvent with correct origin
    const mockMessageEvent = (data: any) => {
      const event = new MessageEvent('message', {
        data,
        origin: baseUrl,
        source: window
      });
      setTimeout(() => {
        window.dispatchEvent(event);
      }, 0);
    };

    // Auto-reply to everything
    window.addEventListener("message", (event) => {
        const data = event.data;
        if (!data || data.source !== "actual-bridge-host") return;
        
        // Use mockMessageEvent to simulate async message handling with correct origin
        if (data.type === HostMessageType.HANDSHAKE_INIT) {
            mockMessageEvent({
                source: "actual-bridge-guest",
                type: GuestMessageType.HANDSHAKE_ACK,
                id: data.id,
                payload: { success: true }
            });
        } else if (data.type === HostMessageType.GET_TRANSACTIONS) {
            mockMessageEvent({
                source: "actual-bridge-guest",
                type: GuestMessageType.COMMAND_RESPONSE,
                id: data.id,
                payload: { success: true, data: [{ id: "tx-1", amount: 100 }] }
            });
        }
    });

    await bridge.connect({ baseUrl });
    const txs = await bridge.getTransactions();
    
    expect(txs).toHaveLength(1);
    expect(txs?.[0]?.id).toBe("tx-1");
  });
});
