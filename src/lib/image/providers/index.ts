import type { ImageProviderRow } from '../types';
import { PixazoImageAdapter } from './pixazo';
import { CloudflareImageAdapter } from './cloudflare';
import { PollinationsImageAdapter } from './pollinations';
import { GeminiImageAdapter } from './gemini';
import { BynaraImageAdapter } from './bynara';
import type { ImageGenerationProvider } from './base';

/** Factory adapter image per slug — config non-secret dari baris provider. */
export function createImageAdapter(
  provider: ImageProviderRow,
  modelId: string,
  apiKey: string
): ImageGenerationProvider {
  const baseUrl = provider.base_url;
  const config = provider.config ?? {};
  switch (provider.slug) {
    case 'pixazo':
      return new PixazoImageAdapter({ baseUrl, model: modelId }, apiKey);
    case 'cloudflare':
      return new CloudflareImageAdapter(
        { baseUrl, model: modelId, accountId: config['account_id'] ?? '' },
        apiKey
      );
    case 'pollinations':
      return new PollinationsImageAdapter({ baseUrl, model: modelId }, apiKey);
    case 'gemini':
      return new GeminiImageAdapter({ baseUrl, model: modelId }, apiKey);
    case 'bynara':
      return new BynaraImageAdapter({ baseUrl, model: modelId }, apiKey);
    default:
      throw new Error(`Unknown image provider: ${provider.slug}`);
  }
}
