/**
 * The "Traffic Cop" running in the Background Service Worker.
 * Enforces the Single Master policy across multiple Actual Budget tabs.
 */
export class BridgeArbiter {
  /**
   * Initializes the arbitration listeners.
   * Listens for HEARTBEAT and CLAIM_MASTER messages from Content Scripts.
   */
  public start(): void {
    // Stub: chrome.runtime.onMessage.addListener(...)
  }

  /**
   * Returns the ID of the current Master tab, or null if none.
   */
  public getMasterId(): number | null {
    return null;
  }

  /**
   * Forces a specific tab to become Master.
   * Useful if the UI manually selects a tab.
   */
  public setMaster(tabId: number): void {
    void tabId;
  }
}
