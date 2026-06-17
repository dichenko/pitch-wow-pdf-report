import nunjucks from 'nunjucks';
import path from 'node:path';
import type { TemplatePackage } from '../config/templates.js';

export function createTemplateEnvironment(template: TemplatePackage): nunjucks.Environment {
  const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(template.dir), {
    autoescape: true,
    throwOnUndefined: false
  });
  env.addGlobal('asset', (name: string) => {
    const safeName = name.replaceAll('\\', '/').replace(/^\/+/, '');
    if (safeName.includes('..')) {
      throw new Error(`Invalid asset path: ${name}`);
    }
    return path.join(template.dir, 'assets', safeName).replaceAll('\\', '/');
  });
  return env;
}
