import { vi } from "vitest";

// 1. Mock WebExtension Polyfill
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).browser = {
  runtime: {
    getURL: (path: string) => `chrome-extension://mock-id/${path}`,
  },
};

// 2. Mock Crypto for JSDOM
if (!global.crypto.randomUUID) {
  // @ts-expect-error - Simple mock
  global.crypto.randomUUID = () =>
    "test-uuid-" + Math.random().toString(36).substr(2, 9);
}

// 3. Mock the "?inline-js" import.
// This prevents src/index.ts from failing when it tries to import the non-existent virtual module.
vi.mock("../src/injected.ts?inline-js", () => {
  return {
    default: 'console.log("Mock Injected Code");',
  };
});

// 4. Security Bypass
// We set this GLOBAL variable so that when we import '../src/injected.ts' directly in tests,
// it passes the top-level security check.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).__ACTUAL_BRIDGE_TEST_ORIGIN__ = "https://app.actualbudget.org";
