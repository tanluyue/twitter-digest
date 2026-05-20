import { SELECTORS } from '../shared/constants';
import type { MessageBuffer } from '../shared/messages';
import { VisibilityTracker } from './visibility-tracker';
import { Translator } from './translator';
import { extractTweet, getTweetUrlFromArticle } from './tweet-extractor';

export class FeedObserver {
  private observer: MutationObserver | null = null;
  private trackedArticles = new Map<HTMLElement, string>();
  private visibility: VisibilityTracker;
  private buffer: MessageBuffer;
  private translator: Translator;
  private currentColumn: HTMLElement | null = null;
  private scanning = false;
  private tweetCallbacks: ((tweet: import('../types/models').TweetRecord) => void)[] = [];

  constructor(visibility: VisibilityTracker, buffer: MessageBuffer, translator: Translator) {
    this.visibility = visibility;
    this.buffer = buffer;
    this.translator = translator;
  }

  onTweetObserved(cb: (tweet: import('../types/models').TweetRecord) => void) {
    this.tweetCallbacks.push(cb);
  }

  start() {
    this.attachToColumn();
    this.watchNavigation();

    new MutationObserver(() => {
      const col = document.querySelector<HTMLElement>(SELECTORS.PRIMARY_COLUMN);
      if (col && col !== this.currentColumn) {
        this.attachToColumn();
      }
    }).observe(document.body, { childList: true, subtree: true });

    window.setInterval(() => this.scanArticles(), 2000);
  }

  private attachToColumn() {
    const column = document.querySelector<HTMLElement>(SELECTORS.PRIMARY_COLUMN);
    if (!column || column === this.currentColumn) return;

    this.observer?.disconnect();
    this.currentColumn = column;
    this.scanArticles();

    this.observer = new MutationObserver(() => this.scanArticles());
    this.observer.observe(column, { childList: true, subtree: true });
  }

  private watchNavigation() {
    const onNav = () => {
      this.trackedArticles.clear();
      window.dispatchEvent(new Event('chirp:navigation'));
      setTimeout(() => this.attachToColumn(), 200);
      setTimeout(() => this.scanArticles(), 600);
      setTimeout(() => this.scanArticles(), 1500);
      setTimeout(() => this.scanArticles(), 3000);
    };

    const origPush = history.pushState.bind(history);
    history.pushState = function (...args) {
      origPush(...args);
      onNav();
    };

    const origReplace = history.replaceState.bind(history);
    history.replaceState = function (...args) {
      origReplace(...args);
      onNav();
    };

    window.addEventListener('popstate', onNav);
  }

  private scanArticles() {
    if (this.scanning) return;
    this.scanning = true;

    try {
      const currentArticles = document.querySelectorAll<HTMLElement>(SELECTORS.TWEET_ARTICLE);
      const seen = new Set<HTMLElement>();

      for (const article of currentArticles) {
        seen.add(article);
        const tweetUrl = getTweetUrlFromArticle(article);
        if (!tweetUrl) continue;

        const previousUrl = this.trackedArticles.get(article);

        if (previousUrl === tweetUrl) {
          this.translator.reapplyFromCache(tweetUrl, article);
          continue;
        }

        if (previousUrl) {
          this.visibility.untrack(previousUrl);
        }

        this.trackedArticles.set(article, tweetUrl);
        this.visibility.track(tweetUrl, article);
        this.visibility.updateElementMapping(article, tweetUrl);

        const tweet = extractTweet(article);
        if (tweet) {
          this.buffer.enqueue({ type: 'TWEET_OBSERVED', payload: tweet });
          this.buffer.enqueue({ type: 'INTERACTION_UPDATE', payload: { tweetUrl: tweet.tweetUrl } });
          for (const cb of this.tweetCallbacks) cb(tweet);
          if (tweet.text) {
            this.translator.translateTweet(tweet.tweetUrl, tweet.text, article);
          }
        }
      }

      for (const [article, url] of this.trackedArticles) {
        if (!seen.has(article)) {
          this.visibility.untrack(url);
          this.trackedArticles.delete(article);
        }
      }
    } finally {
      this.scanning = false;
    }
  }

  destroy() {
    this.observer?.disconnect();
    this.visibility.destroy();
  }
}
