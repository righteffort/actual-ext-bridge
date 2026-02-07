import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ContentScriptBridge } from "../src/content/content-script-bridge";
import { CONTENT_SCRIPT_RPC_TAG } from "../src/shared/rpc-interface.ts";

// Must match jsdom url in vitest.config.ts
const TEST_ORIGIN = "https://test.example.com";

describe("ContentScriptBridge", () => {
  let bridge: ContentScriptBridge;
  let scriptCreated = true;
  let scriptUrl = "";

  const setupMockInjection = () => {
    // Mock document.createElement to intercept script creation.
    // We don't care about the originals or even their behavior.
    // This is gross (see the globals above!)
    document.createElement = vi.fn().mockImplementation((tagName: string) => {
      if (tagName === "script") {
        const mockScript = {
          set src(url: string) {
            scriptUrl = url;
            // Simulate successful script load by triggering handshake
            setTimeout(() => {
              // Simulate the injected script calling rpc.handshake()
              window.postMessage({
                m: "handshake",
                a: [],
                i: "mock-handshake-id",
                t: "q",
                axbTarget: CONTENT_SCRIPT_RPC_TAG,
              }, window.origin);
            }, 10);
          },
          get src() { return scriptUrl; },
          onload: null as (() => void) | null,
          onerror: null as ((e: Event) => void) | null,
          remove: vi.fn(),
        };
        return mockScript;
      }
      return "";
    });

    // Mock appendChild to be a no-op for scripts
    const originalAppendChild = document.head.appendChild;
    document.head.appendChild = vi.fn().mockImplementation((node: Node) => {
      if ((node as any).src) {
        // This is our mock script, don't actually append it
        return node;
      }
      return originalAppendChild.call(document.head, node);
    });
  };

  beforeEach(() => {
    document.head.innerHTML = "";
    bridge = new ContentScriptBridge();

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

    setupMockInjection();
  });

  let messageHandlers: ((event: MessageEvent) => void)[] = [];

  afterEach(() => {
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
      origin: TEST_ORIGIN,
      source: window,
    });
    setTimeout(() => {
      window.dispatchEvent(event);
    }, 0);
  };

  it("should inject the guest script on connect", async () => {
    // TODO: we should check that we *respond* to the handshake message!
    await bridge.connect();

    // Verify script creation was attempted.
    expect(scriptCreated).toBe(true);
    expect(scriptUrl).toContain("src/content/injected-actual.js");
  });

  it("should handle getTransactions", async () => {
    const messageHandler = (event: MessageEvent) => {
      const data = event.data;

      if (data && data.m === "getTransactions") {
        mockMessageEvent({
          i: data.i,
          t: "s",
          r: [{ id: "tx-1", amount: 100 }],
          axbTarget: CONTENT_SCRIPT_RPC_TAG,
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

      if (data && data.m === "getAccounts") {
        mockMessageEvent({
          i: data.i,
          t: "s",
          r: [{ id: "acc-1", name: "Checking" }],
          axbTarget: CONTENT_SCRIPT_RPC_TAG,
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

      if (data && data.m === "getAccounts") {
        mockMessageEvent({
          i: data.i,
          t: "s",
          r: [{ id: "acc-1", name: "Savings" }],
          axbTarget: CONTENT_SCRIPT_RPC_TAG,
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

      if (data && data.m === "updateTransaction") {
        mockMessageEvent({
          i: data.i,
          t: "s",
          r: undefined,
          axbTarget: CONTENT_SCRIPT_RPC_TAG,
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
            axbTarget: CONTENT_SCRIPT_RPC_TAG,
          });
        }, 5);
      } else if (data && data.m === "createTransaction") {
        mockMessageEvent({
          i: data.i,
          t: "s",
          r: undefined,
          axbTarget: CONTENT_SCRIPT_RPC_TAG,
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

    // Wait a bit for the state update to be processed
    // TODO: gross!
    await new Promise((resolve) => setTimeout(resolve, 10));

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
            axbTarget: CONTENT_SCRIPT_RPC_TAG,
          });
        }, 5);
      }
    };

    addMessageHandler(messageHandler);

    await bridge.connect();

    // Wait a bit for the state update to be processed
    // TODO: gross!
    await new Promise((resolve) => setTimeout(resolve, 10));

    const transactionWithDifferentAccount = {
      account: "acc-2", // Different from current context
      date: "2024-01-01",
      amount: 100,
      payee_name: "Test Payee",
    };

    await expect(
      bridge.createTransaction(transactionWithDifferentAccount),
    ).rejects.toThrow("AXB: Current view (acc-1) does not match target (acc-2)");
  });

  it("should handle duplicate transaction error", async () => {
    const messageHandler = (event: MessageEvent) => {
      const data = event.data;

      if (data && data.m === "handshake") {
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
            axbTarget: CONTENT_SCRIPT_RPC_TAG,
          });
        }, 5);
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
          axbTarget: CONTENT_SCRIPT_RPC_TAG,
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

    // Wait a bit for the state update to be processed
    // TODO: gross!
    await new Promise((resolve) => setTimeout(resolve, 10));

    await expect(
      bridge.createTransaction(duplicateTransaction),
    ).rejects.toThrow("Duplicate transaction detected.");
  });

});
