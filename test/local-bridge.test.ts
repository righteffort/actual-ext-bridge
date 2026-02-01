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
  });

  afterEach(() => {
    bridge.disconnect();
    vi.restoreAllMocks();
  });

  it("should inject the guest script on connect", async () => {
    // We need to mock the handshake response so connect() resolves
    const postMessageSpy = vi.spyOn(window, "postMessage");
    
    // Simulate the Guest responding to HANDSHAKE_INIT
    window.addEventListener("message", (event) => {
        const data = event.data;
        if (data && data.type === HostMessageType.HANDSHAKE_INIT) {
            // Reply with ACK
            window.postMessage({
                source: "actual-bridge-guest",
                type: GuestMessageType.HANDSHAKE_ACK,
                id: data.id,
                payload: { success: true }
            }, "*");
        }
    });

    await bridge.connect({ baseUrl });

    // Verify script tag was created
    const script = document.head.querySelector("script");
    expect(script).toBeTruthy();
    expect(script?.textContent).toContain('window.postMessage');
  });

  it("should send RPC requests and handle responses", async () => {
    // Mock connection first (skip handshake for this test by mocking send)
    // Actually, let's just mock the private _send or handle the message flow
    
    // We'll mock the internal send to avoid handshake complexity for this specific unit
    // But integration style is better. Let's do a quick fake handshake.
    
    // Auto-reply to everything
    window.addEventListener("message", (event) => {
        const data = event.data;
        if (!data || data.source !== "actual-bridge-host") return;
        
        if (data.type === HostMessageType.HANDSHAKE_INIT) {
             window.postMessage({
                source: "actual-bridge-guest",
                type: GuestMessageType.HANDSHAKE_ACK,
                id: data.id,
                payload: { success: true }
            }, "*");
        } else if (data.type === HostMessageType.GET_TRANSACTIONS) {
             window.postMessage({
                source: "actual-bridge-guest",
                type: GuestMessageType.COMMAND_RESPONSE,
                id: data.id,
                payload: { success: true, data: [{ id: "tx-1", amount: 100 }] }
            }, "*");
        }
    });

    await bridge.connect({ baseUrl });
    const txs = await bridge.getTransactions();
    
    expect(txs).toHaveLength(1);
    expect(txs?.[0].id).toBe("tx-1");
  });
});
