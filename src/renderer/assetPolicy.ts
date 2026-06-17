import type { Page } from '@playwright/test';

export async function blockExternalRequests(page: Page): Promise<() => string | null> {
  let blockedUrl: string | null = null;
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith('http://') || url.startsWith('https://')) {
      blockedUrl = url;
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });
  return () => blockedUrl;
}
