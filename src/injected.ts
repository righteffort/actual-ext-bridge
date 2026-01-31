import type { BridgeMessage, BridgeResponse, ProtocolMap, BridgeCommand, BridgeState, BridgeContext, AnyBridgeMessage, Transaction } from './types';

// --- CONFIGURATION ---
// In tests, this global variable is set to bypass the replacement check.
const TARGET_ORIGIN = (window as unknown as { __ACTUAL_BRIDGE_TEST_ORIGIN__?: string }).__ACTUAL_BRIDGE_TEST_ORIGIN__ || '__ACTUAL_ORIGIN__';

if (TARGET_ORIGIN === '__ACTUAL_' + 'ORIGIN__') {
  const err = "Actual Bridge Security Error: Target origin not configured. You must pass { baseUrl } to bridge.connect().";
  console.error(err);
  throw new Error(err);
}

// --- INTERNAL TYPES ---
interface ActualPayee {
  id: string;
  name: string;
}

interface ActualProps {
  transactions?: Transaction[];
  payees?: ActualPayee[];
  onSave?: (...args: unknown[]) => Promise<void>;
  onAdd?: (...args: unknown[]) => Promise<void>;
  onCreatePayee?: (name: string) => Promise<string>;
  actions?: {
    createPayee?: (name: string) => Promise<string>;
  };
}

// --- STATE & CACHE ---
const payeeCache = new Map<string, string>();
const pendingPayeeResolutions = new Map<string, Promise<string | null>>();
let lastPayeesRef: unknown = null;

const importedIdSet = new Set<string>();
const pendingImports = new Set<string>();
let lastTransactionsRef: unknown = null;

let lastStateSignature = "";

// --- UTILS & CONTEXT ---

function reply<C extends BridgeCommand>(
  originalMsg: BridgeMessage<C>, 
  payload?: ProtocolMap[C]['res'], 
  error?: string
) {
  const response: BridgeResponse<C> = {
    type: 'ACTUAL_BRIDGE_DATA',
    messageId: originalMsg.messageId
  };
  
  if (error !== undefined) {
    response.error = error;
  }
  
  if (payload !== undefined) {
    response.payload = payload;
  }

  window.postMessage(response, TARGET_ORIGIN);
}

function broadcastState(state: BridgeState) {
  const response = {
    type: 'ACTUAL_BRIDGE_DATA',
    messageId: 'BROADCAST_STATE_UPDATE',
    payload: state
  };
  window.postMessage(response, TARGET_ORIGIN);
}

function getAccountContext(): BridgeContext {
  const path = window.location.pathname.replace(/\/$/, '');
  const uuidRegex = /\/accounts\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
  const match = path.match(uuidRegex);

  if (match && match[1]) {
    return { type: 'SINGLE_ACCOUNT', accountId: match[1] };
  }
  
  if (path.endsWith('/accounts')) {
    return { type: 'ALL_ACCOUNTS', accountId: null };
  }

  return { type: 'UNKNOWN', accountId: null };
}

// --- RECONNAISSANCE ---

function findActual() {
  const anchor = document.querySelector('div[data-testid="row"], .recs-table-row') 
              || document.querySelector('div[role="columnheader"], .recs-table-header-cell');

  if (!anchor) return null;

  const key = Object.keys(anchor).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternal'));
  // @ts-expect-error - Internal React key access
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fiber = (anchor as any)[key];
  let steps = 0;
  
  while (fiber && steps < 50) {
    const p = fiber.memoizedProps as ActualProps;
    if (p) {
      const hasData = Array.isArray(p.transactions) && Array.isArray(p.payees);
      const hasHandlers = typeof p.onSave === 'function' && typeof p.onAdd === 'function';

      if (hasData && hasHandlers) {
        return p; 
      }
    }
    fiber = fiber.return;
    steps++;
  }
  return null;
}

// --- DATA MANAGEMENT ---

function ensurePayeeCache(props: ActualProps) {
  if (props.payees && props.payees !== lastPayeesRef) {
    payeeCache.clear();
    props.payees.forEach((p) => {
      if (p.name) payeeCache.set(p.name.toLowerCase().trim(), p.id);
    });
    lastPayeesRef = props.payees;
  }
}

function ensureDedupCache(props: ActualProps) {
  if (props.transactions && props.transactions !== lastTransactionsRef) {
    importedIdSet.clear();
    props.transactions.forEach((t) => {
      if (t.imported_id) importedIdSet.add(t.imported_id);
    });
    lastTransactionsRef = props.transactions;
  }
}

async function resolvePayee(name: string, props: ActualProps) {
  ensurePayeeCache(props);
  const key = name.toLowerCase().trim();
  
  if (payeeCache.has(key)) return payeeCache.get(key);
  
  if (pendingPayeeResolutions.has(key)) return pendingPayeeResolutions.get(key);

  const creator = props.onCreatePayee || (props.actions && props.actions.createPayee);
  
  if (typeof creator === 'function') {
    console.log(`Bridge: Creating new payee '${name}'...`);
    
    const creationPromise = (async () => {
      try {
        const newId = await creator(name);
        if (newId) {
          payeeCache.set(key, newId);
          return newId;
        }
      } catch (e) {
        console.error("Bridge: Failed to create payee", e);
      }
      return null;
    })();

    pendingPayeeResolutions.set(key, creationPromise);
    try { return await creationPromise; } 
    finally { pendingPayeeResolutions.delete(key); }
  }
  
  return null;
}

// --- STATE MONITORING ---

function checkState() {
  const props = findActual();
  const context = getAccountContext();
  
  const connected = !!props;
  const txs = props ? props.transactions || null : null;

  const currentSignature = [
    connected,
    context.type,
    context.accountId,
    txs ? txs.length : 0,
    txs && txs[0] ? txs[0].id : 'empty'
  ].join('|');
  
  if (currentSignature !== lastStateSignature) {
    lastStateSignature = currentSignature;
    
    const state: BridgeState = {
      connected,
      context,
      transactions: txs
    };
    broadcastState(state);
  }
}

setInterval(checkState, 2000);

const _pushState = history.pushState;
history.pushState = function(...args) { _pushState.apply(history, args); checkState(); };
const _replaceState = history.replaceState;
history.replaceState = function(...args) { _replaceState.apply(history, args); checkState(); };
window.addEventListener('popstate', () => checkState());

// --- MESSAGE LISTENER ---

window.addEventListener('message', async (event) => {
  // In test environment, allow messages from the same origin
  const isTestEnvironment = (window as any).__ACTUAL_BRIDGE_TEST_ORIGIN__;
  if (!isTestEnvironment && event.origin !== TARGET_ORIGIN) return;
  
  const msg = event.data as AnyBridgeMessage;
  
  if (msg.type !== 'ACTUAL_BRIDGE_CMD') return;

  if (msg.command === 'HANDSHAKE') {
    reply(msg, { status: 'connected', origin: TARGET_ORIGIN });
    checkState();
    return;
  }

  const props = findActual();

  // If asking for state, return immediately
  if (msg.command === 'GET_STATE') {
    const state: BridgeState = {
      connected: !!props,
      context: getAccountContext(),
      transactions: props ? props.transactions || null : null
    };
    reply(msg, state);
    return;
  }

  if (!props) {
    reply(msg, undefined, "Actual Bridge: Not connected to UI. Are you on the Account screen?");
    return;
  }

  try {
    if (msg.command === 'GET_TRANSACTIONS') {
      reply(msg, props.transactions);
    } 
    else if (msg.command === 'SAVE_TRANSACTION') {
      const payload = msg.payload;
      if (props.onSave) {
        if (payload.subtransactions && Array.isArray(payload.subtransactions)) {
          await props.onSave(payload, payload.subtransactions, null);
        } else {
          await props.onSave(payload, null, 'notes'); 
        }
        reply(msg, { success: true });
      }
    }
    else if (msg.command === 'IMPORT_TRANSACTION') {
      const payload = msg.payload;
      if (typeof props.onAdd !== 'function') throw new Error("onAdd not found");
      
      if (!payload.account) {
        const context = getAccountContext();
        if (context.type === 'SINGLE_ACCOUNT' && context.accountId) {
          payload.account = context.accountId;
        } else {
          throw new Error("Cannot infer Account ID (Ambiguous View). Payload must include 'account'.");
        }
      }

      ensureDedupCache(props); 
      
      if (payload.imported_id && (importedIdSet.has(payload.imported_id) || pendingImports.has(payload.imported_id))) {
         reply(msg, { status: 'skipped_duplicate' });
         return;
      }

      if (payload.imported_id) pendingImports.add(payload.imported_id);

      try {
        const payeeId = await resolvePayee(payload.payee_name || 'Unknown', props);
        if (!payeeId) throw new Error(`Could not resolve payee ID for '${payload.payee_name}'`);

        // Explicitly construct object
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const newTx: any = { 
          ...payload, 
          payee: payeeId 
        };
        delete newTx.payee_name;

        await props.onAdd([newTx]);
        
        if (payload.imported_id) {
          importedIdSet.add(payload.imported_id);
          pendingImports.delete(payload.imported_id);
        }
        reply(msg, { success: true });
      } catch (e) {
        if (payload.imported_id) pendingImports.delete(payload.imported_id);
        throw e;
      }
    }
  } catch (e: unknown) {
    const errorMsg = e instanceof Error ? e.message : "Unknown Bridge Error";
    reply(msg, undefined, errorMsg);
  }
});
