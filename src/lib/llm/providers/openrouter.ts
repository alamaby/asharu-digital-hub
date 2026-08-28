import { OpenAICompatibleProvider } from './openai-compatible';

export function createOpenRouterProvider(baseUrl = 'https://openrouter.ai/api/v1') {
  return new OpenAICompatibleProvider('openrouter', baseUrl);
}
