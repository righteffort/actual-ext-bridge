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
  Account,
} from "../types";

interface FiberNode {
  memoizedProps: Record<string, unknown>;
  return?: FiberNode;
  stateNode?: unknown;
}

interface ActualProps {
  transactions?: Transaction[];
  payees?: { id: string; name: string }[];
  accounts?: Account[];
  onSave?: (tx: unknown) => Promise<void>;
  onAdd?: (txs: unknown[]) => Promise<void>;
  onCreatePayee?: (name: string) => Promise<string>;
}

const ALLOWED_ORIGIN = TARGET_ORIGIN_VAR;
let isConnected = false;

function findActualProps(): ActualProps | null {
  const anchor = document.querySelector(
    ".recs-table-row, .recs-table-container",
  );
  if (!anchor) return null;

  const key = Object.keys(anchor).find((k) => k.startsWith("__reactFiber"));
  if (!key) return null;

  // @ts-expect-error - Dynamic property access on DOM element is necessary for Fiber discovery
  let fiber: FiberNode | undefined = anchor[key];
  if (!fiber) return null;

  let attempts = 0;
  while (fiber && attempts < 50) {
    const props = fiber.memoizedProps as unknown as ActualProps;
    if (props && Array.isArray(props.transactions) && typeof props.onSave === "function" && Array.isArray(props.accounts) && typeof props.onAdd === "function") {
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

function determineContext(): BridgeContext {
  const match = window.location.pathname.match(/\/account\/([a-zA-Z0-9-]+)/);
  if (match && match[1]) {
    return { type: "SINGLE_ACCOUNT", accountId: match[1] };
  }
  if (window.location.pathname.includes("/accounts")) {
    return { type: "ALL_ACCOUNTS", accountId: null };
  }
  return { type: "UNKNOWN", accountId: null };
}

async function resolvePayee(
  props: ActualProps,
  name: string,
): Promise<string | undefined> {
  if (!props.payees || !Array.isArray(props.payees)) {
    console.warn("ActualBridge: No payees found in props.");
    return undefined;
  }
  // TODO we should maintain a cache!
  const existing = props.payees.find(
    (p) => p.name.toLowerCase() === name.toLowerCase(),
  );
  if (existing) return existing.id;
  if (typeof props.onCreatePayee === "function") {
    try {
      return await props.onCreatePayee(name);
    } catch (error) {
      console.error("Failed to create payee", error);
    }
  }
  return undefined;
}

function isDuplicate(props: ActualProps, importedId: string): boolean {
  if (!props.transactions || !importedId) return false;
  return props.transactions.some(
    (t: Transaction) => t.imported_id === importedId,
  );
}

function sendMessage(type: GuestMessageType, payload: unknown, id?: string) {
  const msg: BridgeMessage = {
    source: SOURCE_GUEST,
    type,
    payload,
  };
  if (id !== undefined) msg.id = id;
  window.postMessage(msg, ALLOWED_ORIGIN);
}

async function handleMessage(event: MessageEvent) {
  if (event.origin !== ALLOWED_ORIGIN && event.origin !== window.origin) return;
  const data = event.data as BridgeMessage;
  if (!data || data.source !== SOURCE_HOST) return;

  const props = findActualProps();

  switch (data.type) {
    case HostMessageType.HANDSHAKE_INIT:
      sendMessage(GuestMessageType.HANDSHAKE_ACK, { success: true }, data.id);
      poll();
      break;

    case HostMessageType.GET_TRANSACTIONS:
      // TODO: it woud be nice to support filtering
      if (props) {
        sendMessage(
          GuestMessageType.COMMAND_RESPONSE,
          { success: true, data: props.transactions || [] },
          data.id,
        );
      } else {
        sendMessage(
          GuestMessageType.COMMAND_RESPONSE,
          { success: false, error: "Not connected" },
          data.id,
        );
      }
      break;

    case HostMessageType.GET_ACCOUNTS:
      if (props) {
        sendMessage(
          GuestMessageType.COMMAND_RESPONSE,
          { success: true, data: props.accounts || [] },
          data.id,
        );
      } else {
        sendMessage(
          GuestMessageType.COMMAND_RESPONSE,
          { success: false, error: "Not connected" },
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
            { success: false, error: message },
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
        if (payload.imported_id && isDuplicate(props, payload.imported_id)) {
          sendMessage(
            GuestMessageType.COMMAND_RESPONSE,
            {
              success: false,
              error: "Duplicate",
              code: "DUPLICATE",
              importedId: payload.imported_id,
            },
            data.id,
          );
          return;
        }

        let payeeId = payload.payee;
        if (!payeeId && payload.payee_name) {
          payeeId = await resolvePayee(props, payload.payee_name);
        }

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
        if (payload.category) newTx["category"] = payload.category;

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
            { success: false, error: message },
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

function poll() {
  const props = findActualProps();
  const currentlyConnected = !!props;

  const currentState: BridgeState = {
    connected: currentlyConnected,
    context: determineContext(),
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
  poll();
  console.log("ActualBridge: Guest Logic Injected.");
}

init();
