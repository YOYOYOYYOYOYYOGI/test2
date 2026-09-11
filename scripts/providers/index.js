/*
 * Provider factory. The rest of the extension only ever talks to this bundle,
 * never to a concrete vendor SDK, so providers can be swapped in Settings
 * without touching workflow/UI code.
 */

import { createLlmProvider } from './llm.js';
import { createImageProvider } from './image.js';
import { createVideoProvider } from './video.js';
import { createProxyProviders } from './proxy.js';

export function createProviders(settings) {
  if (settings.mode === 'proxy') {
    const proxies = createProxyProviders(settings);
    return {
      mode: 'proxy',
      llm: proxies.llm,
      image: proxies.image,
      video: proxies.video,
      // Proxy handles LLM itself; local templates never apply in proxy mode.
      llmIsLocal: false,
    };
  }
  return {
    mode: 'direct',
    llm: createLlmProvider(settings), // null when the offline template provider is selected
    image: createImageProvider(settings),
    video: createVideoProvider(settings),
    llmIsLocal: settings.llm.provider === 'local',
  };
}
