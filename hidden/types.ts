export interface Transaction {
  id: string;
  date: string;
  amount: number;
  payee?: string | null;
  payee_name?: string | null;
  imported_id?: string | null;
  notes?: string | null;
  account?: string | null;
  category?: string | null;
  cleared?: boolean;
  subtransactions?: Transaction[];
  is_parent?: boolean;  
  is_child?: boolean;
  parent_id?: string | null;
}

export type BridgeContext = 
  | { type: 'SINGLE_ACCOUNT'; accountId: string }
  | { type: 'ALL_ACCOUNTS'; accountId: null }
  | { type: 'UNKNOWN'; accountId: null };

export interface BridgeState {
  connected: boolean;
  context: BridgeContext;
  transactions: Transaction[] | null;
}

export interface ProtocolMap {
  'HANDSHAKE': {
    req: undefined;
    res: { status: 'connected'; origin: string };
  };
  'GET_STATE': {
    req: undefined;
    res: BridgeState;
  };
  'GET_TRANSACTIONS': {
    req: undefined;
    res: Transaction[];
  };
  'SAVE_TRANSACTION': {
    req: Transaction;
    res: { success: boolean };
  };
  'IMPORT_TRANSACTION': {
    req: Partial<Transaction> & { imported_id: string }; 
    res: { success?: boolean; status?: 'skipped_duplicate' };
  };
}

export type BridgeCommand = keyof ProtocolMap;

export interface BridgeMessage<C extends BridgeCommand = BridgeCommand> {
  type: 'ACTUAL_BRIDGE_CMD';
  messageId: string;
  command: C;
  payload: ProtocolMap[C]['req'];
}

export interface BridgeResponse<C extends BridgeCommand = BridgeCommand> {
  type: 'ACTUAL_BRIDGE_DATA';
  messageId: string;
  payload?: ProtocolMap[C]['res'];
  error?: string;
}

// Helper to create a Discriminated Union of all possible messages
// This allows TypeScript to narrow 'payload' based on 'command'
export type AnyBridgeMessage = {
  [K in BridgeCommand]: BridgeMessage<K>;
}[BridgeCommand];

export type AnyBridgeResponse = {
  [K in BridgeCommand]: BridgeResponse<K>;
}[BridgeCommand];

export interface BridgeBroadcast {
  type: 'ACTUAL_BRIDGE_DATA';
  messageId: 'BROADCAST_STATE_UPDATE';
  payload: BridgeState;
}
