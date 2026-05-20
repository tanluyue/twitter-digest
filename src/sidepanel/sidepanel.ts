import { initDB } from '../db/index';
import { getTodayKey, formatDateKey } from '../shared/constants';
import type { DailyDigest, DigestTopic } from '../types/models';

let currentDate = new Date();
let db: Awaited<ReturnType<typeof initDB>>;
let activeTab = 'digest';

function updateDateDisplay() {
  document.getElementById('current-date')!.textContent =
    currentDate.toLocaleDateString('zh-CN');
}

// Tab navigation
for (const tab of document.querySelectorAll<HTMLElement>('.tab')) {
  tab.addEventListener('click', () => {
    document.querySelector('.tab.active')?.classList.remove('active');
    tab.classList.add('active');
    activeTab = tab.dataset.tab!;
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.getElementById(`${activeTab}-container`)!.classList.remove('hidden');
    if (activeTab === 'liked') loadInteractions('liked');
    if (activeTab === 'bookmarked') loadInteractions('bookmarked');
  });
}

async function loadDigest() {
  const dateKey = formatDateKey(currentDate);
  const digestContent = document.getElementById('digest-content')!;
  const emptyState = document.getElementById('empty-state')!;
  const loading = document.getElementById('loading')!;

  digestContent.classList.add('hidden');
  emptyState.classList.add('hidden');
  loading.classList.add('hidden');

  const digest = await db.get('digests', dateKey);

  if (!digest) {
    emptyState.classList.remove('hidden');
    return;
  }

  renderDigest(digest);
  digestContent.classList.remove('hidden');
}

function renderDigest(digest: DailyDigest) {
  document.getElementById('digest-summary')!.textContent = digest.content.summary;

  const topicsList = document.getElementById('topics-list')!;
  topicsList.innerHTML = '';
  for (const topic of digest.content.topics) {
    topicsList.appendChild(createTopicCard(topic));
  }

  const insightsList = document.getElementById('insights-list')!;
  insightsList.innerHTML = '';
  for (const insight of digest.content.insights) {
    const li = document.createElement('li');
    li.textContent = insight;
    insightsList.appendChild(li);
  }

  const trendsList = document.getElementById('trends-list')!;
  trendsList.innerHTML = '';
  for (const trend of digest.content.trends) {
    const li = document.createElement('li');
    li.textContent = trend;
    trendsList.appendChild(li);
  }
}

function createTopicCard(topic: DigestTopic): HTMLElement {
  const card = document.createElement('div');
  card.className = 'topic-card';

  const name = document.createElement('div');
  name.className = 'topic-name';
  name.textContent = topic.name;
  card.appendChild(name);

  const summary = document.createElement('div');
  summary.className = 'topic-summary';
  summary.textContent = topic.topicSummary;
  card.appendChild(summary);

  for (const ref of topic.tweets) {
    const a = document.createElement('a');
    a.className = 'tweet-ref';
    a.href = ref.tweetUrl;
    a.target = '_blank';
    a.innerHTML = `<span class="handle">${esc(ref.authorHandle)}</span> ${esc(ref.snippet)}`;
    card.appendChild(a);
  }

  return card;
}

async function loadInteractions(filter: 'liked' | 'bookmarked') {
  const dateKey = formatDateKey(currentDate);
  const listEl = document.getElementById(`${filter}-list`)!;
  const emptyEl = document.getElementById(`${filter}-empty`)!;
  listEl.innerHTML = '';

  try {
    const results: Array<{
      tweetUrl: string;
      authorHandle: string;
      text: string;
      liked: boolean;
      bookmarked: boolean;
      clickedInto: boolean;
      dwellTimeMs: number;
    }> = await chrome.runtime.sendMessage({
      type: 'GET_INTERACTIONS',
      payload: { dateKey, filter },
    });

    if (!results || results.length === 0) {
      emptyEl.classList.remove('hidden');
      listEl.classList.add('hidden');
      return;
    }

    emptyEl.classList.add('hidden');
    listEl.classList.remove('hidden');

    for (const item of results) {
      const a = document.createElement('a');
      a.className = 'tweet-item';
      a.href = item.tweetUrl;
      a.target = '_blank';

      const signals: string[] = [];
      if (item.liked) signals.push('Liked');
      if (item.bookmarked) signals.push('Saved');
      if (item.clickedInto) signals.push('Clicked');
      if (item.dwellTimeMs > 3000) signals.push(`${Math.round(item.dwellTimeMs / 1000)}s`);

      a.innerHTML = `
        <div class="tweet-author">${esc(item.authorHandle)}</div>
        <div class="tweet-preview">${esc(item.text)}</div>
        ${signals.length > 0 ? `<div class="tweet-signals">${signals.join(' · ')}</div>` : ''}
      `;
      listEl.appendChild(a);
    }
  } catch {
    emptyEl.classList.remove('hidden');
    listEl.classList.add('hidden');
  }
}

function esc(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Date navigation
document.getElementById('prev-day')!.addEventListener('click', () => {
  currentDate.setDate(currentDate.getDate() - 1);
  updateDateDisplay();
  onDateChange();
});

document.getElementById('next-day')!.addEventListener('click', () => {
  currentDate.setDate(currentDate.getDate() + 1);
  updateDateDisplay();
  onDateChange();
});

function onDateChange() {
  if (activeTab === 'digest') loadDigest();
  else if (activeTab === 'liked') loadInteractions('liked');
  else if (activeTab === 'bookmarked') loadInteractions('bookmarked');
}

// Generate digest
document.getElementById('generate-btn')!.addEventListener('click', async () => {
  const loading = document.getElementById('loading')!;
  const emptyState = document.getElementById('empty-state')!;
  emptyState.classList.add('hidden');
  loading.classList.remove('hidden');

  try {
    await chrome.runtime.sendMessage({ type: 'GENERATE_DIGEST_NOW', payload: { dateKey: formatDateKey(currentDate) } });
    await loadDigest();
  } catch (err) {
    loading.classList.add('hidden');
    emptyState.classList.remove('hidden');
    console.error('Failed to generate digest:', err);
  }
});

// Init
(async () => {
  db = await initDB();
  updateDateDisplay();
  loadDigest();
})();
