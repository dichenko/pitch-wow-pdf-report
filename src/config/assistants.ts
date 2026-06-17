import fs from 'node:fs';
import { z } from 'zod';
import { verifySha256 } from '../utils/crypto.js';

const assistantSchema = z.object({
  assistant_id: z.string().min(1),
  name: z.string().min(1),
  active: z.boolean(),
  api_key_hash: z.string().regex(/^[a-f0-9]{64}$/i),
  default_template_id: z.string().min(1),
  default_template_version: z.string().min(1),
  rate_limit_per_minute: z.number().int().positive().optional()
});

export type Assistant = z.infer<typeof assistantSchema>;

const configSchema = z.object({
  assistants: z.array(assistantSchema)
});

export class AssistantsRegistry {
  private assistants: Assistant[];

  constructor(configPath: string) {
    const raw = fs.readFileSync(configPath, 'utf8');
    this.assistants = configSchema.parse(JSON.parse(raw)).assistants;
  }

  authenticate(apiKey: string): Assistant | null {
    for (const assistant of this.assistants) {
      if (assistant.active && verifySha256(apiKey, assistant.api_key_hash)) {
        return assistant;
      }
    }
    return null;
  }

  list(): Assistant[] {
    return [...this.assistants];
  }
}
