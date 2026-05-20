import { SELECTORS, CHIRP_TRANSLATION_CLASS } from '../shared/constants';
import type { TranslationRecord } from '../types/models';

const ATTR_ORIGINAL = 'data-chirp-original';
const ATTR_TRANSLATED = 'data-chirp-translated';
const ATTR_SHOWING = 'data-chirp-showing';

interface CacheEntry {
  original: string;
  translated: string;
}

export class Translator {
  private memoryCache = new Map<string, CacheEntry>();
  private pendingRequests = new Set<string>();
  private enabled = true;
  private articleMap = new Map<string, HTMLElement>();

  constructor() {
    document.addEventListener('click', (e) => {
      const badge = (e.target as HTMLElement).closest(`.${CHIRP_TRANSLATION_CLASS}`);
      if (!badge) return;
      const textEl = badge.closest(`[${ATTR_SHOWING}]`);
      if (!textEl) return;
      this.toggleTranslation(textEl as HTMLElement);
    }, true);

    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'TRANSLATE_CHUNK') {
        const { tweetUrl, text, done } = message.payload;
        this.handleChunk(tweetUrl, text, done);
      }
    });
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    document.querySelectorAll<HTMLElement>(`[${ATTR_SHOWING}]`).forEach(el => {
      if (enabled) {
        this.showTranslated(el);
      } else {
        this.showOriginal(el);
      }
    });
  }

  isEnabled() { return this.enabled; }

  async translateTweet(tweetUrl: string, text: string, article: HTMLElement) {
    if (!this.enabled) return;
    if (!text.trim()) return;

    this.articleMap.set(tweetUrl, article);

    const cached = this.memoryCache.get(tweetUrl);
    if (cached) {
      if (text.length <= cached.original.length + 10) {
        this.applyTranslation(article, cached.original, cached.translated);
        return;
      }
      this.memoryCache.delete(tweetUrl);
    }

    if (this.pendingRequests.has(tweetUrl)) return;
    this.pendingRequests.add(tweetUrl);

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'TRANSLATE_REQUEST',
        payload: { tweetUrl, text },
      }) as TranslationRecord | { error: string } | { streaming: boolean };

      if ('error' in response) {
        this.pendingRequests.delete(tweetUrl);
        return;
      }

      if ('streaming' in response) {
        this.applyTranslation(article, text, '...');
        return;
      }

      this.memoryCache.set(tweetUrl, { original: text, translated: response.translatedText });
      this.applyTranslation(article, text, response.translatedText);
      this.pendingRequests.delete(tweetUrl);
    } catch {
      this.pendingRequests.delete(tweetUrl);
    }
  }

  private handleChunk(tweetUrl: string, text: string, done: boolean) {
    const article = this.articleMap.get(tweetUrl);
    if (!article) return;

    if (done) {
      this.pendingRequests.delete(tweetUrl);
      if (text) {
        const textEl = article.querySelector(SELECTORS.TWEET_TEXT) as HTMLElement | null;
        const originalText = textEl?.getAttribute(ATTR_ORIGINAL) ?? '';
        this.memoryCache.set(tweetUrl, { original: originalText, translated: text });
        this.updateStreamingText(article, text, true);
      }
      return;
    }

    if (text) {
      this.updateStreamingText(article, text, false);
    }
  }

  private updateStreamingText(article: HTMLElement, text: string, done: boolean) {
    const textEl = article.querySelector(SELECTORS.TWEET_TEXT) as HTMLElement | null;
    if (!textEl) return;

    const translationSpan = textEl.querySelector('span:first-child');
    if (translationSpan) {
      translationSpan.textContent = text + (done ? '' : ' ▍');
    }
    textEl.setAttribute(ATTR_TRANSLATED, text);
  }

  reapplyFromCache(tweetUrl: string, article: HTMLElement) {
    if (!this.enabled) return;
    const textEl = article.querySelector(SELECTORS.TWEET_TEXT) as HTMLElement | null;
    if (!textEl) return;

    const hasBadge = textEl.querySelector(`.${CHIRP_TRANSLATION_CLASS}`);
    if (hasBadge) return;

    const currentText = textEl.textContent?.trim() ?? '';
    if (!currentText) return;

    const cached = this.memoryCache.get(tweetUrl);
    if (cached && currentText.length <= cached.original.length + 10) {
      this.applyTranslation(article, cached.original, cached.translated);
    } else if (currentText) {
      this.memoryCache.delete(tweetUrl);
      this.translateTweet(tweetUrl, currentText, article);
    }
  }

  private applyTranslation(article: HTMLElement, originalText: string, translatedText: string) {
    const textEl = article.querySelector(SELECTORS.TWEET_TEXT) as HTMLElement | null;
    if (!textEl) return;

    textEl.setAttribute(ATTR_ORIGINAL, originalText);
    textEl.setAttribute(ATTR_TRANSLATED, translatedText);
    textEl.setAttribute(ATTR_SHOWING, 'translated');
    this.renderTranslated(textEl, translatedText);
  }

  private renderTranslated(textEl: HTMLElement, translatedText: string) {
    textEl.innerHTML = '';

    const translationSpan = document.createElement('span');
    translationSpan.textContent = translatedText;

    const badge = document.createElement('span');
    badge.className = CHIRP_TRANSLATION_CLASS;
    badge.textContent = 'CN';
    badge.title = 'Click to show original';
    badge.style.cssText = `
      display: inline-block;
      margin-left: 6px;
      padding: 1px 6px;
      font-size: 11px;
      font-weight: 600;
      color: #1d9bf0;
      background: rgba(29, 155, 240, 0.12);
      border-radius: 4px;
      cursor: pointer;
      vertical-align: middle;
      user-select: none;
    `;

    textEl.appendChild(translationSpan);
    textEl.appendChild(badge);
  }

  private renderOriginal(textEl: HTMLElement, originalText: string) {
    textEl.innerHTML = '';

    const originalSpan = document.createElement('span');
    originalSpan.textContent = originalText;

    const badge = document.createElement('span');
    badge.className = CHIRP_TRANSLATION_CLASS;
    badge.textContent = 'EN';
    badge.title = 'Click to show translation';
    badge.style.cssText = `
      display: inline-block;
      margin-left: 6px;
      padding: 1px 6px;
      font-size: 11px;
      font-weight: 600;
      color: #71767b;
      background: rgba(113, 118, 123, 0.12);
      border-radius: 4px;
      cursor: pointer;
      vertical-align: middle;
      user-select: none;
    `;

    textEl.appendChild(originalSpan);
    textEl.appendChild(badge);
  }

  private toggleTranslation(textEl: HTMLElement) {
    const showing = textEl.getAttribute(ATTR_SHOWING);
    const original = textEl.getAttribute(ATTR_ORIGINAL) ?? '';
    const translated = textEl.getAttribute(ATTR_TRANSLATED) ?? '';

    if (showing === 'translated') {
      textEl.setAttribute(ATTR_SHOWING, 'original');
      this.renderOriginal(textEl, original);
    } else {
      textEl.setAttribute(ATTR_SHOWING, 'translated');
      this.renderTranslated(textEl, translated);
    }
  }

  private showTranslated(el: HTMLElement) {
    const translated = el.getAttribute(ATTR_TRANSLATED) ?? '';
    if (translated) {
      el.setAttribute(ATTR_SHOWING, 'translated');
      this.renderTranslated(el, translated);
    }
  }

  private showOriginal(el: HTMLElement) {
    const original = el.getAttribute(ATTR_ORIGINAL) ?? '';
    if (original) {
      el.setAttribute(ATTR_SHOWING, 'original');
      this.renderOriginal(el, original);
    }
  }
}
