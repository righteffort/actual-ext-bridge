import { vi, beforeEach } from "vitest";

// Don't require second argument to windo.postMessage
const originalPostMessage = window.postMessage;
// @ts-expect-error - TODO: i'm not sure
window.postMessage = function (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  message: any,
  targetOrigin?: string,
) {
  // @ts-expect-error - TODO: i'm not sure
  return originalPostMessage.call(this, message, targetOrigin || window.origin);
};

// Reset all mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
});
