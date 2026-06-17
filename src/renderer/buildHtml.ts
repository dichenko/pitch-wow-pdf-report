import type { TemplatePackage } from '../config/templates.js';
import { createTemplateEnvironment } from './templateEngine.js';

export function buildHtml(template: TemplatePackage, payload: unknown): string {
  const env = createTemplateEnvironment(template);
  const body = env.render('template.html.njk', { payload, template: template.config });
  return `<!doctype html>
<html lang="${template.config.language}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>${template.css}</style>
</head>
<body>
${body}
</body>
</html>`;
}
