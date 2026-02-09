import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupExtensionTest, type ExtensionTestSetup } from './utils/puppeteer-setup';
import { startFakeActualServer, stopFakeServer, type FakeServerSetup } from './utils/test-helpers';

describe('Extension E2E Test', () => {
  let testSetup: ExtensionTestSetup;
  let serverSetup: FakeServerSetup;

  beforeAll(async () => {
    // Start fake Actual Budget website
    serverSetup = await startFakeActualServer();
    
    // Launch browser with extension
    testSetup = await setupExtensionTest();
  }, 30000); // 30 second timeout for setup

  afterAll(async () => {
    if (serverSetup?.server) {
      await stopFakeServer(serverSetup.server);
    }
    if (testSetup?.browser) {
      await testSetup.browser.close();
    }
  });

  it('should modify transaction notes via extension', async () => {
    const { browser, page, extensionId } = testSetup;
    const { url: serverUrl } = serverSetup;

    // Navigate to fake Actual Budget site
    await page.goto(serverUrl);
    
    // Wait for the fake site to load and render
    await page.waitForSelector('[data-testid="transaction-table"]', { timeout: 10000 });
    
    // Verify initial state - transaction should have "extension test update me"
    const initialNotes = await page.evaluate(() => {
      const tx = window.mockTransactions?.find(t => t.notes?.includes('extension test update me'));
      return tx?.notes;
    });
    expect(initialNotes).toBe('extension test update me');

    // Open extension side panel in new tab for testing purposes
    const sidePanelUrl = `chrome-extension://${extensionId}/src/sidepanel/index.html`;
    const sidePanelPage = await browser.newPage();
    await sidePanelPage.goto(sidePanelUrl);
    
    // Configure the extension with our fake server URL
    await sidePanelPage.waitForSelector('input[placeholder*="actualbudget"]', { timeout: 5000 });
    await sidePanelPage.type('input[placeholder*="actualbudget"]', serverUrl);
    // Click Save & Authorize button by finding it with text content
    await sidePanelPage.waitForFunction(
      () => Array.from(document.querySelectorAll('button')).find(btn => 
        btn.textContent?.includes('Save') && btn.textContent?.includes('Authorize')
      ),
      { timeout: 5000 }
    );
    await sidePanelPage.evaluate(() => {
      const button = Array.from(document.querySelectorAll('button')).find(btn => 
        btn.textContent?.includes('Save') && btn.textContent?.includes('Authorize')
      );
      if (button) button.click();
    });
    
    // Wait for connection status to show connected
    await sidePanelPage.waitForFunction(
      () => document.body.textContent?.includes('Connected to Actual'),
      { timeout: 10000 }
    );
    
    // Enter target account name
    await sidePanelPage.waitForSelector('input[placeholder*="My Checking"]');
    await sidePanelPage.type('input[placeholder*="My Checking"]', 'Test Checking');
    
    // Wait for account to be resolved
    await sidePanelPage.waitForFunction(
      () => !document.body.textContent?.includes('Account not found'),
      { timeout: 5000 }
    );
    
    // Click the modify notes button by finding it with text content
    await sidePanelPage.waitForFunction(
      () => Array.from(document.querySelectorAll('button')).find(btn => 
        btn.textContent?.includes('Modify') && btn.textContent?.includes('extension test update me')
      ),
      { timeout: 5000 }
    );
    
    const modifyButtonExists = await sidePanelPage.evaluate(() => {
      const button = Array.from(document.querySelectorAll('button')).find(btn => 
        btn.textContent?.includes('Modify') && btn.textContent?.includes('extension test update me')
      );
      if (button) {
        button.click();
        return true;
      }
      return false;
    });
    expect(modifyButtonExists).toBeTruthy();
    
    // Wait for success message
    await sidePanelPage.waitForFunction(
      () => document.body.textContent?.includes('Success: Updated 1 transactions'),
      { timeout: 10000 }
    );
    
    // Verify the transaction was actually updated in the fake site
    await page.bringToFront();
    const updatedNotes = await page.evaluate(() => {
      const tx = window.mockTransactions?.find(t => t.id === 'tx-1');
      return tx?.notes;
    });
    
    // The notes should have been changed from "extension test update me" to something else
    expect(updatedNotes).not.toBe('extension test update me');
    expect(updatedNotes).toContain('extension test update');
    
    // Verify only one transaction was modified
    const unchangedNotes = await page.evaluate(() => {
      const tx = window.mockTransactions?.find(t => t.id === 'tx-2');
      return tx?.notes;
    });
    expect(unchangedNotes).toBe('some other transaction');
    
    await sidePanelPage.close();
  }, 60000); // 60 second timeout for the full test
});
