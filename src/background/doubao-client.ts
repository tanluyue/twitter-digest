import type { ChirpConfig } from '../types/models';

export async function callDoubao(
  config: ChirpConfig,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const response = await fetchWithRetry(config, systemPrompt, userPrompt);
  const data = await response.json();
  return data.choices[0].message.content;
}

export async function callDoubaoStream(
  config: ChirpConfig,
  systemPrompt: string,
  userPrompt: string,
  onChunk: (text: string) => void,
  options?: { temperature?: number; maxTokens?: number }
): Promise<string> {
  const response = await fetch(config.doubaoEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.doubaoApiKey}`,
    },
    body: JSON.stringify({
      model: config.doubaoModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: options?.temperature ?? 0.3,
      max_tokens: options?.maxTokens ?? 4096,
      stream: true,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Doubao API ${response.status}: ${err}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);
      if (data === '[DONE]') break;

      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          fullText += delta;
          onChunk(fullText);
        }
      } catch {}
    }
  }

  return fullText;
}

async function fetchWithRetry(
  config: ChirpConfig,
  systemPrompt: string,
  userPrompt: string,
  maxRetries = 3
): Promise<Response> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(config.doubaoEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.doubaoApiKey}`,
        },
        body: JSON.stringify({
          model: config.doubaoModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.3,
          max_tokens: 4096,
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Doubao API ${response.status}: ${err}`);
      }

      return response;
    } catch (err) {
      if (attempt === maxRetries - 1) throw err;
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }
  throw new Error('Unreachable');
}
