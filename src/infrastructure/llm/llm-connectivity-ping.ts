import { ExternalServiceError } from '../../shared/errors.js';
import { ANTHROPIC_MESSAGES_MODEL } from './anthropic-messages-model.js';

/** Minimal-cost model for connectivity checks only. */
const OPENAI_PING_MODEL = 'gpt-5-nano';

/**
 * Minimal Chat Completions request to verify the API key and network path.
 */
export async function pingOpenAi(apiKey: string): Promise<void> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_PING_MODEL,
      messages: [{ role: 'user', content: 'ping' }],
      max_completion_tokens: 16,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new ExternalServiceError(`OpenAI (${res.status}): ${t.slice(0, 280)}`);
  }
}

/**
 * Minimal Messages request to verify the API key and network path.
 */
export async function pingAnthropic(apiKey: string): Promise<void> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MESSAGES_MODEL,
      max_tokens: 1,
      messages: [{ role: 'user', content: 'ping' }],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new ExternalServiceError(`Anthropic (${res.status}): ${t.slice(0, 280)}`);
  }
}
