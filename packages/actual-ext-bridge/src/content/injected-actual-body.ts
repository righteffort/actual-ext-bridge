/**
 * Exposes Actual Budget methods to content script through a birpc interface.
 *
 * Runs in the main world, i.e. in the context of the Actual Budget web app.
 */
import { createBirpc } from "birpc";
import {
  type InjectedActualRpc,
  type ContentScriptRpc,
  CONTENT_SCRIPT_RPC_TAG,
  INJECTED_RPC_TAG,
} from "../shared/rpc-interface";
import type {
  Transaction,
  ImportTransaction,
  AccountsEnum,
  BridgeState,
  BridgeContext,
  Account,
} from "../types";

interface FiberNode {
  props: Record<string, unknown>;
  memoizedProps: Record<string, unknown>;
  return?: FiberNode;
  stateNode?: unknown;
}

interface ActualProps {
  transactions?: Transaction[];
  payees?: { id: string; name: string }[];
  accounts?: Account[];
  onSave?: (
    tx: Transaction,
    subTxs?: Partial<Transaction>[],
    name?: string,
  ) => Promise<void>;
  onAdd?: (txs: Partial<Transaction>[]) => Promise<void>;
  onCreatePayee?: (name: string) => Promise<string>;
}

/**
 * Returns React props to use to interact with the Actual Web App.
 */
export function findActualProps(): ActualProps | null {
  console.log('AXB TEST findActualProps');
  const anchor = document.querySelector('div[data-testid="transaction-table"]');
  if (!anchor) {
    // With luck this just means we're not currently on a transactions page.
    return null;
  }

  const key = Object.keys(anchor).find((k) => k.startsWith("__reactFiber"));
  if (!key) {
    console.warn("AXB: (findActualProps) key not found");
    return null;
  }

  // @ts-expect-error - Dynamic property access on DOM element is necessary for Fiber discovery
  let fiber: FiberNode | undefined = anchor[key];
  if (!fiber) {
    console.warn("AXB: (findActualProps) fiber not found");
    return null;
  }

  let attempts = 0;
  while (fiber && attempts < 50) {
    if (!fiber.props) {
      console.log(`AXB test fiber.props=${fiber.props}`);
    } else {
      console.log(`AXB TEST fiber.props keys = ${JSON.stringify(Object.keys(fiber.props))}`);
    }
    const props = fiber.memoizedProps as unknown as ActualProps;
    if (!props) {
      console.log(`AXB test props=${props}`);
    } else {
      console.log(`AXB TEST props keys = ${JSON.stringify(Object.keys(props))}`);
    }
    if (
      props &&
      Array.isArray(props.transactions) &&
      typeof props.onSave === "function" &&
      Array.isArray(props.accounts) &&
      typeof props.onAdd === "function"
    ) {
      console.log('AXB TEST findActualProps succeeded');
      return props;
    }
    if (fiber.return) {
      fiber = fiber.return;
    } else {
      break;
    }
    attempts++;
  }
  console.warn("AXB: (findActualProps) props not found in transaction table");
  return null;
}

export function getTransactions(props: ActualProps | null): Transaction[] {
  if (!props) {
    throw new Error("AXB: Not connected");
  }
  return props.transactions || [];
}

export function getAccounts(props: ActualProps | null): Account[] {
  if (!props) {
    throw new Error("AXB: Not connected");
  }
  return props.accounts || [];
}

export async function updateTransaction(
  props: ActualProps | null,
  transaction: Transaction,
  subtransactions?: Partial<Transaction>[],
  field?: string,
): Promise<void> {
  if (!props || !props.onSave) {
    throw new Error("AXB: onSave not available");
  }
  await props.onSave(transaction, subtransactions, field);
}

export async function createTransaction(
  props: ActualProps | null,
  payload: ImportTransaction,
): Promise<void> {
  if (!props || !props.onAdd) {
    throw new Error("AXB: onAdd not available");
  }

  if (payload.imported_id && isDuplicate(props, payload.imported_id)) {
    const error = new Error("AXB: Duplicate transaction detected") as Error & {
      code: string;
      importedId: string;
    };
    error.code = "DUPLICATE";
    error.importedId = payload.imported_id;
    throw error;
  }
  const {
    account,
    date,
    amount,
    payee,
    notes,
    imported_id,
    imported_payee,
    cleared,
  } = payload;
  const finalPayee =
    payee ||
    (payload.payee_name
      ? await resolvePayee(props, payload.payee_name)
      : undefined);

  // TODO: Validate presence of more required fields
  if (typeof payload.amount === "undefined") {
    throw new Error("AXB: (createTransaction): amount missing");
  }
  const newTx: Partial<Transaction> = {
    account,
    date,
    ...(amount !== undefined && { amount }),
    ...(notes !== undefined && { notes }),
    ...(finalPayee !== undefined && { payee: finalPayee }),
    ...(imported_payee !== undefined && { imported_payee }),
    ...(cleared !== undefined && { cleared }),
  };
  if (finalPayee !== undefined) newTx.payee = finalPayee;
  if (imported_id !== undefined) newTx.imported_id = imported_id;
  if (payload.category) newTx.category = payload.category;

  await props.onAdd([newTx]);
}

const injectedActualRpc = {
  async getTransactions() {
    return getTransactions(findActualProps());
  },

  async getAccounts() {
    return getAccounts(findActualProps());
  },

  async updateTransaction(
    transaction: Transaction,
    subtransactions?: Transaction[],
    field?: string,
  ) {
    return updateTransaction(
      findActualProps(),
      transaction,
      subtransactions,
      field,
    );
  },

  async createTransaction(payload: ImportTransaction) {
    return createTransaction(findActualProps(), payload);
  },
} satisfies InjectedActualRpc; // TODO: I don't understand why we aren't exactly InjectedActualRpc

// Create birpc instance
const rpc = createBirpc<ContentScriptRpc, InjectedActualRpc>(
  injectedActualRpc,
  {
    post: (data) => {
      console.log(
        `injected sending ${JSON.stringify({ ...data, axbTarget: CONTENT_SCRIPT_RPC_TAG })}`,
      );
      window.postMessage({ ...data, axbTarget: CONTENT_SCRIPT_RPC_TAG });
    },
    on: (fn) => {
      const handler = (event: MessageEvent) => {
        console.log(
          `injected received event=${JSON.stringify(event)} event.data=${JSON.stringify(event.data)}`,
        );
        console.log(
          "event.origin",
          event.origin,
          "window.origin",
          window.origin,
        );
        if (event.origin === window.origin) {
          if (event?.data?.axbTarget === INJECTED_RPC_TAG) {
            fn(event.data);
          }
        }
      };
      window.addEventListener("message", handler);
      return () => window.removeEventListener("message", handler);
    },
  },
);

export async function resolvePayee(
  props: ActualProps,
  name: string,
): Promise<string | undefined> {
  if (!props.payees || !Array.isArray(props.payees)) {
    console.warn("AXB: ActualBridge: No payees found in props.");
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
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("AXB: Failed to create payee:", msg);
    }
  }
  return undefined;
}

export function isDuplicate(props: ActualProps, importedId: string): boolean {
  if (!props.transactions || !importedId) return false;
  // TODO we should maintain a set of importedIds!
  return props.transactions.some(
    (t: Transaction) => t.imported_id === importedId,
  );
}

export function determineContext(): BridgeContext {
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

async function poll() {
  console.log("AXB: poll() called");
  const props = findActualProps();
  const currentlyConnected = !!props;
  console.log(
    "AXB: poll() - props found:",
    !!props,
    "connected:",
    currentlyConnected,
  );

  const currentState: BridgeState = {
    connected: currentlyConnected,
    context: determineContext(),
  };
  console.log(
    "AXB: poll() - sending state update:",
    JSON.stringify(currentState),
  );

  await rpc.onStateUpdate(currentState).catch((e) => {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("AXB: Failed to send state update:", msg);
  });
  console.log("AXB TEST: called rpc.onStateUpdate");
}

export async function init() {
  console.log("AXB: calling handshake...");
  rpc
    .handshake()
    .then(async (result) => {
      console.log("AXB: handshake complete, result:", result);
      console.log("AXB: calling initial poll()");
      await poll();
      console.log("AXB: setting up interval with 2000ms");
      const intervalId = window.setInterval(async () => {
        console.log("AXB: interval triggered, calling poll()");
        await poll();
      }, 2000);
      console.log("AXB: interval set up with ID:", intervalId);
    })
    .catch((e) => {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("AXB: handshake failed:", msg);
    });

  console.log("AXB: ActualBridge: injected-actual:init complete.");
}
