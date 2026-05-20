import { initDB } from '../db/index';
import { getTodayKey } from '../shared/constants';

async function loadStats() {
  const db = await initDB();
  const todayKey = getTodayKey();

  const tx = db.transaction('interactions', 'readonly');
  const index = tx.store.index('by-date');
  const interactions = await index.getAll(todayKey);

  const tweetCount = interactions.length;
  const likedCount = interactions.filter(i => i.liked).length;
  const bookmarkedCount = interactions.filter(i => i.bookmarked).length;

  document.getElementById('tweet-count')!.textContent = String(tweetCount);
  document.getElementById('liked-count')!.textContent = String(likedCount);
  document.getElementById('bookmarked-count')!.textContent = String(bookmarkedCount);
}

document.getElementById('date')!.textContent = new Date().toLocaleDateString('zh-CN');

document.getElementById('open-digest')!.addEventListener('click', async () => {
  const windowId = (await chrome.windows.getCurrent()).id!;
  chrome.sidePanel.open({ windowId });
});

document.getElementById('open-settings')!.addEventListener('click', () => {
  chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT });
});

loadStats();
