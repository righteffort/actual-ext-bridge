import { createBirpc } from "birpc";
import type {
  GuestRpcInterface,
  HostRpcInterface,
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
    subTxs?: Transaction[],
    name?: string,
  ) => Promise<void>;
  onAdd?: (txs: Partial<Transaction>[]) => Promise<void>;
  onCreatePayee?: (name: string) => Promise<string>;
}

/**
 * Returns React props to use to interact with the Actual Web App.
 */
function findActualProps(): ActualProps | null {
  const anchor = document.querySelector('div[data-testid="transaction-table"]');
  if (!anchor) {
    // Ideally this just means we're not currently on a transactions page.
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
  console.warn("AXB: (findActualProps) props not found in transaction table");
  return null;
}

// RPC implementation for the guest side
const guestRpc = {
  async getTransactions() {
    const props = findActualProps();
    if (!props) {
      throw new Error("AXB: Not connected");
    }
    return props.transactions || [];
  },

  async getAccounts() {
    const props = findActualProps();
    if (!props) {
      throw new Error("AXB: Not connected");
    }
    return props.accounts || [];
  },

  async updateTransaction(
    transaction: Transaction,
    subtransactions?: Transaction[],
    field?: string,
  ) {
    const props = findActualProps();
    if (!props || !props.onSave) {
      throw new Error("AXB: onSave not available");
    }
    await props.onSave(transaction, subtransactions, field);
  },

  async createTransaction(payload: ImportTransaction) {
    const props = findActualProps();
    if (!props || !props.onAdd) {
      throw new Error("AXB: onAdd not available");
    }

    if (payload.imported_id && isDuplicate(props, payload.imported_id)) {
      const error = new Error(
        "AXB: Duplicate transaction detected",
      ) as Error & {
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
      ...(imported_id !== undefined && { imported_id }),
      ...(imported_payee !== undefined && { imported_payee }),
      ...(cleared !== undefined && { cleared }),
    };
    if (payload.category) newTx["category"] = payload.category;

    await props.onAdd([newTx]);
  },
} satisfies GuestRpcInterface; // TODO: I don't understand this

// Create birpc instance
const rpc = createBirpc<HostRpcInterface, GuestRpcInterface>(guestRpc, {
  post: (data) => {
    window.postMessage({ ...data, axbTarget: "HOST" });
  },
  on: (fn) => {
    const handler = (event: MessageEvent) => {
      if (event.origin === window.origin) {
        console.debug(
          `AXB: guest received message event=${JSON.stringify(event)} event.data=${JSON.stringify(event.data)}`, // TODO: remove
        );
        if (event?.data?.axbTarget === "GUEST") {
          fn(event.data);
        } else {
          console.debug(`AXB: guest dropped ${JSON.stringify(event.data)}`); // TODO: remove
        }
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  },
});

async function resolvePayee(
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

function isDuplicate(props: ActualProps, importedId: string): boolean {
  if (!props.transactions || !importedId) return false;
  // TODO we should maintain a set of importedIds!
  return props.transactions.some(
    (t: Transaction) => t.imported_id === importedId,
  );
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

  rpc.onStateUpdate(currentState).catch((e) => {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("AXB: Failed to send state update:", msg);
  });
}

function init() {
  rpc
    .handshake()
    .then(() => {
      console.log("AXB: handshake complete");
      poll();
      // TODO: instead, push whenever state changes, which will only be on navigation AFAIK
      window.setInterval(poll, 2000);
    })
    .catch((e) => {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("AXB: handshake failed:", msg);
    });

  console.log("AXB: ActualBridge: guest-logic:init complete.");
}

init();
