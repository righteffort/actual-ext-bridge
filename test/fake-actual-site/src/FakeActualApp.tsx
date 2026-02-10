import React, { useState, useEffect } from 'react';

// Type definitions to match Actual's expected shape loosely
interface Transaction {
  id: string;
  date: string;
  amount: number;
  payee?: string;
  notes?: string;
  account?: string;
  imported_id?: string;
}

interface Account {
  id: string;
  name: string;
}

export default function FakeActualApp() {
  // 1. Setup minimal state to simulate the DB
  const [accounts, setAccounts] = useState<Account[]>([
    { id: 'primary-account-id', name: 'Primary Checking' }
  ]);
  
  const [transactions, setTransactions] = useState<Transaction[]>([
    { id: 'tx-1', date: '2024-01-01', amount: -1000, payee: 'Existing Payee', notes: 'extension test update me', account: 'primary-account-id' },
    { id: 'tx-2', date: '2024-01-01', amount: -2005, payee: 'Existing Payee', notes: 'extension test split me Note', account: 'primary-account-id' }
  ]);

  // 2. EXPOSE STATE TO TESTS
  // This allows you to run `window.__MOCK_DB__.transactions` in your E2E test
  // to verify the "Server" state.
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__MOCK_DB__ = {
      transactions,
      accounts,
      // Optional: Add helpers to modify state from tests if needed
      setTransactions, 
      setAccounts
    };
  }, [transactions, accounts]);

  // 3. Mock the Internal Handlers
  const onSave = async (tx: Transaction) => {
    console.log('FakeApp: onSave called', tx);
    setTransactions(prev => 
      prev.map(t => t.id === tx.id ? { ...t, ...tx } : t)
    );
  };

  const onAdd = async (newTxs: Transaction[]) => {
    console.log('FakeApp: onAdd called', newTxs);
    // Actual accepts an array of transactions
    const items = Array.isArray(newTxs) ? newTxs : [newTxs];
    setTransactions(prev => [...prev, ...items]);
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>Fake Actual Budget</h1>
      
      {/* 4. The Trap 
        The scraper climbs UP from 'transaction-table'. 
        We wrap the table in a component that holds the 'Target Props'.
      */}
      <TransactionView 
        transactions={transactions}
        accounts={accounts}
        onSave={onSave}
        onAdd={onAdd}
      />
    </div>
  );
}

// This component exists solely to attach the props to a Fiber node
// that is an ancestor of the anchor element.
const TransactionView = (props: { 
  transactions: Transaction[]; 
  accounts: Account[]; 
  onSave: (tx: Transaction) => void; 
  onAdd: (txs: Transaction[]) => void; 
}) => {
  return (
    <div className="view-container">
      <h2>Transactions</h2>
      
      {/* The Anchor your script looks for */}
      <div data-testid="transaction-table" style={{ border: '1px solid #ccc', padding: 10 }}>
        {props.transactions.length === 0 ? <p>No transactions</p> : (
          <ul className="transaction-list">
            {props.transactions.map(tx => (
              <li key={tx.id} data-testid={`row-${tx.id}`}>
                {tx.date} | {tx.amount} | {tx.payee} | <strong>{tx.notes}</strong>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
