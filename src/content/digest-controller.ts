import type { TweetRecord } from '../types/models';
import type { InteractionType } from './interaction-tracker';
import type { ChirpPanel } from './chirp-panel';

const MAX_RECENT = 50;

export class DigestController {
  private recentTweets: { tweetUrl: string; liked: boolean; bookmarked: boolean; clickedInto: boolean }[] = [];
  private panel: ChirpPanel;

  constructor(panel: ChirpPanel) {
    this.panel = panel;
  }

  onTweetObserved(tweet: TweetRecord) {
    if (this.recentTweets.some(t => t.tweetUrl === tweet.tweetUrl)) return;
    this.recentTweets.push({
      tweetUrl: tweet.tweetUrl,
      liked: false,
      bookmarked: false,
      clickedInto: false,
    });
    if (this.recentTweets.length > MAX_RECENT) {
      this.recentTweets.shift();
    }
    this.panel.setTweetCount(this.recentTweets.length);
  }

  onInteraction(type: InteractionType, tweetUrl: string) {
    const entry = this.recentTweets.find(t => t.tweetUrl === tweetUrl);
    if (!entry) return;
    if (type === 'liked') entry.liked = true;
    if (type === 'bookmarked') entry.bookmarked = true;
    if (type === 'clickedInto') entry.clickedInto = true;
  }
}
