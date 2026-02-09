import { RpcRouter } from "@righteffort/actual-ext-bridge";

/**
 * Background Service Worker
 * Acts as the orchestrator for the Single Master policy.
 */

const router = new RpcRouter();
router.start();

// Listen for side panel opening (optional, good for UX)
chrome.runtime.onInstalled.addListener(() => {
  console.log(`AXBE: service-worker onInstalled`);
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

console.log("AXBE: Service Worker Initialized");
