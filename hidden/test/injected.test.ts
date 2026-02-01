import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Transaction } from "../src/types";

// DIRECT IMPORT: Runs the side-effects immediately in the JSDOM window.
// This relies on test/setup.ts setting the global bypass variable.
import "../src/injected";

describe("Injected Script Logic (Main World)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockOnSave: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockOnAdd: any;

  beforeEach(() => {
    document.body.innerHTML = "";
    mockOnSave = vi.fn();
    mockOnAdd = vi.fn();
    // Reset URL to a known state using JSDOM history
    window.history.pushState({}, "", "/");
  });

  // Helper to wait for the script to reply via postMessage
  function waitForResponse(messageId: string): Promise<any> {
    return new Promise((resolve) => {
      const handler = (e: MessageEvent) => {
        if (
          e.data.type === "ACTUAL_BRIDGE_DATA" &&
          e.data.messageId === messageId
        ) {
          window.removeEventListener("message", handler);
          resolve(e.data);
        }
      };
      window.addEventListener("message", handler);
    });
  }

  function createMockTable(transactions: Transaction[] = []) {
    const row = document.createElement("div");
    row.className = "recs-table-row";
    document.body.appendChild(row);

    const fiberKey = "__reactFiberTest";
    // @ts-expect-error - Mocking internal React key
    row[fiberKey] = {
      memoizedProps: {
        transactions: transactions,
        payees: [{ id: "payee-1", name: "Amazon" }],
        onSave: mockOnSave,
        onAdd: mockOnAdd,
      },
      return: null,
    };
    return row;
  }

  it("rejects import when context is ambiguous (All Accounts)", async () => {
    createMockTable();
    window.history.pushState({}, "", "/accounts");

    const msgId = "test-1";
    const responsePromise = waitForResponse(msgId);

    window.postMessage(
      {
        type: "ACTUAL_BRIDGE_CMD",
        command: "IMPORT_TRANSACTION",
        messageId: msgId,
        payload: {
          amount: -100,
          imported_id: "new-1",
          payee_name: "Amazon",
        },
      },
      "*",
    );

    const res = await responsePromise;
    expect(res.error).toMatch(/Cannot infer Account ID/);
  }, 10000);

  it("infers account ID from URL in Single Account view", async () => {
    createMockTable();
    const accId = "8f3b9c20-1234-1234-1234-123456789abc";
    window.history.pushState({}, "", `/accounts/${accId}`);

    const msgId = "test-2";
    const responsePromise = waitForResponse(msgId);

    window.postMessage(
      {
        type: "ACTUAL_BRIDGE_CMD",
        command: "IMPORT_TRANSACTION",
        messageId: msgId,
        payload: {
          amount: -100,
          imported_id: "new-2",
          payee_name: "Amazon",
        },
      },
      "*",
    );

    const res = await responsePromise;
    expect(res.payload).toEqual({ success: true });

    expect(mockOnAdd).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ account: accId })]),
    );
  }, 10000);

  it("prevents race conditions on concurrent imports", async () => {
    createMockTable();
    window.history.pushState(
      {},
      "",
      "/accounts/8f3b9c20-1234-1234-1234-123456789abc",
    );

    // Simulate slow database
    mockOnAdd.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 50)),
    );

    const p1 = waitForResponse("race-1");
    const p2 = waitForResponse("race-2");

    // Fire two identical imports
    window.postMessage(
      {
        type: "ACTUAL_BRIDGE_CMD",
        command: "IMPORT_TRANSACTION",
        messageId: "race-1",
        payload: { imported_id: "race-id", amount: -10, payee_name: "Amazon" },
      },
      "*",
    );

    window.postMessage(
      {
        type: "ACTUAL_BRIDGE_CMD",
        command: "IMPORT_TRANSACTION",
        messageId: "race-2",
        payload: { imported_id: "race-id", amount: -10, payee_name: "Amazon" },
      },
      "*",
    );

    const [res1, res2] = await Promise.all([p1, p2]);

    // One success, one skip
    const successes = [res1, res2].filter((r) => r.payload?.success).length;
    const skips = [res1, res2].filter(
      (r) => r.payload?.status === "skipped_duplicate",
    ).length;

    expect(successes).toBe(1);
    expect(skips).toBe(1);
    expect(mockOnAdd).toHaveBeenCalledTimes(1);
  }, 15000);
});
