import path from 'node:path';
import type { TemplatePackage } from '../config/templates.js';
import { writeText, writeJson } from '../storage/storage.js';
import { buildHtml } from './buildHtml.js';
import { renderPdfFromHtmlFile } from './pdf.js';

export type RenderResult = {
  renderedHtmlPath: string;
  pdfPath: string;
};

export async function renderReport(
  template: TemplatePackage,
  payload: unknown,
  outputDir: string,
  timeoutMs: number
): Promise<RenderResult> {
  const renderedHtmlPath = path.join(outputDir, 'rendered.html');
  const pdfPath = path.join(outputDir, 'report.pdf');
  const html = buildHtml(template, payload);
  writeText(renderedHtmlPath, html);
  writeJson(path.join(outputDir, 'metadata.json'), {
    template_id: template.id,
    template_version: template.version,
    rendered_at: new Date().toISOString()
  });
  await renderPdfFromHtmlFile(renderedHtmlPath, pdfPath, template, timeoutMs);
  return { renderedHtmlPath, pdfPath };
}
