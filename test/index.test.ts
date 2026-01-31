import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ActualBridge } from '../src/index';
import type { BridgeState } from '../src/types';

describe('ActualBridge (Library Layer)', () => {
  let bridge: ActualBridge;

  beforeEach(() => {
    bridge = new ActualBridge();
    document.head.innerHTML = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('injects a script tag on connect', async () => {
    const appendSpy = vi.spyOn(document.head, 'appendChild');
    
    // We expect the handshake to timeout because the mocked script doesn't reply
    await expect(bridge.connect()).rejects.toThrow('Bridge timeout for command: HANDSHAKE');
    
    expect(appendSpy).toHaveBeenCalled();
    
    // Safe array access for TypeScript strictness (noUncheckedIndexedAccess)
    const callArgs = appendSpy.mock.calls[0];
    const script = callArgs?.[0] as HTMLScriptElement | undefined;
    
    expect(script).toBeDefined();
    expect(script?.tagName).toBe('SCRIPT');
    
    // Confirm we injected the MOCK string from test/setup.ts
    expect(script?.textContent).toContain('Mock Injected Code');
  }, 10000);

  it('handles incoming state updates', () => {
    const callback = vi.fn();
    bridge.subscribe(callback);

    const mockState: BridgeState = {
      connected: true,
      context: { type: 'SINGLE_ACCOUNT', accountId: 'acc-123' },
      transactions: []
    };

    window.dispatchEvent(new MessageEvent('message', {
      data: {
        type: 'ACTUAL_BRIDGE_DATA',
        messageId: 'BROADCAST_STATE_UPDATE',
        payload: mockState
      }
    }));

    expect(callback).toHaveBeenCalledWith(mockState);
  });
});
