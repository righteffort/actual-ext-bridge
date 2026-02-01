import { vi } from "vitest";

// Simple mock that creates proper Vitest mock functions
export default {
  runtime: {
    sendMessage: vi.fn().mockResolvedValue({ success: true, data: null }),
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
