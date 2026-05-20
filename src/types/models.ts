export interface TweetRecord {
  tweetUrl: string;
  authorName: string;
  authorHandle: string;
  text: string;
  tweetTimestamp: string;
  mediaUrls: string[];
  firstSeenAt: number;
}

export interface TweetInteraction {
  tweetUrl: string;
  dwellTimeMs: number;
  liked: boolean;
  bookmarked: boolean;
  clickedInto: boolean;
  followedAuthor: boolean;
  updatedAt: number;
  dateKey: string;
}

export interface ScoredTweet {
  tweet: TweetRecord;
  interaction: TweetInteraction;
  score: number;
}

export interface DailyDigest {
  dateKey: string;
  generatedAt: number;
  tweetsObserved: number;
  tweetsScored: number;
  content: DigestContent;
  rawResponse: string;
}

export interface DigestContent {
  summary: string;
  topics: DigestTopic[];
  insights: string[];
  trends: string[];
}

export interface DigestTopic {
  name: string;
  tweets: DigestTweetRef[];
  topicSummary: string;
}

export interface DigestTweetRef {
  tweetUrl: string;
  authorHandle: string;
  snippet: string;
  score: number;
}

export interface TranslationRecord {
  tweetUrl: string;
  originalText: string;
  translatedText: string;
  translatedAt: number;
}

export interface ChirpConfig {
  doubaoApiKey: string;
  doubaoModel: string;
  doubaoEndpoint: string;
  digestHour: number;
  topNForDigest: number;
  dwellThresholdMs: number;
  scoringWeights: ScoringWeights;
  translationEnabled: boolean;
}

export interface ScoringWeights {
  dwellTime: number;
  liked: number;
  bookmarked: number;
  clickedInto: number;
  followed: number;
}

export type ChirpMessage =
  | { type: 'TWEET_OBSERVED'; payload: TweetRecord }
  | { type: 'INTERACTION_UPDATE'; payload: Partial<TweetInteraction> & { tweetUrl: string } }
  | { type: 'DWELL_UPDATE'; payload: { tweetUrl: string; dwellMs: number } }
  | { type: 'BATCH'; payload: ChirpMessage[] }
  | { type: 'GET_TODAY_STATS' }
  | { type: 'GET_DIGEST'; payload: { dateKey: string } }
  | { type: 'GENERATE_DIGEST_NOW'; payload: { dateKey: string } }
  | { type: 'SAVE_CONFIG'; payload: Partial<ChirpConfig> }
  | { type: 'TRANSLATE_REQUEST'; payload: { tweetUrl: string; text: string } }
  | { type: 'TRANSLATE_RESPONSE'; payload: TranslationRecord }
  | { type: 'TRANSLATE_CHUNK'; payload: { tweetUrl: string; text: string; done: boolean } }
  | { type: 'GET_INTERACTIONS'; payload: { dateKey: string; filter?: 'liked' | 'bookmarked' | 'all' } };
