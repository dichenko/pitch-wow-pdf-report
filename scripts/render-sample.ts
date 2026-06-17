import fs from 'node:fs';
import path from 'node:path';
import { env } from '../src/config/env.js';
import { TemplateRegistry } from '../src/config/templates.js';
import { renderReport } from '../src/renderer/renderReport.js';
import { ensureDir, writeJson } from '../src/storage/storage.js';

const [templateId, version] = process.argv.slice(2);
if (!templateId || !version) {
  console.error('Usage: npm run render:sample -- <template_id> <version>');
  process.exit(1);
}

const templates = new TemplateRegistry(env.TEMPLATES_DIR);
templates.load();
const template = templates.get(templateId, version);
if (!template) {
  console.error(`Template not found: ${templateId}/${version}`);
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(template.samplePath, 'utf8'));
const outputDir = path.join(env.DATA_DIR, 'sample-renders', templateId, version);
ensureDir(outputDir);
writeJson(path.join(outputDir, 'input.json'), payload);
const result = await renderReport(template, payload, outputDir, env.JOB_TIMEOUT_SECONDS * 1000);
console.log(`Rendered HTML: ${result.renderedHtmlPath}`);
console.log(`Rendered PDF: ${result.pdfPath}`);
