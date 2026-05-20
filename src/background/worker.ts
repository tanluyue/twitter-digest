import type { ChirpMessage, ChirpConfig } from '../types/models';
import { DEFAULT_CONFIG, TRANSLATION_SYSTEM_PROMPT } from '../shared/constants';
import { initDB, upsertTweet, upsertInteraction, addDwellTime, getTodayStats, cleanupOldData, getTranslation, saveTranslation, getInteractionsByDate, getTweetsByUrls } from '../db/index';
import { ensureDigestAlarm } from './digest-scheduler';
import { generateDigest } from './digest-generator';
import { callDoubao, callDoubaoStream } from './doubao-client';

chrome.runtime.onInstalled.addListener(handleInstalled);
chrome.runtime.onMessage.addListener(handleMessage);
chrome.alarms.onAlarm.addListener(handleAlarm);

async function getConfig(): Promise<ChirpConfig> {
  const result = await chrome.storage.local.get('config');
  const stored = result.config ?? {};
  const merged = { ...DEFAULT_CONFIG, ...stored };
  if (!merged.doubaoApiKey && DEFAULT_CONFIG.doubaoApiKey) {
    merged.doubaoApiKey = DEFAULT_CONFIG.doubaoApiKey;
  }
  if (merged.translationEnabled === undefined) {
    merged.translationEnabled = DEFAULT_CONFIG.translationEnabled;
  }
  return merged;
}

async function handleInstalled(details: chrome.runtime.InstalledDetails) {
  const config = await getConfig();
  await chrome.storage.local.set({ config });
  await ensureDigestAlarm(config);
  await cleanupOldData();
  console.log(`[Chirp] Installed (${details.reason}), API key configured: ${!!config.doubaoApiKey}`);
}

function handleMessage(
  message: ChirpMessage | { type: 'OPEN_SIDE_PANEL' },
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void
): boolean {
  if (message.type === 'OPEN_SIDE_PANEL') {
    const tabId = sender.tab?.id;
    if (tabId) {
      chrome.sidePanel.open({ tabId }).then(
        () => sendResponse({ success: true }),
        () => sendResponse({ error: 'Failed to open side panel' })
      );
    } else {
      sendResponse({ error: 'No tab' });
    }
    return true;
  }
  processMessage(message, sendResponse, sender.tab?.id);
  return true;
}

async function processMessage(
  message: ChirpMessage,
  sendResponse: (response?: unknown) => void,
  tabId?: number
) {
  try {
    await initDB();

    switch (message.type) {
      case 'TWEET_OBSERVED':
        await upsertTweet(message.payload);
        break;

      case 'DWELL_UPDATE':
        await addDwellTime(message.payload.tweetUrl, message.payload.dwellMs);
        break;

      case 'INTERACTION_UPDATE':
        await upsertInteraction(message.payload);
        break;

      case 'BATCH':
        for (const msg of message.payload) {
          await processMessage(msg, () => {});
        }
        break;

      case 'GET_TODAY_STATS': {
        const stats = await getTodayStats();
        sendResponse(stats);
        return;
      }

      case 'GENERATE_DIGEST_NOW': {
        const config = await getConfig();
        if (!config.doubaoApiKey) {
          sendResponse({ error: 'API key not configured' });
          return;
        }
        await generateDigest(config, message.payload.dateKey);
        sendResponse({ success: true });
        return;
      }

      case 'TRANSLATE_REQUEST': {
        const { tweetUrl, text } = message.payload;
        const cached = await getTranslation(tweetUrl);
        if (cached && text.length <= cached.originalText.length + 10) {
          sendResponse(cached);
          return;
        }
        const config = await getConfig();
        if (!config.doubaoApiKey) {
          console.warn('[Chirp] No API key for translation');
          sendResponse({ error: 'API key not configured' });
          return;
        }
        sendResponse({ streaming: true });
        try {
          console.log('[Chirp] Streaming translation for:', tweetUrl);
          const fullText = await callDoubaoStream(config, TRANSLATION_SYSTEM_PROMPT, text, (chunk) => {
            if (tabId) {
              chrome.tabs.sendMessage(tabId, { type: 'TRANSLATE_CHUNK', payload: { tweetUrl, text: chunk, done: false } });
            }
          });
          if (tabId) {
            chrome.tabs.sendMessage(tabId, { type: 'TRANSLATE_CHUNK', payload: { tweetUrl, text: fullText.trim(), done: true } });
          }
          const record = { tweetUrl, originalText: text, translatedText: fullText.trim(), translatedAt: Date.now() };
          await saveTranslation(record);
          console.log('[Chirp] Streaming translation done:', record.translatedText.slice(0, 50));
        } catch (err) {
          console.error('[Chirp] Translation API error:', err);
          if (tabId) {
            chrome.tabs.sendMessage(tabId, { type: 'TRANSLATE_CHUNK', payload: { tweetUrl, text: '', done: true } });
          }
        }
        return;
      }

      case 'GET_INTERACTIONS': {
        const { dateKey, filter } = message.payload;
        const interactions = await getInteractionsByDate(dateKey);
        const filtered = filter === 'liked'
          ? interactions.filter(i => i.liked)
          : filter === 'bookmarked'
            ? interactions.filter(i => i.bookmarked)
            : interactions;
        const tweetUrls = filtered.map(i => i.tweetUrl);
        const tweetsMap = await getTweetsByUrls(tweetUrls);
        const results = filtered.map(i => ({
          ...i,
          authorHandle: tweetsMap.get(i.tweetUrl)?.authorHandle ?? '',
          text: tweetsMap.get(i.tweetUrl)?.text?.slice(0, 200) ?? '',
        }));
        sendResponse(results);
        return;
      }

      case 'SAVE_CONFIG': {
        const current = await getConfig();
        const updated = { ...current, ...message.payload };
        await chrome.storage.local.set({ config: updated });
        await ensureDigestAlarm(updated);
        sendResponse({ success: true });
        return;
      }
    }

    sendResponse({ success: true });
  } catch (err) {
    console.error('[Chirp] Error processing message:', err);
    sendResponse({ error: String(err) });
  }
}

async function handleAlarm(alarm: chrome.alarms.Alarm) {
  if (alarm.name === 'daily-digest') {
    try {
      const config = await getConfig();
      if (config.doubaoApiKey) {
        await generateDigest(config);
      }
      await cleanupOldData();
    } catch (err) {
      console.error('[Chirp] Digest generation failed:', err);
    }
  }
}

console.log('[Chirp] Service worker started');
