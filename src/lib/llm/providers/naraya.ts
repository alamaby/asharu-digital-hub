import { OpenAICompatibleProvider } from './openai-compatible';

export function createNarayaProvider(baseUrl = 'https://router.bynara.id/v1') {
  return new OpenAICompatibleProvider('naraya', baseUrl);
}
