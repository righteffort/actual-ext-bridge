/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";

// Mock birpc at the top level before any imports
vi.mock("birpc", () => {
  const mockRpc = {
    handshake: vi.fn().mockResolvedValue({ success: true }),
    onStateUpdate: vi.fn().mockResolvedValue(undefined),
  };

  const mockCreateBirpc = vi.fn().mockReturnValue(mockRpc);

  return {
    createBirpc: mockCreateBirpc,
  };
});

import {
  init,
  createTransaction,
  findActualProps,
  getAccounts,
  getTransactions,
  updateTransaction,
  determineContext,
} from "../src/content/injected-actual-body";

// Get access to the mocked functions for testing
const { createBirpc } = await vi.importMock<typeof import("birpc")>("birpc");
const mockCreateBirpc = createBirpc as ReturnType<typeof vi.fn>;
const mockRpc = mockCreateBirpc.mock.results[0]?.value || {
  handshake: vi.fn().mockResolvedValue({ success: true }),
  onStateUpdate: vi.fn().mockResolvedValue(undefined),
};

// TODO: in a separate file (no mocks) test that real birpc is set up
// correctly: setting/checking origin and tag.

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
  it("should call rpc.handshake then rpc.onStateUpdate upon init", async () => {
    // Clear any previous calls
    mockRpc.handshake.mockClear();
    mockRpc.onStateUpdate.mockClear();

    // Set up DOM to simulate being on a transactions page
    document.body.innerHTML = `<div data-testid="transaction-table"></div>`;

    // Call init and wait for handshake
    await init();

    // Verify handshake was called
    expect(mockRpc.handshake).toHaveBeenCalledOnce();

    // Verify onStateUpdate was called after handshake
    expect(mockRpc.onStateUpdate).toHaveBeenCalledWith({
      connected: false, // No actual props found in our minimal DOM
      context: { type: "UNKNOWN", accountId: null },
    });
  });

  it("should periodically call onStateUpdate after init", async () => {
    console.log("negative seven");
    // Mock timers
    vi.useFakeTimers();

    // Clear any previous calls
    mockRpc.handshake.mockClear();
    mockRpc.onStateUpdate.mockClear();

    // Set up DOM
    document.body.innerHTML = `<div data-testid="transaction-table"></div>`;

    // Call init
    console.log("negative one");
    await init();

    // Let the handshake promise resolve and the interval be set up
    console.log("zero");
    await vi.runOnlyPendingTimersAsync();

    // Verify initial call happened
    console.log("one");
    expect(mockRpc.onStateUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        connected: false,
        context: { type: "UNKNOWN", accountId: null },
      }),
    );
    expect(mockRpc.onStateUpdate.mock.calls.length).toBeGreaterThanOrEqual(1);

    // Clear the initial call that happens after handshake
    console.log("two");
    mockRpc.onStateUpdate.mockClear();

    // Fast-forward time to trigger interval once
    console.log("three");
    vi.advanceTimersByTime(2000);

    // Verify onStateUpdate was called again by the interval
    console.log("four");
    expect(mockRpc.onStateUpdate).toHaveBeenCalledTimes(1);
    console.log("five");
    expect(mockRpc.onStateUpdate).toHaveBeenCalledWith({
      connected: false,
      context: { type: "UNKNOWN", accountId: null },
    });
    console.log("six");

    // Clear all timers to prevent infinite loop
    vi.clearAllTimers();
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
    document.body.innerHTML = `<div data-testid="transaction-table"></div>`;
    const anchor = document.querySelector(
      'div[data-testid="transaction-table"]',
    ) as HTMLElement & Record<string, unknown>;

    // Note: The logic searches for keys starting with __reactFiber
    const key = "__reactFiber" + Math.random().toString(36).slice(2);
    anchor[key] = child;

    // Test that findActualProps traverses up the fiber tree and finds the parent props
    const result = findActualProps();

    expect(result).toBeDefined();
    expect(result).toEqual({
      transactions: [],
      onSave: expect.any(Function),
      accounts: [],
      onAdd: expect.any(Function),
    });
  });

  it("should handle createTransaction with existing payee", async () => {
    const mockPayees = [
      { id: "payee1", name: "Existing Payee" },
      { id: "payee2", name: "Another Payee" },
    ];

    const mockProps = {
      transactions: [],
      accounts: [],
      payees: mockPayees,
      onSave: vi.fn(),
      onAdd: vi.fn().mockResolvedValue(undefined),
      onCreatePayee: vi.fn(),
    };

    const payload = {
      account: "acc1",
      date: "2024-01-01",
      amount: 1000,
      payee_name: "existing payee", // Case insensitive match
      notes: "Test transaction",
    };

    await createTransaction(mockProps, payload);

    expect(mockProps.onAdd).toHaveBeenCalledWith([
      {
        account: "acc1",
        date: "2024-01-01",
        amount: 1000,
        notes: "Test transaction",
        payee: "payee1", // Should use existing payee ID
      },
    ]);
    expect(mockProps.onCreatePayee).not.toHaveBeenCalled();
  });

  it("should handle createTransaction with new payee", async () => {
    const mockProps = {
      transactions: [],
      accounts: [],
      payees: [{ id: "payee1", name: "Existing Payee" }],
      onSave: vi.fn(),
      onAdd: vi.fn().mockResolvedValue(undefined),
      onCreatePayee: vi.fn().mockResolvedValue("new-payee-id"),
    };

    const payload = {
      account: "acc1",
      date: "2024-01-01",
      amount: 1000,
      payee_name: "New Payee",
      notes: "Test transaction",
    };

    await createTransaction(mockProps, payload);

    expect(mockProps.onCreatePayee).toHaveBeenCalledWith("New Payee");
    expect(mockProps.onAdd).toHaveBeenCalledWith([
      {
        account: "acc1",
        date: "2024-01-01",
        amount: 1000,
        notes: "Test transaction",
        payee: "new-payee-id",
      },
    ]);
  });

  it("should reject createTransaction with duplicate imported_id", async () => {
    const mockTransactions = [
      {
        id: "tx1",
        account: "acc1",
        date: "2024-01-03",
        amount: 1000,
        imported_id: "duplicate-id",
      },
    ];

    const mockProps = {
      transactions: mockTransactions,
      accounts: [],
      payees: [],
      onSave: vi.fn(),
      onAdd: vi.fn(),
      onCreatePayee: vi.fn(),
    };

    const payload = {
      account: "acc1",
      date: "2024-01-01",
      amount: 500,
      imported_id: "duplicate-id",
    };

    await expect(createTransaction(mockProps, payload)).rejects.toThrow();

    try {
      await createTransaction(mockProps, payload);
    } catch (error) {
      expect(error).toHaveProperty("code", "DUPLICATE");
      expect(error).toHaveProperty("importedId", "duplicate-id");
    }

    expect(mockProps.onAdd).not.toHaveBeenCalled();
  });

  it("should implement getTransactions", async () => {
    // Mock props with transactions
    const mockTransactions = [
      { id: "tx1", account: "acc1", amount: 1000, date: "2024-01-01" },
      { id: "tx2", account: "acc2", amount: -500, date: "2024-01-02" },
    ];

    const mockProps = {
      transactions: mockTransactions,
      accounts: [],
      onSave: vi.fn(),
      onAdd: vi.fn(),
    };

    // Test that getTransactions returns the transactions from props
    const result = getTransactions(mockProps);

    expect(result).toEqual(mockTransactions);
    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe("tx1");
    expect(result[1]?.amount).toBe(-500);
  });

  it("should implement updateTransaction", async () => {
    const mockProps = {
      transactions: [],
      accounts: [],
      onSave: vi.fn().mockResolvedValue(undefined),
      onAdd: vi.fn(),
    };

    const transaction = {
      id: "tx1",
      account: "acc1",
      amount: 1000,
      date: "2024-01-01",
    };

    const subtransactions = [
      { id: "sub1", account: "acc1", amount: 500 },
      { id: "sub2", account: "acc1", amount: 500 },
    ];

    await updateTransaction(mockProps, transaction, subtransactions, "amount");

    expect(mockProps.onSave).toHaveBeenCalledWith(
      transaction,
      subtransactions,
      "amount",
    );
  });

  it("should implement getAccounts", async () => {
    const mockAccounts = [
      { id: "acc1", name: "Checking Account" },
      { id: "acc2", name: "Savings Account" },
    ];

    const mockProps = {
      transactions: [],
      accounts: mockAccounts,
      onSave: vi.fn(),
      onAdd: vi.fn(),
    };

    const result = getAccounts(mockProps);

    expect(result).toEqual(mockAccounts);
    expect(result).toHaveLength(2);
    expect(result[0]?.name).toBe("Checking Account");
    expect(result[1]?.id).toBe("acc2");
  });

  it("should determine context from url correctly", async () => {
    // Test single account
    Object.defineProperty(window, "location", {
      value: { pathname: "/accounts/12345678-1234-1234-1234-123456789abc" },
      writable: true,
    });
    expect(determineContext()).toEqual({
      type: "SINGLE_ACCOUNT",
      accountId: "12345678-1234-1234-1234-123456789abc",
    });

    // Test all accounts
    window.location.pathname = "/accounts";
    expect(determineContext()).toEqual({
      type: "ALL_ACCOUNTS",
      accountId: null,
    });

    // Test off budget accounts
    window.location.pathname = "/accounts/offbudget";
    expect(determineContext()).toEqual({
      type: "OFF_BUDGET_ACCOUNTS",
      accountId: null,
    });

    // Test on budget accounts
    window.location.pathname = "/accounts/onbudget";
    expect(determineContext()).toEqual({
      type: "ON_BUDGET_ACCOUNTS",
      accountId: null,
    });

    // Test unknown context
    window.location.pathname = "/some/other/path";
    expect(determineContext()).toEqual({
      type: "UNKNOWN",
      accountId: null,
    });
  });
});
