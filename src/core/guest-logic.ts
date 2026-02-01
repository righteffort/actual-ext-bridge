import {
  TARGET_ORIGIN_VAR,
  SOURCE_GUEST,
  SOURCE_HOST,
  GuestMessageType,
  HostMessageType,
  type BridgeMessage,
} from "../shared/constants";
import type {
  Transaction,
  ImportTransaction,
  BridgeState,
  BridgeContext,
} from "../types";

/**
 * Minimal definition of a React Fiber Node for our traversal needs.
 */
interface FiberNode {
  memoizedProps: Record<string, unknown>;
  return?: FiberNode;
  stateNode?: unknown;
}

/**
 * Interface describing the expected props on the Actual Budget internal component.
 */
interface ActualProps {
  transactions?: Transaction[];
  payees?: { id: string; name: string }[];
  onSave?: (tx: unknown) => Promise<void>;
  onAdd?: (txs: unknown[]) => Promise<void>;
  onCreatePayee?: (name: string) => Promise<string>;
}

// -----------------------------------------------------------------------------
// State & Configuration
// -----------------------------------------------------------------------------

// This string literal is replaced by LocalBridge during injection.
const ALLOWED_ORIGIN = TARGET_ORIGIN_VAR;

let isConnected = false;

// -----------------------------------------------------------------------------
// React Internals Discovery
// -----------------------------------------------------------------------------

/**
 * Attempts to find the React Fiber root or specific components (Transactions table)
 * by searching for DOM markers and traversing the Fiber tree.
 */
function findActualProps(): ActualProps | null {
  // 1. Prioritize the Transactions Table row as a stable anchor
  const anchor = document.querySelector(
    ".recs-table-row, .recs-table-container",
  );
  if (!anchor) return null;

  // 2. Find the internal React key on the DOM element
  const key = Object.keys(anchor).find((k) => k.startsWith("__reactFiber"));
  if (!key) return null;

  // 3. Get the Fiber Node
  // @ts-expect-error - Dynamic property access on DOM element is necessary for Fiber discovery
  let fiber: FiberNode | undefined = anchor[key];
  if (!fiber) return null;

  // 4. Traverse up to find the component holding the data we need.
  let attempts = 0;
  while (fiber && attempts < 50) {
    const props = fiber.memoizedProps as unknown as ActualProps;
    if (props && Array.isArray(props.transactions) && props.onSave) {
      // Found it!
      return props;
    }
    if (fiber.return) {
      fiber = fiber.return;
    } else {
      break;
    }
    attempts++;
  }

  return null;
}

/**
 * Determines the current context (Single Account vs All Accounts) based on the URL or props.
 */
function determineContext(): BridgeContext {
  // Actual's URL structure: /budget/[budget_id]/account/[account_id]
  const match = window.location.pathname.match(/\/account\/([a-zA-Z0-9-]+)/);
  if (match && match[1]) {
    return { type: "SINGLE_ACCOUNT", accountId: match[1] };
  }

  if (window.location.pathname.includes("/accounts")) {
    return { type: "ALL_ACCOUNTS", accountId: null };
  }

  return { type: "UNKNOWN", accountId: null };
}

// -----------------------------------------------------------------------------
// Actions
// -----------------------------------------------------------------------------

/**
 * Handles the logic for resolving a Payee Name to an ID.
 */
async function resolvePayee(
  props: ActualProps,
  name: string,
): Promise<string | undefined> {
  if (!props.payees || !Array.isArray(props.payees)) {
    console.warn("ActualBridge: No payees found in props.");
    return undefined;
  }

  const existing = props.payees.find(
    (p) => p.name.toLowerCase() === name.toLowerCase(),
  );

  if (existing) {
    return existing.id;
  }

  // Create new payee
  if (typeof props.onCreatePayee === "function") {
    try {
      const newId = await props.onCreatePayee(name);
      return newId;
    } catch (error: unknown) {
      console.error("ActualBridge: Failed to create payee", name, error);
      return undefined;
    }
  }

  return undefined;
}

/**
 * Checks if a transaction with the given imported_id already exists in the current view.
 */
function isDuplicate(props: ActualProps, importedId: string): boolean {
  if (!props.transactions || !importedId) return false;
  return props.transactions.some(
    (t: Transaction) => t.imported_id === importedId,
  );
}

// -----------------------------------------------------------------------------
// Message Handling
// -----------------------------------------------------------------------------

function sendMessage(type: GuestMessageType, payload: unknown, id?: string) {
  const msg: BridgeMessage = {
    source: SOURCE_GUEST,
    type,
    payload,
  };
  // exactOptionalPropertyTypes compliance: only assign if defined
  if (id !== undefined) {
    msg.id = id;
  }
  window.postMessage(msg, ALLOWED_ORIGIN);
}

async function handleMessage(event: MessageEvent) {
  // Security Check: Origin
  if (event.origin !== ALLOWED_ORIGIN && event.origin !== window.origin) {
    return;
  }

  const data = event.data as BridgeMessage;

  // Security Check: Source
  if (!data || data.source !== SOURCE_HOST) return;

  const props = findActualProps();

  switch (data.type) {
    case HostMessageType.HANDSHAKE_INIT:
      // If we received this, we are injected and running.
      sendMessage(GuestMessageType.HANDSHAKE_ACK, { success: true }, data.id);
      // Trigger an immediate state update
      poll();
      break;

    case HostMessageType.GET_TRANSACTIONS:
      if (props) {
        sendMessage(
          GuestMessageType.COMMAND_RESPONSE,
          { success: true, data: props.transactions },
          data.id,
        );
      } else {
        sendMessage(
          GuestMessageType.COMMAND_RESPONSE,
          { success: false, error: "Not connected to Transaction View" },
          data.id,
        );
      }
      break;

    case HostMessageType.SAVE_TRANSACTION:
      if (props && props.onSave) {
        try {
          await props.onSave(data.payload);
          sendMessage(
            GuestMessageType.COMMAND_RESPONSE,
            { success: true },
            data.id,
          );
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : String(error);
          sendMessage(
            GuestMessageType.COMMAND_RESPONSE,
            { success: false, error: message || "Save failed" },
            data.id,
          );
        }
      } else {
        sendMessage(
          GuestMessageType.COMMAND_RESPONSE,
          { success: false, error: "onSave not available" },
          data.id,
        );
      }
      break;

    case HostMessageType.CREATE_TRANSACTION:
      if (props && props.onAdd) {
        const payload = data.payload as ImportTransaction;

        // 1. Deduplicate
        if (payload.imported_id && isDuplicate(props, payload.imported_id)) {
          sendMessage(
            GuestMessageType.COMMAND_RESPONSE,
            {
              success: false,
              error: "Duplicate imported_id",
              code: "DUPLICATE",
              importedId: payload.imported_id,
            },
            data.id,
          );
          return;
        }

        // 2. Resolve Payee
        let payeeId = payload.payee;
        if (!payeeId && payload.payee_name) {
          payeeId = await resolvePayee(props, payload.payee_name);
        }

        // 3. Construct Final Transaction
        // We defined a safer record type rather than 'any'
        const newTx: Record<string, unknown> = {
          account: payload.account,
          date: payload.date,
          amount: payload.amount,
          notes: payload.notes || "",
          payee: payeeId || null,
          imported_id: payload.imported_id,
          imported_payee: payload.imported_payee,
          cleared: payload.cleared !== undefined ? payload.cleared : false,
          subtransactions: payload.subtransactions,
        };

        if (payload.category) {
          newTx["category"] = payload.category;
        }

        try {
          await props.onAdd([newTx]);
          sendMessage(
            GuestMessageType.COMMAND_RESPONSE,
            { success: true },
            data.id,
          );
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : String(error);
          sendMessage(
            GuestMessageType.COMMAND_RESPONSE,
            { success: false, error: message || "Create failed" },
            data.id,
          );
        }
      } else {
        sendMessage(
          GuestMessageType.COMMAND_RESPONSE,
          { success: false, error: "onAdd not available" },
          data.id,
        );
      }
      break;
  }
}

// -----------------------------------------------------------------------------
// Lifecycle
// -----------------------------------------------------------------------------

function poll() {
  const props = findActualProps();
  const currentlyConnected = !!props;

  const currentState: BridgeState = {
    connected: currentlyConnected,
    context: determineContext(),
    transactions: currentlyConnected ? props.transactions || null : null,
  };

  if (currentlyConnected !== isConnected) {
    isConnected = currentlyConnected;
    sendMessage(GuestMessageType.STATE_UPDATE, currentState);
  } else if (isConnected) {
    sendMessage(GuestMessageType.STATE_UPDATE, currentState);
  }
}

function init() {
  window.addEventListener("message", handleMessage);
  window.setInterval(poll, 2000);
  poll(); // Initial check
  console.log("ActualBridge: Guest Logic Injected.");
}

init();
