import { chromium } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { TemplatePackage } from '../config/templates.js';
import { blockExternalRequests } from './assetPolicy.js';

export async function renderPdfFromHtmlFile(
  htmlPath: string,
  outputPdfPath: string,
  template: TemplatePackage,
  timeoutMs: number
): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: {
        width: template.config.page.width_px,
        height: template.config.page.height_px
      }
    });
    const getBlockedUrl = await blockExternalRequests(page);
    await page.goto(pathToFileURL(path.resolve(htmlPath)).toString(), {
      waitUntil: 'networkidle',
      timeout: timeoutMs
    });
    const blockedAfterLoad = getBlockedUrl();
    if (blockedAfterLoad) throw new Error(`External resource blocked: ${blockedAfterLoad}`);
    await page.pdf({
      path: outputPdfPath,
      printBackground: template.config.pdf.print_background,
      preferCSSPageSize: template.config.pdf.prefer_css_page_size
    });
    const blockedAfterPdf = getBlockedUrl();
    if (blockedAfterPdf) throw new Error(`External resource blocked: ${blockedAfterPdf}`);
  } finally {
    await browser.close();
  }
}
