/**
 * Shared storage helpers for the extension.
 */

const KEY_BASE_URL = "actualBaseUrl";

export async function getBaseUrl(): Promise<string | null> {
  const result = await chrome.storage.sync.get(KEY_BASE_URL);
  // Ensure we return string or null, handling undefined from storage get
  const val = result[KEY_BASE_URL];
  if (typeof val === "string") {
    return val;
  }
  return null;
}

export async function setBaseUrl(url: string): Promise<void> {
  await chrome.storage.sync.set({ [KEY_BASE_URL]: url });
}

/**
 * Listens for changes to the base URL.
 */
export function onBaseUrlChange(
  callback: (newUrl: string | null) => void,
): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName === "sync" && changes[KEY_BASE_URL]) {
      const newVal = changes[KEY_BASE_URL].newValue;
      callback(typeof newVal === "string" ? newVal : null);
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
