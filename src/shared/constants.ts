export const SELECTORS = {
  TWEET_ARTICLE: 'article[data-testid="tweet"]',
  TWEET_TEXT: '[data-testid="tweetText"]',
  USER_NAME: '[data-testid="User-Name"]',
  LIKE_BUTTON: '[data-testid="like"]',
  UNLIKE_BUTTON: '[data-testid="unlike"]',
  BOOKMARK_BUTTON: '[data-testid="bookmark"]',
  REMOVE_BOOKMARK: '[data-testid="removeBookmark"]',
  TWEET_PHOTO: '[data-testid="tweetPhoto"]',
  PRIMARY_COLUMN: '[data-testid="primaryColumn"]',
  FOLLOW_BUTTON: '[data-testid$="-follow"]',
  UNFOLLOW_BUTTON: '[data-testid$="-unfollow"]',
} as const;

export const TWEET_URL_PATTERN = /https:\/\/x\.com\/(\w+)\/status\/(\d+)/;
export const TWEET_PATH_PATTERN = /^\/(\w+)\/status\/(\d+)/;

export const DEFAULT_SCORING_WEIGHTS = {
  dwellTime: 0.40,
  liked: 0.25,
  bookmarked: 0.20,
  clickedInto: 0.10,
  followed: 0.05,
} as const;

export const DEFAULT_CONFIG = {
  doubaoApiKey: 'f031675f-aebb-4878-be82-95dfbc42ce50',
  doubaoModel: 'doubao-1-5-pro-32k-250115',
  doubaoEndpoint: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
  digestHour: 22,
  topNForDigest: 30,
  dwellThresholdMs: 2000,
  scoringWeights: { ...DEFAULT_SCORING_WEIGHTS },
  translationEnabled: true,
};

export const MESSAGE_BUFFER_INTERVAL_MS = 10_000;
export const DWELL_VISIBILITY_THRESHOLD = 0.5;
export const DATA_RETENTION_DAYS = 90;

export const TRANSLATION_SYSTEM_PROMPT = `You are a translation assistant. Translate the following English tweet into natural, concise Chinese. Only output the translation, nothing else. Keep @mentions, #hashtags, and URLs unchanged.`;
export const CHIRP_TRANSLATION_CLASS = 'chirp-translation';

export function getTodayKey(): string {
  return formatDateKey(new Date());
}

export function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
