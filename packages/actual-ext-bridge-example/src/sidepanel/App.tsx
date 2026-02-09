import { useEffect, useState } from "react";
import { getBaseUrl, setBaseUrl } from "../shared/storage";
import { BackgroundBridge } from "@righteffort/actual-ext-bridge";
import type { BridgeState, Transaction } from "@righteffort/actual-ext-bridge";

/**
 * Main Side Panel Application
 */
export default function App() {
  const [baseUrl, setBaseUrlState] = useState<string>("");
  const [storedUrl, setStoredUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("Initializing...");
  
  const [bridgeState, setBridgeState] = useState<BridgeState>({
    connected: false,
    context: { type: "UNKNOWN", accountId: null },
  });

  const [targetAccountName, setTargetAccountName] = useState("");
  const [resolvedAccountId, setResolvedAccountId] = useState<string | null>(null);

  const [bridge] = useState(() => new BackgroundBridge());

  useEffect(() => {
    // Load initial config
    getBaseUrl().then((url) => {
      setStoredUrl(url);
      if (url) setBaseUrlState(url);
      setStatus(url ? "Ready to Connect" : "Needs Configuration");
      console.log(`AXBE: getBaseUrl returned ${url}`);
    });
  }, []);

  // Subscribe to Bridge State
  // ... though why bother if we're not next to the primary tab, it only creates the appearance that non-primary is primary
  useEffect(() => {
    if (!storedUrl) return;
    
    // Connect bridge
    // console.log('AXBE: App.tsx connecting to RemoteBridge ...');
    // bridge.connect({ baseUrl: storedUrl }).catch(e => console.error('AXBE:',e));
    // console.log('AXBE: ...App.tsx connected to RemoteBridge');

    console.log(`AXBE: subscribing to state updates`);
    const unsubscribe = bridge.subscribe((state) => {
      console.debug(`AXBE: received new state ${JSON.stringify(state)}`);
      setBridgeState(state);
      if (state.connected) {
        setStatus("Connected to Actual");
      } else {
        setStatus("Disconnected (Open Actual tab)");
      }
    });

    return () => unsubscribe();
  }, [storedUrl, bridge]);

  // Resolve Account Name -> ID when name changes or connection is established
  // ... though why bother if we're not next to the primary tab
  useEffect(() => {
    if (!bridgeState.connected || !targetAccountName) {
      setResolvedAccountId(null);
      return;
    }
    const timer = setTimeout(async () => {
      const account = await bridge.getAccountByName(targetAccountName);
      setResolvedAccountId(account ? account.id : null);
    }, 500); // Debounce
    return () => clearTimeout(timer);
  }, [bridgeState.connected, targetAccountName, bridge]);

  const handleSaveConfig = async () => {
    try {
      const url = new URL(baseUrl).origin;
      // Request permissions dynamically
      const granted = await chrome.permissions.request({
        origins: [`${url}/*`],
        permissions: ["scripting"]
      });

      if (granted) {
        await setBaseUrl(url);
        setStoredUrl(url);
        setStatus("Configuration Saved. Please refresh Actual Budget tab.");
      } else {
        setStatus("Permission denied.");
      }
    } catch (e) {
      const msg = `Invalid URL format: ${e instanceof Error ? e.message : String(e)}`;
      console.warn(`AXBE: ${msg}`);
      setStatus(msg);
    }
  };

  const handleImportPoC = async () => {
    if (!resolvedAccountId) {
      setStatus("Error: Account not found.");
      return;
    }

    try {
      const today = new Date().toLocaleDateString("en-CA"); // Today in local time zone
      await bridge.createTransaction({
        account: resolvedAccountId,
        date: today,
        amount: -1000, // $10.00
        payee_name: "Extension Test Payee",
        notes: "extension test import example",
        imported_id: `ext-poc-${Date.now()}`,  // arbitrary, doesn't need to be UUID
        cleared: false
      });
      setStatus("Success: Imported Transaction");
    } catch (e) {
      const msg = `Error: ${e instanceof Error ? e.message : String(e)}`;
      console.warn(`AXBE: ${msg}`);
      setStatus(msg);
    }
  };

  const handleModify = async () => {
    try {
      // Use RPC with predicate
      const targets = await bridge.getTransactions(
        (t) => !!(t.notes && t.notes.includes("extension test update me"))
      );

      if (!targets || targets.length === 0) {
        setStatus("Info: No matching 'update me' transactions found.");
        return;
      }

      for (const tx of targets) {
	const newNotes = tx.notes?.replace("extension test update me", "extension test update complete");
	if (newNotes === undefined) {
	  throw Error(`Strange, failed to set new notes for ${tx.id} (was ${tx.notes})`);
	}
        const updatedTx: Transaction = {
          ...tx,
          notes: newNotes,
        };
        await bridge.updateTransaction(updatedTx);
      }
      setStatus(`Success: Updated ${targets.length} transactions.`);
    } catch (e) {
      const msg = `Error: ${e instanceof Error ? e.message : String(e)}`;
      console.warn(`AXBE: ${msg}`);
      setStatus(msg);
    }
  };

  const handleSplit = async () => {
    try {
      // Use RPC with predicate
      const targets = await bridge.getTransactions(
         (t) => !!(t.notes && t.notes.includes("extension test split me"))
      );

      if (!targets || targets.length === 0) {
        setStatus("Info: No matching 'extension test split me' transactions found.");
        return;
      }

      for (const tx of targets) {
        const splitAmount1 = Math.floor(tx.amount / 2);
        const splitAmount2 = tx.amount - splitAmount1;
	const newNotes = tx.notes?.replace("extension test split me", "extension test split complete");
	if (newNotes === undefined) {
	  throw Error(`Strange, failed to set new notes for ${tx.id} (was ${tx.notes})`);
	}
        const updatedTx: Transaction = {
          ...tx,
          notes: newNotes
	};
	const subtransactions = [
            {
              amount: splitAmount1,
              notes: "Split Part 1",
            },
            {
              amount: splitAmount2,
              notes: "Split Part 2",
            }
        ];

        await bridge.splitTransaction(updatedTx, subtransactions);
      }
      setStatus(`Success: Split ${targets.length} transactions.`);
    } catch (e) {
      const msg = `Error: ${e instanceof Error ? e.message : String(e)}`;
      console.warn(`AXBE: ${msg}`);
      setStatus(msg);
    }
  };

  return (
    <div style={{ padding: "16px", fontFamily: "sans-serif", minWidth: "300px" }}>
      <h2 style={{ fontSize: "1.2rem", margin: "0 0 16px 0" }}>Actual Transaction Details</h2>
      
      <div style={{ marginBottom: "16px", padding: "8px", background: "#f5f5f5", borderRadius: "4px", fontSize: "0.9rem" }}>
        <strong>Status:</strong> {status}
      </div>

      {!storedUrl || storedUrl !== baseUrl ? (
         <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
           <label style={{ fontSize: "0.9rem" }}>
             Actual Budget URL:
             <input 
               type="text" 
               value={baseUrl} 
               onChange={(e) => setBaseUrlState(e.target.value)}
               placeholder="https://app.actualbudget.org"
               style={{ width: "100%", padding: "6px", marginTop: "4px", boxSizing: "border-box" }}
             />
           </label>
           <button onClick={handleSaveConfig} style={{ padding: "8px", cursor: "pointer" }}>
             Save & Authorize
           </button>
         </div>
      ) : (
        <div>
           <p style={{ fontSize: "0.8rem", color: "#666", margin: "0 0 16px 0" }}>
             Connected to: <strong>{storedUrl}</strong>
           </p>
           
           <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label style={{ fontSize: "0.9rem", display: "block", marginBottom: "4px" }}>Target Account Name:</label>
                <input 
                  type="text" 
                  value={targetAccountName}
                  onChange={(e) => setTargetAccountName(e.target.value)}
                  placeholder="e.g. My Checking" 
                  style={{ width: "100%", padding: "6px", boxSizing: "border-box" }}
                />
                 {targetAccountName && !resolvedAccountId && bridgeState.connected && (
                    <small style={{ color: "red" }}>Account not found</small>
                 )}
              </div>

              <button 
                onClick={handleImportPoC}
                disabled={!bridgeState.connected || !resolvedAccountId}
                style={{ padding: "8px", cursor: "pointer" }}
              >
                Import PoC Transaction
              </button>

              <button 
                onClick={handleModify}
                disabled={!bridgeState.connected}
                style={{ padding: "8px", cursor: "pointer" }}
              >
                Modify 'extension test update me' notes
              </button>

              <button 
                onClick={handleSplit}
                disabled={!bridgeState.connected}
                style={{ padding: "8px", cursor: "pointer" }}
              >
                Split 'extension test split me' transactions
              </button>
           </div>
           
           {/* Debug info */}
           <details style={{ marginTop: "20px", fontSize: "0.7rem", color: "#999" }}>
             <summary>Bridge Debug</summary>
             <pre>{JSON.stringify(bridgeState, null, 2)}</pre>
           </details>
        </div>
      )}
    </div>
  );
}
