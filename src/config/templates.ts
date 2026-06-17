import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const templateConfigSchema = z.object({
  template_id: z.string(),
  version: z.string(),
  name: z.string(),
  language: z.string(),
  page: z.object({
    width_px: z.number().int().positive(),
    height_px: z.number().int().positive(),
    min_pages: z.number().int().positive().default(1),
    max_pages: z.number().int().positive().default(5)
  }),
  pdf: z.object({
    print_background: z.boolean().default(true),
    prefer_css_page_size: z.boolean().default(true)
  })
});

export type TemplateConfig = z.infer<typeof templateConfigSchema>;

export type TemplatePackage = {
  id: string;
  version: string;
  dir: string;
  config: TemplateConfig;
  schema: unknown;
  html: string;
  css: string;
  samplePath: string;
};

export class TemplateRegistry {
  private templates = new Map<string, TemplatePackage>();

  constructor(private templatesDir: string) {}

  load(): void {
    if (!fs.existsSync(this.templatesDir)) {
      throw new Error(`Templates directory not found: ${this.templatesDir}`);
    }
    for (const templateId of fs.readdirSync(this.templatesDir)) {
      const templateRoot = path.join(this.templatesDir, templateId);
      if (!fs.statSync(templateRoot).isDirectory()) continue;
      for (const version of fs.readdirSync(templateRoot)) {
        const dir = path.join(templateRoot, version);
        if (!fs.statSync(dir).isDirectory()) continue;
        const required = ['template.config.json', 'schema.json', 'template.html.njk', 'styles.css', 'sample.json'];
        for (const filename of required) {
          if (!fs.existsSync(path.join(dir, filename))) {
            throw new Error(`Template ${templateId}/${version} missing ${filename}`);
          }
        }
        const config = templateConfigSchema.parse(JSON.parse(fs.readFileSync(path.join(dir, 'template.config.json'), 'utf8')));
        const schema = JSON.parse(fs.readFileSync(path.join(dir, 'schema.json'), 'utf8'));
        const html = fs.readFileSync(path.join(dir, 'template.html.njk'), 'utf8');
        const css = fs.readFileSync(path.join(dir, 'styles.css'), 'utf8');
        this.templates.set(this.key(config.template_id, config.version), {
          id: config.template_id,
          version: config.version,
          dir,
          config,
          schema,
          html,
          css,
          samplePath: path.join(dir, 'sample.json')
        });
      }
    }
  }

  get(id: string, version: string): TemplatePackage | undefined {
    return this.templates.get(this.key(id, version));
  }

  list(): TemplatePackage[] {
    return [...this.templates.values()];
  }

  private key(id: string, version: string): string {
    return `${id}@${version}`;
  }
}
