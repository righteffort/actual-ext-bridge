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

// RPC implementation for the guest side
const guestRpc: GuestRpcInterface = {
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

  async updateTransaction(transaction: Transaction) {
    const props = findActualProps();
    if (!props || !props.onSave) {
      throw new Error("AXB: onSave not available");
    }
    await props.onSave(transaction);
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

    await props.onAdd([newTx]);
  },
};

// Create birpc instance
console.log("AXB: guest creating birpc...");
const rpc = createBirpc<HostRpcInterface, GuestRpcInterface>(guestRpc, {
  post: (data) => {
    console.log(`AXB: guest window.postMessage(${JSON.stringify(data)})`);
    window.postMessage(data, "/");
  },
  on: (fn) => {
    const handler = (event: MessageEvent) => {
      console.log(
        `AXB: guest received message event=${JSON.stringify(event)} event.data=${JSON.stringify(event.data)}`,
      );
      if (event.origin === window.origin) {
        fn(event.data);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  },
});
console.log("AXB: ... guest created birpc");

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
    } catch (error) {
      console.error("AXB: Failed to create payee", error);
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

  // Send state update via RPC
  // console.log(`AXB: guest sending state ${JSON.stringify(currentState)}`);
  rpc.onStateUpdate(currentState).catch((error) => {
    console.warn("AXB: Failed to send state update:", error);
  });
  // console.log(`AXB: guest sent state ${JSON.stringify(currentState)}`);
}

function init() {
  // Signal to host that we're ready
  rpc
    .handshake()
    .then(() => {
      console.log("AXB: handshake complete, starting polling");
      poll(); // Start polling after handshake
      // TODO: instead, push whenever state changes, which will only be on navigation AFAIK
      window.setInterval(poll, 2000);
    })
    .catch((error) => {
      console.error("AXB: handshake failed:", error);
    });

  console.log("AXB: ActualBridge: guest-logic:init complete.");
}

init();
