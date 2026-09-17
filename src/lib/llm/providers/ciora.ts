import { OpenAICompatibleProvider } from './openai-compatible';

export function createCioraProvider(baseUrl = 'https://ciora.id/v1') {
  return new OpenAICompatibleProvider('ciora', baseUrl);
}
