import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LocalBridge } from "../src/core/local-bridge";

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
      // Handle birpc handshake call
      if (data && data.m === "handshake") {
        // Reply with birpc success response
        mockMessageEvent({
          i: data.i,
          t: "s",
          r: { success: true },
        });
      }
    };

    addMessageHandler(messageHandler);

    await bridge.connect();

    // Verify script tag was created
    const script = document.head.querySelector("script");
    expect(script).toBeTruthy();
    expect(script?.textContent).toContain("window.postMessage");
  });

  it("should handle getTransactions", async () => {
    const messageHandler = (event: MessageEvent) => {
      const data = event.data;

      if (data && data.m === "handshake") {
        mockMessageEvent({
          i: data.i,
          t: "s",
          r: { success: true },
        });
      } else if (data && data.m === "getTransactions") {
        mockMessageEvent({
          i: data.i,
          t: "s",
          r: [{ id: "tx-1", amount: 100 }],
        });
      }
    };

    addMessageHandler(messageHandler);

    await bridge.connect();
    const txs = await bridge.getTransactions();

    expect(txs).toHaveLength(1);
    expect(txs?.[0]?.id).toBe("tx-1");
  });

  it("should handle getAccounts", async () => {
    const messageHandler = (event: MessageEvent) => {
      const data = event.data;

      if (data && data.m === "handshake") {
        mockMessageEvent({
          i: data.i,
          t: "s",
          r: { success: true },
        });
      } else if (data && data.m === "getAccounts") {
        mockMessageEvent({
          i: data.i,
          t: "s",
          r: [{ id: "acc-1", name: "Checking" }],
        });
      }
    };

    addMessageHandler(messageHandler);

    await bridge.connect();
    const accounts = await bridge.getAccounts();

    expect(accounts).toHaveLength(1);
    expect(accounts?.[0]?.name).toBe("Checking");
  });

  it("should getAccountByName", async () => {
    const messageHandler = (event: MessageEvent) => {
      const data = event.data;

      if (data && data.m === "handshake") {
        mockMessageEvent({
          i: data.i,
          t: "s",
          r: { success: true },
        });
      } else if (data && data.m === "getAccounts") {
        mockMessageEvent({
          i: data.i,
          t: "s",
          r: [{ id: "acc-1", name: "Savings" }],
        });
      }
    };

    addMessageHandler(messageHandler);

    await bridge.connect();
    const account = await bridge.getAccountByName("savings"); // Case insensitive
    expect(account).toBeTruthy();
    expect(account?.id).toBe("acc-1");
  });

  it("should handle updateTransaction", async () => {
    const messageHandler = (event: MessageEvent) => {
      const data = event.data;

      if (data && data.m === "handshake") {
        mockMessageEvent({
          i: data.i,
          t: "s",
          r: { success: true },
        });
      } else if (data && data.m === "updateTransaction") {
        mockMessageEvent({
          i: data.i,
          t: "s",
          r: undefined,
        });
      }
    };

    addMessageHandler(messageHandler);

    await bridge.connect();

    const transaction = {
      id: "tx-123",
      account: "acc-1",
      amount: 100,
      date: "2024-01-01",
    };

    await expect(
      bridge.updateTransaction(transaction),
    ).resolves.toBeUndefined();
  });

  it("should throw error when updateTransaction called without transaction ID", async () => {
    const messageHandler = (event: MessageEvent) => {
      const data = event.data;

      if (data && data.m === "handshake") {
        mockMessageEvent({
          i: data.i,
          t: "s",
          r: { success: true },
        });
      }
    };

    addMessageHandler(messageHandler);

    await bridge.connect();

    const transactionWithoutId = {
      account: "acc-1",
      amount: 100,
      date: "2024-01-01",
    };

    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Omit id for test
      bridge.updateTransaction(transactionWithoutId as any),
    ).rejects.toThrow("Transaction ID required for update.");
  });

  // TODO: test split. something like this but actually validate the behavior
  // it("should split a transaction via updateTransaction", async () => {
  //   // Setup Host Listener to mock the UPDATE_TRANSACTION response
  //   window.addEventListener("message", (event) => {
  //     const data = event.data;
  //     if (data && data.type === HostMessageType.UPDATE_TRANSACTION) {
  //       const payload = data.payload;
  //       // Verify payload structure for split
  //       if (payload.is_parent && payload.subtransactions.length === 2) {
  //         mockMessageEvent({
  //           source: "actual-bridge-guest",
  //           type: GuestMessageType.COMMAND_RESPONSE,
  //           id: data.id,
  //           payload: { success: true }
  //         });
  //       }
  //     }
  //     // ... (Handshake handling if needed, usually mocked in beforeEach or helper)
  //   });

  //   await bridge.connect();

  //   const original = {
  //     id: "tx-parent",
  //     amount: 100,
  //     account: "acc-1",
  //     date: "2023-01-01"
  //   };

  //   const splits = [
  //     { amount: 50, notes: "Split 1" },
  //     { amount: 50, notes: "Split 2" }
  //   ];

  //   await bridge.splitTransaction(original, splits);
  //   // Assertion is implicit via the mock responding success only if valid
  //   // But we can also spy on send if we exposed it or mocked window.postMessage
  // });

  it("should handle createTransaction successfully", async () => {
    const messageHandler = (event: MessageEvent) => {
      const data = event.data;

      if (data && data.m === "handshake") {
        mockMessageEvent({
          i: data.i,
          t: "s",
          r: { success: true },
        });
      } else if (data && data.m === "createTransaction") {
        mockMessageEvent({
          i: data.i,
          t: "s",
          r: undefined,
        });
      }
    };

    addMessageHandler(messageHandler);

    await bridge.connect();

    const importTransaction = {
      account: "acc-1",
      date: "2024-01-01",
      amount: 100,
      payee_name: "Test Payee",
      imported_id: "import-123",
    };

    await expect(
      bridge.createTransaction(importTransaction),
    ).resolves.toBeUndefined();
  });

  it("should throw error when createTransaction called without account ID", async () => {
    const messageHandler = (event: MessageEvent) => {
      const data = event.data;

      if (data && data.m === "handshake") {
        mockMessageEvent({
          i: data.i,
          t: "s",
          r: { success: true },
        });
      }
    };

    addMessageHandler(messageHandler);

    await bridge.connect();

    const transactionWithoutAccount = {
      date: "2024-01-01",
      amount: 100,
      payee_name: "Test Payee",
    };

    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Omit account for test
      bridge.createTransaction(transactionWithoutAccount as any),
    ).rejects.toThrow("Account ID is mandatory for creation.");
  });

  it("should throw context error when account mismatch in single account view", async () => {
    const messageHandler = (event: MessageEvent) => {
      const data = event.data;

      if (data && data.m === "handshake") {
        mockMessageEvent({
          i: data.i,
          t: "s",
          r: { success: true },
        });
        // Simulate state update with single account context via birpc
        setTimeout(() => {
          mockMessageEvent({
            m: "onStateUpdate",
            a: [
              {
                connected: true,
                context: { type: "SINGLE_ACCOUNT", accountId: "acc-1" },
              },
            ],
            t: "q",
          });
        }, 5);
      }
    };

    addMessageHandler(messageHandler);

    await bridge.connect();

    // Wait a bit for the state update to be processed
    await new Promise((resolve) => setTimeout(resolve, 10));

    const transactionWithDifferentAccount = {
      account: "acc-2", // Different from current context
      date: "2024-01-01",
      amount: 100,
      payee_name: "Test Payee",
    };

    await expect(
      bridge.createTransaction(transactionWithDifferentAccount),
    ).rejects.toThrow("Current view (acc-1) matches not target (acc-2).");
  });

  it("should handle duplicate transaction error", async () => {
    const messageHandler = (event: MessageEvent) => {
      const data = event.data;

      if (data && data.m === "handshake") {
        mockMessageEvent({
          i: data.i,
          t: "s",
          r: { success: true },
        });
      } else if (data && data.m === "createTransaction") {
        // Send birpc error response
        const error = new Error("Duplicate transaction detected") as Error & {
          code: string;
          importedId: string;
        };
        error.code = "DUPLICATE";
        error.importedId = "import-123";

        mockMessageEvent({
          i: data.i,
          t: "e",
          e: error,
        });
      }
    };

    addMessageHandler(messageHandler);

    await bridge.connect();

    const duplicateTransaction = {
      account: "acc-1",
      date: "2024-01-01",
      amount: 100,
      imported_id: "import-123",
    };

    await expect(
      bridge.createTransaction(duplicateTransaction),
    ).rejects.toThrow("Duplicate transaction detected.");
  });

  it("should allow createTransaction in all accounts view regardless of target account", async () => {
    const messageHandler = (event: MessageEvent) => {
      const data = event.data;

      if (data && data.m === "handshake") {
        mockMessageEvent({
          i: data.i,
          t: "s",
          r: { success: true },
        });
        // Simulate state update with all accounts context via birpc
        setTimeout(() => {
          mockMessageEvent({
            m: "onStateUpdate",
            a: [
              {
                connected: true,
                context: { type: "ALL_ACCOUNTS", accountId: null },
              },
            ],
            t: "q",
          });
        }, 5);
      } else if (data && data.m === "createTransaction") {
        mockMessageEvent({
          i: data.i,
          t: "s",
          r: undefined,
        });
      }
    };

    addMessageHandler(messageHandler);

    await bridge.connect();

    const transactionForAnyAccount = {
      account: "acc-2",
      date: "2024-01-01",
      amount: 100,
      payee_name: "Test Payee",
    };

    await expect(
      bridge.createTransaction(transactionForAnyAccount),
    ).resolves.toBeUndefined();
  });
});
