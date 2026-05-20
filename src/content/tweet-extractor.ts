import { SELECTORS, TWEET_URL_PATTERN, TWEET_PATH_PATTERN } from '../shared/constants';
import type { TweetRecord } from '../types/models';

function resolveUrl(article: HTMLElement): { tweetUrl: string; handle: string } | null {
  const linkEl = article.querySelector<HTMLAnchorElement>('a[href*="/status/"]');
  if (linkEl) {
    const match = linkEl.href.match(TWEET_URL_PATTERN);
    if (match) return { tweetUrl: match[0], handle: match[1] };
  }
  const pathMatch = location.pathname.match(TWEET_PATH_PATTERN);
  if (pathMatch) {
    return { tweetUrl: `https://x.com/${pathMatch[1]}/status/${pathMatch[2]}`, handle: pathMatch[1] };
  }
  return null;
}

export function extractTweet(article: HTMLElement): TweetRecord | null {
  const resolved = resolveUrl(article);
  if (!resolved) return null;

  const { tweetUrl, handle } = resolved;
  const textEl = article.querySelector(SELECTORS.TWEET_TEXT);
  const text = textEl?.textContent?.trim() ?? '';

  const userNameEl = article.querySelector(SELECTORS.USER_NAME);
  let authorName = '';
  let authorHandle = '';

  if (userNameEl) {
    const spans = userNameEl.querySelectorAll('span');
    for (const span of spans) {
      const t = span.textContent?.trim() ?? '';
      if (t.startsWith('@') && !authorHandle) {
        authorHandle = t;
      }
    }
    const nameLink = userNameEl.querySelector('a');
    if (nameLink) {
      const firstSpan = nameLink.querySelector('span');
      authorName = firstSpan?.textContent?.trim() ?? nameLink.textContent?.trim() ?? '';
    }
  }

  if (!authorHandle) {
    authorHandle = `@${handle}`;
  }

  const timeEl = article.querySelector('time');
  const tweetTimestamp = timeEl?.getAttribute('datetime') ?? '';

  const photoEls = article.querySelectorAll<HTMLImageElement>(`${SELECTORS.TWEET_PHOTO} img`);
  const mediaUrls = Array.from(photoEls)
    .map(img => img.src)
    .filter(src => src && !src.includes('emoji'));

  return {
    tweetUrl,
    authorName,
    authorHandle,
    text,
    tweetTimestamp,
    mediaUrls,
    firstSeenAt: Date.now(),
  };
}

export function getTweetUrlFromArticle(article: HTMLElement): string | null {
  return resolveUrl(article)?.tweetUrl ?? null;
}
