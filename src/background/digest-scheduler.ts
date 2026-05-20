import type { ChirpConfig } from '../types/models';

export async function ensureDigestAlarm(config: ChirpConfig) {
  const existing = await chrome.alarms.get('daily-digest');
  if (existing) return;

  const now = new Date();
  const target = new Date();
  target.setHours(config.digestHour, 0, 0, 0);
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  const delayMinutes = (target.getTime() - now.getTime()) / 60000;

  chrome.alarms.create('daily-digest', {
    delayInMinutes: delayMinutes,
    periodInMinutes: 24 * 60,
  });
}
