import type { FastifyRequest } from 'fastify';
import type { AssistantsRegistry, Assistant } from '../../config/assistants.js';
import { AppError } from '../../utils/errors.js';

export function getBearerToken(request: FastifyRequest): string {
  const value = request.headers.authorization;
  if (!value || !value.startsWith('Bearer ')) {
    throw new AppError('UNAUTHORIZED', 'Invalid or missing API key', 401);
  }
  return value.slice('Bearer '.length).trim();
}

export function authenticateAssistant(request: FastifyRequest, registry: AssistantsRegistry): Assistant {
  const token = getBearerToken(request);
  const assistant = registry.authenticate(token);
  if (!assistant) {
    throw new AppError('UNAUTHORIZED', 'Invalid or missing API key', 401);
  }
  return assistant;
}
