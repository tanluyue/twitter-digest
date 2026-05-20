import { openDB, type IDBPDatabase, type DBSchema } from 'idb';
import type { TweetRecord, TweetInteraction, DailyDigest, TranslationRecord } from '../types/models';
import { getTodayKey, DATA_RETENTION_DAYS, formatDateKey } from '../shared/constants';

interface ChirpDB extends DBSchema {
  tweets: {
    key: string;
    value: TweetRecord;
    indexes: { 'by-date': string };
  };
  interactions: {
    key: string;
    value: TweetInteraction;
    indexes: { 'by-date': string };
  };
  digests: {
    key: string;
    value: DailyDigest;
  };
  translations: {
    key: string;
    value: TranslationRecord;
  };
}

let dbInstance: IDBPDatabase<ChirpDB> | null = null;

export async function initDB(): Promise<IDBPDatabase<ChirpDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<ChirpDB>('chirp-db', 2, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const tweetStore = db.createObjectStore('tweets', { keyPath: 'tweetUrl' });
        tweetStore.createIndex('by-date', 'firstSeenAt');

        const interactionStore = db.createObjectStore('interactions', { keyPath: 'tweetUrl' });
        interactionStore.createIndex('by-date', 'dateKey');

        db.createObjectStore('digests', { keyPath: 'dateKey' });
      }
      if (oldVersion < 2) {
        db.createObjectStore('translations', { keyPath: 'tweetUrl' });
      }
    },
  });

  return dbInstance;
}

export async function upsertTweet(tweet: TweetRecord): Promise<void> {
  const db = await initDB();
  const existing = await db.get('tweets', tweet.tweetUrl);
  if (!existing) {
    await db.put('tweets', tweet);
  }
}

export async function upsertInteraction(
  partial: Partial<TweetInteraction> & { tweetUrl: string }
): Promise<void> {
  const db = await initDB();
  const existing = await db.get('interactions', partial.tweetUrl);
  const now = Date.now();
  const dateKey = getTodayKey();

  if (existing) {
    await db.put('interactions', {
      ...existing,
      ...partial,
      dwellTimeMs: existing.dwellTimeMs + (partial.dwellTimeMs ?? 0),
      liked: partial.liked ?? existing.liked,
      bookmarked: partial.bookmarked ?? existing.bookmarked,
      clickedInto: partial.clickedInto ?? existing.clickedInto,
      followedAuthor: partial.followedAuthor ?? existing.followedAuthor,
      updatedAt: now,
    });
  } else {
    await db.put('interactions', {
      tweetUrl: partial.tweetUrl,
      dwellTimeMs: partial.dwellTimeMs ?? 0,
      liked: partial.liked ?? false,
      bookmarked: partial.bookmarked ?? false,
      clickedInto: partial.clickedInto ?? false,
      followedAuthor: partial.followedAuthor ?? false,
      updatedAt: now,
      dateKey,
    });
  }
}

export async function addDwellTime(tweetUrl: string, dwellMs: number): Promise<void> {
  await upsertInteraction({ tweetUrl, dwellTimeMs: dwellMs });
}

export async function getInteractionsByDate(dateKey: string): Promise<TweetInteraction[]> {
  const db = await initDB();
  return db.getAllFromIndex('interactions', 'by-date', dateKey);
}

export async function getTweetsByUrls(urls: string[]): Promise<Map<string, TweetRecord>> {
  const db = await initDB();
  const map = new Map<string, TweetRecord>();
  for (const url of urls) {
    const tweet = await db.get('tweets', url);
    if (tweet) map.set(url, tweet);
  }
  return map;
}

export async function saveDigest(digest: DailyDigest): Promise<void> {
  const db = await initDB();
  await db.put('digests', digest);
}

export async function getDigest(dateKey: string): Promise<DailyDigest | undefined> {
  const db = await initDB();
  return db.get('digests', dateKey);
}

export async function getTodayStats(): Promise<{
  tweetsRead: number;
  liked: number;
  bookmarked: number;
}> {
  const interactions = await getInteractionsByDate(getTodayKey());
  return {
    tweetsRead: interactions.length,
    liked: interactions.filter(i => i.liked).length,
    bookmarked: interactions.filter(i => i.bookmarked).length,
  };
}

export async function getTranslation(tweetUrl: string): Promise<TranslationRecord | undefined> {
  const db = await initDB();
  return db.get('translations', tweetUrl);
}

export async function saveTranslation(record: TranslationRecord): Promise<void> {
  const db = await initDB();
  await db.put('translations', record);
}

export async function getTodayTweets(): Promise<TweetRecord[]> {
  const db = await initDB();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const startTs = todayStart.getTime();
  const all = await db.getAll('tweets');
  return all.filter(t => t.firstSeenAt >= startTs);
}

export async function getInteractionsFiltered(
  dateKey: string,
  filter?: { liked?: boolean; bookmarked?: boolean }
): Promise<TweetInteraction[]> {
  const all = await getInteractionsByDate(dateKey);
  if (!filter) return all;
  return all.filter(i => {
    if (filter.liked && !i.liked) return false;
    if (filter.bookmarked && !i.bookmarked) return false;
    return true;
  });
}

export async function cleanupOldData(): Promise<void> {
  const db = await initDB();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - DATA_RETENTION_DAYS);
  const cutoffKey = formatDateKey(cutoff);

  const tx = db.transaction(['interactions', 'digests'], 'readwrite');

  const interactionIndex = tx.objectStore('interactions').index('by-date');
  let cursor = await interactionIndex.openCursor(IDBKeyRange.upperBound(cutoffKey));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }

  const digestStore = tx.objectStore('digests');
  let digestCursor = await digestStore.openCursor(IDBKeyRange.upperBound(cutoffKey));
  while (digestCursor) {
    await digestCursor.delete();
    digestCursor = await digestCursor.continue();
  }

  await tx.done;
}
