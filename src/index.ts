/**
 * Public API Entry Point for @righteffort/actual-ext-lib
 */

// Core Logic (Content Script)
export { LocalBridge } from "./core/local-bridge";
export { BridgeConnector } from "./core/bridge-connector";

// Core Logic (Background/UI)
export { RemoteBridge } from "./core/remote-bridge";
export { BridgeArbiter } from "./background/arbiter";

// Types & Errors
export * from "./types";
export * from "./errors";

// Constants (Useful for message passing if needed manually)
export {
  GuestMessageType,
  HostMessageType,
  SOURCE_GUEST,
  SOURCE_HOST,
} from "./shared/constants";
