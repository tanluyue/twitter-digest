import { SELECTORS, TWEET_URL_PATTERN, TWEET_PATH_PATTERN } from '../shared/constants';
import type { MessageBuffer } from '../shared/messages';
import { getTweetUrlFromArticle } from './tweet-extractor';

export type InteractionType = 'liked' | 'bookmarked' | 'followedAuthor' | 'clickedInto';
export type InteractionCallback = (type: InteractionType, tweetUrl: string) => void;

export class InteractionTracker {
  private buffer: MessageBuffer;
  private callbacks: InteractionCallback[] = [];

  constructor(buffer: MessageBuffer) {
    this.buffer = buffer;
    this.setupClickListener();
    this.setupUrlMonitor();
  }

  onInteraction(cb: InteractionCallback) {
    this.callbacks.push(cb);
  }

  private notify(type: InteractionType, tweetUrl: string) {
    for (const cb of this.callbacks) cb(type, tweetUrl);
  }

  private setupClickListener() {
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const article = target.closest(SELECTORS.TWEET_ARTICLE) as HTMLElement | null;
      if (!article) return;

      const tweetUrl = getTweetUrlFromArticle(article);
      if (!tweetUrl) return;

      if (target.closest(SELECTORS.LIKE_BUTTON)) {
        this.buffer.enqueue({
          type: 'INTERACTION_UPDATE',
          payload: { tweetUrl, liked: true },
        });
        this.notify('liked', tweetUrl);
        return;
      }

      if (target.closest(SELECTORS.BOOKMARK_BUTTON)) {
        this.buffer.enqueue({
          type: 'INTERACTION_UPDATE',
          payload: { tweetUrl, bookmarked: true },
        });
        this.notify('bookmarked', tweetUrl);
        return;
      }

      if (target.closest(SELECTORS.FOLLOW_BUTTON)) {
        this.buffer.enqueue({
          type: 'INTERACTION_UPDATE',
          payload: { tweetUrl, followedAuthor: true },
        });
        this.notify('followedAuthor', tweetUrl);
        return;
      }

      const link = target.closest('a') as HTMLAnchorElement | null;
      if (link && TWEET_URL_PATTERN.test(link.href)) {
        this.buffer.enqueue({
          type: 'INTERACTION_UPDATE',
          payload: { tweetUrl, clickedInto: true },
        });
        this.notify('clickedInto', tweetUrl);
      }
    }, true);
  }

  private setupUrlMonitor() {
    const emit = () => {
      const match = location.pathname.match(TWEET_PATH_PATTERN);
      if (match) {
        const tweetUrl = `https://x.com${location.pathname.match(/^\/\w+\/status\/\d+/)![0]}`;
        this.buffer.enqueue({
          type: 'INTERACTION_UPDATE',
          payload: { tweetUrl, clickedInto: true },
        });
        this.notify('clickedInto', tweetUrl);
      }
    };

    window.addEventListener('chirp:navigation', emit);
    window.addEventListener('popstate', emit);
  }
}
