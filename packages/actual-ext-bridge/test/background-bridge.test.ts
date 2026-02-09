import { describe, it, expect, beforeEach, vi } from "vitest";
import { BackgroundBridge } from "../src/background/background-bridge";
import {
  ROUTER_MESSAGE_TYPE,
  RouterMessageType,
} from "../src/background/rpc-router";
import browser from "webextension-polyfill";

vi.mock("webextension-polyfill");

describe("BackgroundBridge", () => {
  let bridge: BackgroundBridge;

  beforeEach(() => {
    bridge = new BackgroundBridge();
  });

  it("should proxy method calls to router", async () => {
    await bridge.getAccounts();

    expect(browser.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: ROUTER_MESSAGE_TYPE,
        action: RouterMessageType.PROXY_REQUEST,
        payload: expect.objectContaining({
          method: "getAccounts",
          args: [],
        }),
      }),
    );
  });

  it("should handle proxy errors", async () => {
    vi.mocked(browser.runtime.sendMessage).mockResolvedValue({
      success: false,
      error: "Bridge Error",
    });

    await expect(bridge.getTransactions()).rejects.toThrow("Bridge Error");
  });

  it("should filter transactions client-side", async () => {
    const mockTxs = [
      { id: "1", amount: 100 },
      { id: "2", amount: 200 },
    ];

    vi.mocked(browser.runtime.sendMessage).mockResolvedValue({
      success: true,
      data: mockTxs,
    });

    const result = await bridge.getTransactions((t) => t.amount > 150);
    expect(result).toHaveLength(1);
    expect(result?.[0]?.id).toBe("2");
  });
});
