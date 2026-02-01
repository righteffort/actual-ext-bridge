/**
 * Helper class for Content Scripts to manage Single Master arbitration.
 * Connects to the `BridgeArbiter` in the background script.
 */
export class BridgeConnector {
  /**
   * Starts the arbitration loop.
   * Sends HEARTBEAT messages to the background.
   */
  public start(): void {
    // Stub: Would setup setInterval to send heartbeats
  }

  /**
   * Manually request to become the Master tab.
   * (e.g., User clicked "Enable Sync" on this tab).
   */
  public async claimMaster(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Subscribe to master status changes.
   * @param event 'master-changed'
   * @param callback (isMaster: boolean) => void
   */
  public on(
    event: "master-changed",
    callback: (isMaster: boolean) => void,
  ): void {
    // Stub: Would register listener
    // To suppress unused warning in stub:
    void event;
    void callback;
  }
}
