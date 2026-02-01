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
    const mockPostMessage = vi.fn((message: unknown, targetOrigin: string) => {
      const event = new MessageEvent("message", {
        data: message,
        origin: targetOrigin,
        source: window,
      });
      setTimeout(() => {
        window.dispatchEvent(event);
      }, 0);
    });
    window.postMessage =
      mockPostMessage as unknown as typeof window.postMessage;
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
  const mockMessageEvent = (data: unknown) => {
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
    expect(script?.textContent).toContain("window.postMessage");
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

  it("should handle saveTransaction", async () => {
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
      } else if (data.type === HostMessageType.SAVE_TRANSACTION) {
        mockMessageEvent({
          source: "actual-bridge-guest",
          type: GuestMessageType.COMMAND_RESPONSE,
          id: data.id,
          payload: { success: true },
        });
      }
    };

    addMessageHandler(messageHandler);

    await bridge.connect({ baseUrl });
    
    const transaction = {
      id: "tx-123",
      account: "acc-1",
      amount: 100,
      date: "2024-01-01",
    };

    await expect(bridge.saveTransaction(transaction)).resolves.toBeUndefined();
  });

  it("should throw error when saveTransaction called without transaction ID", async () => {
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
      }
    };

    addMessageHandler(messageHandler);

    await bridge.connect({ baseUrl });
    
    const transactionWithoutId = {
      account: "acc-1",
      amount: 100,
      date: "2024-01-01",
    };

    await expect(bridge.saveTransaction(transactionWithoutId as any)).rejects.toThrow(
      "Transaction ID required for save."
    );
  });

  it("should handle createTransaction successfully", async () => {
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
      } else if (data.type === HostMessageType.CREATE_TRANSACTION) {
        mockMessageEvent({
          source: "actual-bridge-guest",
          type: GuestMessageType.COMMAND_RESPONSE,
          id: data.id,
          payload: { success: true },
        });
      }
    };

    addMessageHandler(messageHandler);

    await bridge.connect({ baseUrl });
    
    const importTransaction = {
      account: "acc-1",
      date: "2024-01-01",
      amount: 100,
      payee_name: "Test Payee",
      imported_id: "import-123",
    };

    await expect(bridge.createTransaction(importTransaction)).resolves.toBeUndefined();
  });

  it("should throw error when createTransaction called without account ID", async () => {
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
      }
    };

    addMessageHandler(messageHandler);

    await bridge.connect({ baseUrl });
    
    const transactionWithoutAccount = {
      date: "2024-01-01",
      amount: 100,
      payee_name: "Test Payee",
    };

    await expect(bridge.createTransaction(transactionWithoutAccount as any)).rejects.toThrow(
      "Account ID is mandatory for creation."
    );
  });

  it("should throw context error when account mismatch in single account view", async () => {
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
        // Simulate state update with single account context
        mockMessageEvent({
          source: "actual-bridge-guest",
          type: GuestMessageType.STATE_UPDATE,
          payload: {
            connected: true,
            context: { type: "SINGLE_ACCOUNT", accountId: "acc-1" },
          },
        });
      }
    };

    addMessageHandler(messageHandler);

    await bridge.connect({ baseUrl });
    
    // Wait a bit for the state update to be processed
    await new Promise(resolve => setTimeout(resolve, 10));
    
    const transactionWithDifferentAccount = {
      account: "acc-2", // Different from current context
      date: "2024-01-01",
      amount: 100,
      payee_name: "Test Payee",
    };

    await expect(bridge.createTransaction(transactionWithDifferentAccount)).rejects.toThrow(
      "Current view (acc-1) matches not target (acc-2)."
    );
  });

  it("should handle duplicate transaction error", async () => {
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
      } else if (data.type === HostMessageType.CREATE_TRANSACTION) {
        mockMessageEvent({
          source: "actual-bridge-guest",
          type: GuestMessageType.COMMAND_RESPONSE,
          id: data.id,
          payload: {
            success: false,
            error: "Duplicate transaction detected.",
            code: "DUPLICATE",
            importedId: "import-123",
          },
        });
      }
    };

    addMessageHandler(messageHandler);

    await bridge.connect({ baseUrl });
    
    const duplicateTransaction = {
      account: "acc-1",
      date: "2024-01-01",
      amount: 100,
      imported_id: "import-123",
    };

    await expect(bridge.createTransaction(duplicateTransaction)).rejects.toThrow(
      "Duplicate transaction detected."
    );
  });

  it("should allow createTransaction in all accounts view regardless of target account", async () => {
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
        // Simulate state update with all accounts context
        mockMessageEvent({
          source: "actual-bridge-guest",
          type: GuestMessageType.STATE_UPDATE,
          payload: {
            connected: true,
            context: { type: "ALL_ACCOUNTS", accountId: null },
          },
        });
      } else if (data.type === HostMessageType.CREATE_TRANSACTION) {
        mockMessageEvent({
          source: "actual-bridge-guest",
          type: GuestMessageType.COMMAND_RESPONSE,
          id: data.id,
          payload: { success: true },
        });
      }
    };

    addMessageHandler(messageHandler);

    await bridge.connect({ baseUrl });
    
    const transactionForAnyAccount = {
      account: "acc-2",
      date: "2024-01-01",
      amount: 100,
      payee_name: "Test Payee",
    };

    await expect(bridge.createTransaction(transactionForAnyAccount)).resolves.toBeUndefined();
  });
});
