import puppeteer, { Browser, Page } from 'puppeteer';
import { join } from 'path';

export interface ExtensionTestSetup {
  browser: Browser;
  page: Page;
  extensionId: string;
}

export async function setupExtensionTest(): Promise<ExtensionTestSetup> {
  const headless = process.env['HEADLESS'] !== 'false';
  const extensionPath = join(process.cwd(), 'packages/actual-ext-bridge-example/dist');
  
  const browser = await puppeteer.launch({
    headless,
    args: [
      `--load-extension=${extensionPath}`,
      '--disable-extensions-except=' + extensionPath,
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor'
    ]
  });

  /*
  // Mock chrome.permissions.request in extension context
  const targets = browser.targets();
  const extensionTarget = targets.find(target => target.type() === 'service_worker');
  if (extensionTarget) {
    const extensionPage = await extensionTarget.page();
    if (extensionPage) {
      await extensionPage.evaluateOnNewDocument(() => {
        (globalThis as any).chrome = (globalThis as any).chrome || {};
        (globalThis as any).chrome.permissions = {
          request: () => {console.log('THROMER mock called yay');Promise.resolve(true);}
        };
      });
    }
  }
   */

  const page = await browser.newPage();
  const extensionId = await getExtensionId(browser);

  return { browser, page, extensionId };
}

export async function getExtensionId(browser: Browser): Promise<string> {
  console.log(`waitForTarget`);
  const workerTarget = await browser.waitForTarget(
    // Assumes that there is only one service worker created by the
    // extension and its URL ends with background.js.
    target =>
      target.type() === 'service_worker' &&
	target.url().endsWith('service-worker.js'),
  );
  const url = workerTarget.url();
  const match = url.match(/chrome-extension:\/\/([a-z]+)\//);
  if (!match?.[1]) {
    throw new Error(`Could not extract extension ID from ${url}`);
  }
  return match[1];
}

export async function mockPermissionsInSidepanel(browser: Browser) {
  const targets = browser.targets();
  const extensionId = await getExtensionId(browser);
  const sidepanelTarget = targets.find(target => target.url() === `chrome-extension://${extensionId}/src/sidepanel/index.html`);
  if (!sidepanelTarget) {
    throw new Error('Sidepanel not found');
  }
  /*
  hmm
  const extensionPage = await extensionTarget.page();
  if (extensionPage) {
    await extensionPage.evaluateOnNewDocument(() => {
      (globalThis as any).chrome = (globalThis as any).chrome || {};
      (globalThis as any).chrome.permissions = {
        request: () => {console.log('THROMER mock called yay');Promise.resolve(true);}
      };
    });
  }
   */
}
