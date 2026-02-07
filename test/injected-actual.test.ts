/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { CONTENT_SCRIPT_RPC_TAG, INJECTED_RPC_TAG } from "../src/shared/rpc-interface";

// Must match jsdom url in vitest.config.ts
const TEST_ORIGIN = "https://test.example.com";

// Helper to construct a Fiber Node mock
function createFiber(
  props: Record<string, unknown>,
  returnFiber: Record<string, unknown> | null = null,
) {
  return {
    memoizedProps: props,
    return: returnFiber,
    stateNode: {},
  };
}

describe("Injected Logic", () => {
  let postMessageSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules(); // Vital to re-execute the module init
    document.body.innerHTML = "";
    postMessageSpy = vi.spyOn(window, "postMessage");

    // We import AFTER setting up spies/DOM to capture init()
    // but in this test suite structure, we might need to wait for the module to load.
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should call handshake", async () => {
    await import("../src/content/injected-actual");

    // Wait for handshake to be sent. TODO: gross
    await new Promise(resolve => setTimeout(resolve, 10));

    // Get the handshake message to extract the request ID
    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        m: "handshake",
        a: [],
        t: "q",
        axbTarget: CONTENT_SCRIPT_RPC_TAG,
        i: expect.any(String),
      }),
    );

    const handshakeCall = postMessageSpy.mock.calls[0]![0];
    const requestId = handshakeCall.i;

    // Simulate handshake response from content script
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          i: requestId,
          t: "s", // success response
          r: { success: true }, // response data
          axbTarget: INJECTED_RPC_TAG,
        },
        origin: window.origin,
      }),
    );

    // Wait for the onStateUpdate call to happen
    // TODO: gross!
    await vi.waitFor(() => {
      expect(postMessageSpy).toHaveBeenCalledTimes(2);
    }, { timeout: 100 });

    // Should see handshake first, then onStateUpdate
    expect(postMessageSpy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        m: "handshake",
        a: [],
        t: "q",
        axbTarget: CONTENT_SCRIPT_RPC_TAG,
        i: expect.any(String),
      }),
    );
    expect(postMessageSpy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        m: "onStateUpdate",
        a: [expect.objectContaining({ connected: false })], // false because no DOM setup
        axbTarget: CONTENT_SCRIPT_RPC_TAG,
        i: expect.any(String),
        t: "q",
      }),
    );
  });

  it("should traverse Fiber tree to find transaction props", async () => {
    // Setup deep fiber tree
    const grandParent = createFiber({ some: "prop" });
    const parent = createFiber(
      { transactions: [], onSave: vi.fn(), accounts: [], onAdd: vi.fn() },
      grandParent,
    );
    const child = createFiber({ className: "row" }, parent);

    // Setup DOM
    document.body.innerHTML = `<div data-testid="transaction-table"></div>`;
    const anchor = document.querySelector('div[data-testid="transaction-table"]') as HTMLElement &
      Record<string, unknown>;

    // Note: The logic searches for keys starting with __reactFiber
    const key = "__reactFiber" + Math.random().toString(36).slice(2);
    anchor[key] = child;

    await import("../src/content/injected-actual");

    // Wait for handshake to be sent
    await new Promise(resolve => setTimeout(resolve, 10));

    // Get the handshake message to extract the request ID
    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        m: "handshake",
        a: [],
        t: "q",
        axbTarget: CONTENT_SCRIPT_RPC_TAG,
        i: expect.any(String),
      }),
    );

    const handshakeCall = postMessageSpy.mock.calls[0]![0];
    const requestId = handshakeCall.i;

    // Simulate handshake response from content script
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          i: requestId,
          t: "s", // success response
          r: { success: true }, // response data
          axbTarget: INJECTED_RPC_TAG,
        },
        origin: window.origin,
      }),
    );

    vi.useFakeTimers();
    vi.advanceTimersByTime(2500);

    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        m: "onStateUpdate",
        a: [expect.objectContaining({ connected: true })],
      }),
    );
    vi.useRealTimers();
  });

  it("should handle CREATE_TRANSACTION and resolve payees", async () => {
    const onAdd = vi.fn().mockResolvedValue([]);
    const onCreatePayee = vi.fn().mockResolvedValue("new-payee-id");
    const existingPayeeId = "existing-p-1";

    const props = {
      transactions: [],
      onSave: vi.fn(),
      onAdd,
      accounts: [],
      payees: [{ id: existingPayeeId, name: "Existing Store" }],
      onCreatePayee,
    };

    // Setup DOM
    document.body.innerHTML = `<div data-testid="transaction-table"></div>`;
    const anchor = document.querySelector('div[data-testid="transaction-table"]') as HTMLElement &
      Record<string, unknown>;
    const key = "__reactFiberTest";
    anchor[key] = createFiber(props);

    // Simulate birpc call to createTransaction
    const createTransactionPayload = {
      account: "acc-1",
      date: "2023-01-01",
      amount: 100,
      payee_name: "New Store",
      imported_id: "imp-1",
    };

    // Send birpc message to createTransaction
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          m: "createTransaction",
          a: [createTransactionPayload],
          i: "req-1",
          t: "q",
        },
        origin: TEST_ORIGIN,
      }),
    );

    await new Promise((r) => setTimeout(r, 100));

    // Check payee creation
    expect(onCreatePayee).toHaveBeenCalledWith("New Store");

    // Check onAdd call with resolved ID
    expect(onAdd).toHaveBeenCalledWith([
      expect.objectContaining({
        payee: "new-payee-id",
        amount: 100,
      }),
    ]);

    // Check birpc response
    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        i: "req-1",
        t: "s",
      }),
      expect.anything(),
    );
  });

  it("should detect duplicate transactions during creation", async () => {
    const onAdd = vi.fn();
    const props = {
      transactions: [{ id: "tx-1", imported_id: "imp-dup" }],
      onSave: vi.fn(),
      onAdd,
      accounts: [],
      payees: [],
    };

    document.body.innerHTML = `<div data-testid="transaction-table"></div>`;
    const anchor = document.querySelector('div[data-testid="transaction-table"]') as HTMLElement &
      Record<string, unknown>;
    const key = "__reactFiberTest";
    anchor[key] = createFiber(props);

    await import("../src/content/injected-actual");

    // Send birpc message to createTransaction with duplicate
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          m: "createTransaction",
          a: [
            {
              account: "acc-1",
              date: "2023-01-01",
              imported_id: "imp-dup", // DUPLICATE
            },
          ],
          i: "req-dup",
          t: "q",
        },
        origin: TEST_ORIGIN,
      }),
    );

    await new Promise((r) => setTimeout(r, 100));

    expect(onAdd).not.toHaveBeenCalled();

    // Check birpc error response - birpc sends errors with t: "s" but includes error in e field
    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        i: "req-dup",
        t: "s",
        e: expect.objectContaining({
          message: "Duplicate transaction detected",
          code: "DUPLICATE",
          importedId: "imp-dup",
        }),
      }),
      expect.anything(),
    );
  });
});
