import puppeteer, { Browser, Page } from 'puppeteer';
import { join } from 'path';

export interface ExtensionTestSetup {
  browser: Browser;
  page: Page;
  extensionId: string;
}

export async function setupExtensionTest(): Promise<ExtensionTestSetup> {
  const headless = process.env.HEADLESS !== 'false';
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

  // Mock chrome.permissions.request in extension context
  const targets = await browser.targets();
  const extensionTarget = targets.find(target => target.type() === 'service_worker');
  if (extensionTarget) {
    const extensionPage = await extensionTarget.page();
    if (extensionPage) {
      await extensionPage.evaluateOnNewDocument(() => {
        (globalThis as any).chrome = (globalThis as any).chrome || {};
        (globalThis as any).chrome.permissions = {
          request: () => Promise.resolve(true)
        };
      });
    }
  }

  const page = await browser.newPage();
  const extensionId = await getExtensionId(browser);

  return { browser, page, extensionId };
}

export async function getExtensionId(browser: Browser): Promise<string> {
  const targets = await browser.targets();
  const extensionTarget = targets.find(target => 
    target.type() === 'service_worker' && target.url().startsWith('chrome-extension://')
  );
  if (!extensionTarget) {
    throw new Error('Extension not found');
  }
  const url = extensionTarget.url();
  const match = url.match(/chrome-extension:\/\/([a-z]+)\//);
  if (!match) {
    throw new Error('Could not extract extension ID');
  }
  return match[1];
}
