import { useState, useEffect } from 'react';

interface Transaction {
  id: string;
  account: string;
  date: string;
  amount: number;
  notes?: string;
  payee?: string;
  imported_id?: string;
}

interface Account {
  id: string;
  name: string;
}

// Mock data that matches the test expectations
const initialTransactions: Transaction[] = [
  {
    id: 'tx-1',
    account: 'acc-1',
    date: '2024-01-01',
    amount: -1000,
    notes: 'extension test update me',
    payee: 'payee-1'
  },
  {
    id: 'tx-2', 
    account: 'acc-1',
    date: '2024-01-02',
    amount: -2000,
    notes: 'some other transaction',
    payee: 'payee-2'
  }
];

const mockAccounts: Account[] = [
  {
    id: 'acc-1',
    name: 'Test Checking'
  }
];

function TransactionTable() {
  console.log('AIDER DEBUG TransactionTable function called');
  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions);

  // This is the key function that the extension will call
  const onSave = async (transaction: Transaction, subtransactions?: Partial<Transaction>[], field?: string) => {
    console.log('onSave called with:', { transaction, subtransactions, field });
    
    // Store the call for test verification
    if (!window.onSaveCalls) {
      window.onSaveCalls = [];
    }
    window.onSaveCalls.push({ transaction, subtransactions, field });
    
    // Actually update the transaction
    setTransactions(prev => {
      const updated = prev.map(tx => 
        tx.id === transaction.id ? { ...tx, ...transaction } : tx
      );
      // Update global reference for test access
      window.mockTransactions = updated;
      return updated;
    });
  };
  
  const onAdd = async (newTransactions: Partial<Transaction>[]) => {
    console.log('onAdd called with:', newTransactions);
    // Implementation for adding transactions (not needed for current test)
  };

  // Create the props structure that findActualProps expects
  const tableProps = {
    transactions,
    accounts: mockAccounts,
    onSave,
    onAdd,
    payees: []
  };

  useEffect(() => {
    console.log('AIDER TEST supposed to attached transactions now');
    // Expose data globally for test access
    window.mockTransactions = transactions;
    window.mockAccounts = mockAccounts;
    window.onSaveCalls = window.onSaveCalls || [];

    // Attach props to the DOM element for findActualProps to discover
    const tableElement = document.querySelector('[data-testid="transaction-table"]');
    /*
    why don't we get all this stuff for free?
    if (tableElement) {
      // Create fake React Fiber structure
      const fiberKey = '__reactFiber$' + Math.random().toString(36).substr(2, 9);
      (tableElement as any)[fiberKey] = {
        memoizedProps: tableProps,
        return: {
          memoizedProps: tableProps
        }
      };
      console.log('AIDER TEST props attached');
    } else {
      console.log('AIDER TEST transaction table not found');
    }
     */
  }, [transactions]);

  return (
    <div data-testid="transaction-table" style={{ padding: '20px' }}>
      <h2>Fake Actual Budget</h2>
      <div>
        {transactions.map(tx => (
          <div 
            key={tx.id}
            style={{ 
              margin: '10px 0', 
              padding: '10px', 
              border: '1px solid #ccc',
              borderRadius: '4px'
            }}
          >
            <strong>{tx.date}</strong>: {tx.notes} (${(tx.amount / 100).toFixed(2)})
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  console.log('AIDER DEBUG App component called')
  return <TransactionTable />;
}

// Extend window interface for TypeScript
declare global {
  interface Window {
    mockTransactions?: Transaction[];
    mockAccounts?: Account[];
    onSaveCalls?: Array<{
      transaction: Transaction;
      subtransactions?: Partial<Transaction>[];
      field?: string;
    }>;
  }
}
