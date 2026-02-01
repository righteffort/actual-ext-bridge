import { describe, it, expect, beforeEach } from "vitest";
import { RemoteBridge } from "../src/core/remote-bridge";
import {
  ARBITER_MESSAGE_TYPE,
  ArbiterMessageType,
} from "../src/background/arbiter";
import browser from "webextension-polyfill";

describe("RemoteBridge", () => {
  let bridge: RemoteBridge;

  beforeEach(() => {
    bridge = new RemoteBridge();
  });

  it("should proxy method calls to Arbiter", async () => {
    await bridge.getAccounts();

    expect(browser.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: ARBITER_MESSAGE_TYPE,
        action: ArbiterMessageType.PROXY_REQUEST,
        payload: expect.objectContaining({
          method: "getAccounts",
          args: [],
        }),
      }),
    );
  });

  it("should handle proxy errors", async () => {
    browser.runtime.sendMessage.mockResolvedValue({
      success: false,
      error: "Remote Error",
    });

    await expect(bridge.getTransactions()).rejects.toThrow("Remote Error");
  });

  it("should filter transactions client-side", async () => {
    const mockTxs = [
      { id: "1", amount: 100 },
      { id: "2", amount: 200 },
    ];

    browser.runtime.sendMessage.mockResolvedValue({
      success: true,
      data: mockTxs,
    });

    const result = await bridge.getTransactions((t) => t.amount > 150);
    expect(result).toHaveLength(1);
    expect(result?.[0]?.id).toBe("2");
  });
});
