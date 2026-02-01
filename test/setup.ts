import { vi } from "vitest";

// Mock the chrome/browser namespace globally
const browserMock = {
  runtime: {
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  tabs: {
    query: vi.fn().mockResolvedValue([]),
    sendMessage: vi.fn(),
    onRemoved: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
};

// Assign to global for JSDOM environment
// @ts-ignore
global.browser = browserMock;
// @ts-ignore
global.chrome = browserMock;

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
});
