/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  HostMessageType,
  GuestMessageType,
  SOURCE_HOST,
  TEST_ORIGIN,
} from "../src/shared/constants";

// Helper to construct a Fiber Node mock
function createFiber(props: any, returnFiber: any = null) {
  return {
    memoizedProps: props,
    return: returnFiber,
    stateNode: {},
  };
}

describe("Guest Logic", () => {
  let postMessageSpy: any;

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

  it("should poll and detect when Actual is not ready", async () => {
    await import("../src/core/guest-logic");

    // Fast-forward time to trigger poll
    vi.useFakeTimers();
    vi.advanceTimersByTime(2500);

    // Should verify it sent a state update with connected: false
    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: GuestMessageType.STATE_UPDATE,
        payload: expect.objectContaining({ connected: false }),
      }),
      expect.anything(),
    );

    vi.useRealTimers();
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
    document.body.innerHTML = `<div class="recs-table-row"></div>`;
    const anchor = document.querySelector(".recs-table-row") as any;

    // Note: The logic searches for keys starting with __reactFiber
    const key = "__reactFiber" + Math.random().toString(36).slice(2);
    anchor[key] = child;

    await import("../src/core/guest-logic");

    vi.useFakeTimers();
    vi.advanceTimersByTime(2500);

    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: GuestMessageType.STATE_UPDATE,
        payload: expect.objectContaining({ connected: true }),
      }),
      expect.anything(),
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
    document.body.innerHTML = `<div class="recs-table-row"></div>`;
    const anchor = document.querySelector(".recs-table-row") as any;
    const key = "__reactFiberTest";
    anchor[key] = createFiber(props);

    await import("../src/core/guest-logic");

    // Send Create Request (New Payee)
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          source: SOURCE_HOST,
          type: HostMessageType.CREATE_TRANSACTION,
          id: "req-1",
          payload: {
            account: "acc-1",
            date: "2023-01-01",
            amount: 100,
            payee_name: "New Store",
            imported_id: "imp-1",
          },
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

    // Check Response
    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: GuestMessageType.COMMAND_RESPONSE,
        id: "req-1",
        payload: { success: true },
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

    document.body.innerHTML = `<div class="recs-table-row"></div>`;
    const anchor = document.querySelector(".recs-table-row") as any;
    const key = "__reactFiberTest";
    anchor[key] = createFiber(props);

    await import("../src/core/guest-logic");

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          source: SOURCE_HOST,
          type: HostMessageType.CREATE_TRANSACTION,
          id: "req-dup",
          payload: {
            account: "acc-1",
            date: "2023-01-01",
            imported_id: "imp-dup", // DUPLICATE
          },
        },
        origin: TEST_ORIGIN,
      }),
    );

    await new Promise((r) => setTimeout(r, 100));

    expect(onAdd).not.toHaveBeenCalled();
    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: GuestMessageType.COMMAND_RESPONSE,
        payload: expect.objectContaining({
          success: false,
          code: "DUPLICATE",
          importedId: "imp-dup",
        }),
      }),
      expect.anything(),
    );
  });
});
