import {
  SOURCE_GUEST,
  SOURCE_HOST,
  GuestMessageType,
  HostMessageType,
  type BridgeMessage,
} from "../shared/constants";
import type {
  Transaction,
  ImportTransaction,
  AccountsEnum,
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

/**
 * Returns React props to use to interact with the Actual Web App.
 */
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
    if (
      props &&
      Array.isArray(props.transactions) &&
      typeof props.onSave === "function" &&
      Array.isArray(props.accounts) &&
      typeof props.onAdd === "function"
    ) {
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
  window.postMessage(msg, "/");
}

async function handleMessage(event: MessageEvent) {
  if (event.origin !== window.origin) {
    return;
  }

  const data = event.data as BridgeMessage;
  if (!data || data.source !== SOURCE_HOST) {
    return;
  }

  const props = findActualProps();

  switch (data.type) {
    case HostMessageType.HANDSHAKE_INIT:
      sendMessage(GuestMessageType.HANDSHAKE_ACK, { success: true }, data.id);
      poll();
      break;

    case HostMessageType.GET_TRANSACTIONS:
      handleGetTransactions(props, data.id);
      break;

    case HostMessageType.GET_ACCOUNTS:
      handleGetAccounts(props, data.id);
      break;

    case HostMessageType.SAVE_TRANSACTION:
      await handleSaveTransaction(props, data.payload, data.id);
      break;

    case HostMessageType.CREATE_TRANSACTION:
      await handleCreateTransaction(props, data.payload, data.id);
      break;
  }
}

function handleGetTransactions(props: ActualProps | null, id?: string) {
  // TODO: it woud be nice to support filtering
  if (props) {
    sendMessage(
      GuestMessageType.COMMAND_RESPONSE,
      { success: true, data: props.transactions || [] },
      id,
    );
  } else {
    sendMessage(
      GuestMessageType.COMMAND_RESPONSE,
      { success: false, error: "Not connected" },
      id,
    );
  }
}

function handleGetAccounts(props: ActualProps | null, id?: string) {
  if (props) {
    sendMessage(
      GuestMessageType.COMMAND_RESPONSE,
      { success: true, data: props.accounts || [] },
      id,
    );
  } else {
    sendMessage(
      GuestMessageType.COMMAND_RESPONSE,
      { success: false, error: "Not connected" },
      id,
    );
  }
}

async function handleSaveTransaction(props: ActualProps | null, payload: unknown, id?: string) {
  if (props && props.onSave) {
    try {
      await props.onSave(payload);
      sendMessage(
        GuestMessageType.COMMAND_RESPONSE,
        { success: true },
        id,
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);
      sendMessage(
        GuestMessageType.COMMAND_RESPONSE,
        { success: false, error: message },
        id,
      );
    }
  } else {
    sendMessage(
      GuestMessageType.COMMAND_RESPONSE,
      { success: false, error: "onSave not available" },
      id,
    );
  }
}

async function handleCreateTransaction(props: ActualProps | null, payload: unknown, id?: string) {
  if (props && props.onAdd) {
    const txPayload = payload as ImportTransaction;
    if (txPayload.imported_id && isDuplicate(props, txPayload.imported_id)) {
      sendMessage(
        GuestMessageType.COMMAND_RESPONSE,
        {
          success: false,
          error: "Duplicate",
          code: "DUPLICATE",
          importedId: txPayload.imported_id,
        },
        id,
      );
      return;
    }

    let payeeId = txPayload.payee;
    if (!payeeId && txPayload.payee_name) {
      payeeId = await resolvePayee(props, txPayload.payee_name);
    }

    const newTx: Record<string, unknown> = {
      account: txPayload.account,
      date: txPayload.date,
      amount: txPayload.amount,
      notes: txPayload.notes || "",
      payee: payeeId || null,
      imported_id: txPayload.imported_id,
      imported_payee: txPayload.imported_payee,
      cleared: txPayload.cleared !== undefined ? txPayload.cleared : false,
      subtransactions: txPayload.subtransactions,
    };
    if (txPayload.category) newTx["category"] = txPayload.category;

    try {
      await props.onAdd([newTx]);
      sendMessage(
        GuestMessageType.COMMAND_RESPONSE,
        { success: true },
        id,
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);
      sendMessage(
        GuestMessageType.COMMAND_RESPONSE,
        { success: false, error: message },
        id,
      );
    }
  } else {
    sendMessage(
      GuestMessageType.COMMAND_RESPONSE,
      { success: false, error: "onAdd not available" },
      id,
    );
  }
}

function determineContext(): BridgeContext {
  const pathname = window.location.pathname.replace("/$", "");
  const accountId = window.location.pathname.match(
    "^/accounts/([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})$",
  )?.[1];
  if (accountId) {
    return { type: "SINGLE_ACCOUNT", accountId };
  }
  let type: AccountsEnum;
  switch (pathname) {
    case "/accounts":
      type = "ALL_ACCOUNTS";
      break;
    case "/accounts/offbudget":
      type = "OFF_BUDGET_ACCOUNTS";
      break;
    case "/accounts/onbudget":
      type = "ON_BUDGET_ACCOUNTS";
      break;
    default:
      type = "UNKNOWN";
  }

  return { type, accountId: null };
}

function poll() {
  const props = findActualProps();
  const currentlyConnected = !!props;

  const currentState: BridgeState = {
    connected: currentlyConnected,
    context: determineContext(),
  };

  // Always send state update on poll for testing purposes
  sendMessage(GuestMessageType.STATE_UPDATE, currentState);
}

function init() {
  window.addEventListener("message", handleMessage);
  // TODO: instead, push whenever state changes, which will be on navigation AFAIK
  window.setInterval(poll, 2000);
  poll();
  console.log("ActualBridge: Guest Logic Injected.");
}

init();
