import { BridgeConnector } from "@righteffort/actual-ext-bridge";
import { getBaseUrl, onBaseUrlChange } from "../shared/storage";

/**
 * Content Script Connector
 * Manages the connection between the Extension and the Page (Main World).
 */

const connector = new BridgeConnector();

// Note that this never resolves, so the caller should not await.
async function init() {
  const baseUrl = await getBaseUrl();
  console.log(
    "AXBE: Connector: Initializing...",
    baseUrl ? `Target: ${baseUrl}` : "No URL configured",
  );

  // If we have a URL, start the router
  if (baseUrl) {
    if (window.location.origin === baseUrl) {
      console.log("ABXE: starting connector...");
      await connector.start();
      console.log("ABXE: ... started connector");
    }
  }
}

// // Listen for Master Grant events
// connector.on("primary-changed", async (isMaster) => {
//   console.log("AXBE: Connector: Master Status Changed:", isMaster);

//   if (isMaster) {
//     const baseUrl = await getBaseUrl();
//     if (baseUrl) {
//       console.log("AXBE: Connector: Bridge Connected");
//     }
//   }
// });

// Listen for configuration changes
onBaseUrlChange((newUrl) => {
  if (newUrl && window.location.origin === newUrl) {
    connector.start();
  } else {
    // Stop connector if URL no longer matches
    // (Stub: connector.stop() would be here if API supported it)
  }
});

init();
