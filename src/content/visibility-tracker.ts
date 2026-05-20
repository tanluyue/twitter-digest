import { DWELL_VISIBILITY_THRESHOLD } from '../shared/constants';
import type { MessageBuffer } from '../shared/messages';
import { getTweetUrlFromArticle } from './tweet-extractor';

interface DwellEntry {
  element: HTMLElement;
  tweetUrl: string;
  entryTime: number | null;
  accumulatedMs: number;
}

const LONG_DWELL_THRESHOLD_MS = 5000;
const DWELL_CHECK_INTERVAL_MS = 2000;

export type LongDwellCallback = (tweetUrl: string, dwellMs: number) => void;

export class VisibilityTracker {
  private observer: IntersectionObserver;
  private tracking = new Map<string, DwellEntry>();
  private dwellHistory = new Map<string, number>();
  private elementToUrl = new WeakMap<Element, string>();
  private buffer: MessageBuffer;
  private longDwellCallbacks: LongDwellCallback[] = [];
  private notifiedLongDwell = new Set<string>();
  private dwellCheckInterval: ReturnType<typeof setInterval>;

  constructor(buffer: MessageBuffer) {
    this.buffer = buffer;
    this.observer = new IntersectionObserver(
      entries => this.handleIntersections(entries),
      { root: null, threshold: DWELL_VISIBILITY_THRESHOLD }
    );
    this.dwellCheckInterval = setInterval(() => this.checkLongDwells(), DWELL_CHECK_INTERVAL_MS);
  }

  onLongDwell(cb: LongDwellCallback) {
    this.longDwellCallbacks.push(cb);
  }

  private checkLongDwells() {
    const now = Date.now();
    for (const [url, entry] of this.tracking) {
      if (this.notifiedLongDwell.has(url)) continue;
      let total = entry.accumulatedMs;
      if (entry.entryTime !== null) {
        total += now - entry.entryTime;
      }
      if (total >= LONG_DWELL_THRESHOLD_MS) {
        this.notifiedLongDwell.add(url);
        for (const cb of this.longDwellCallbacks) cb(url, total);
      }
    }
  }

  track(tweetUrl: string, element: HTMLElement) {
    this.tracking.set(tweetUrl, {
      element,
      tweetUrl,
      entryTime: null,
      accumulatedMs: 0,
    });
    this.elementToUrl.set(element, tweetUrl);
    this.observer.observe(element);
  }

  untrack(tweetUrl: string) {
    const entry = this.tracking.get(tweetUrl);
    if (!entry) return;

    if (entry.entryTime !== null) {
      entry.accumulatedMs += Date.now() - entry.entryTime;
    }

    if (entry.accumulatedMs > 0) {
      this.buffer.enqueue({
        type: 'DWELL_UPDATE',
        payload: { tweetUrl, dwellMs: entry.accumulatedMs },
      });
      const prev = this.dwellHistory.get(tweetUrl) ?? 0;
      if (entry.accumulatedMs > prev) {
        this.dwellHistory.set(tweetUrl, entry.accumulatedMs);
      }
    }

    this.observer.unobserve(entry.element);
    this.tracking.delete(tweetUrl);
  }

  getCurrentDwells(): Map<string, number> {
    const now = Date.now();
    const result = new Map(this.dwellHistory);
    for (const [url, entry] of this.tracking) {
      let total = entry.accumulatedMs;
      if (entry.entryTime !== null) {
        total += now - entry.entryTime;
      }
      if (total > 0) {
        const prev = result.get(url) ?? 0;
        result.set(url, Math.max(prev, total));
      }
    }
    return result;
  }

  getCurrentlyVisible(): Set<string> {
    const visible = new Set<string>();
    for (const [url, entry] of this.tracking) {
      if (entry.entryTime !== null) {
        visible.add(url);
      }
    }
    return visible;
  }

  getUrlForElement(element: Element): string | undefined {
    return this.elementToUrl.get(element);
  }

  updateElementMapping(element: HTMLElement, newUrl: string) {
    this.elementToUrl.set(element, newUrl);
  }

  private handleIntersections(entries: IntersectionObserverEntry[]) {
    const now = Date.now();
    for (const entry of entries) {
      const tweetUrl = this.elementToUrl.get(entry.target);
      if (!tweetUrl) continue;
      const dwellEntry = this.tracking.get(tweetUrl);
      if (!dwellEntry) continue;

      if (entry.isIntersecting) {
        dwellEntry.entryTime = now;
      } else if (dwellEntry.entryTime !== null) {
        dwellEntry.accumulatedMs += now - dwellEntry.entryTime;
        dwellEntry.entryTime = null;
      }
    }
  }

  destroy() {
    clearInterval(this.dwellCheckInterval);
    this.observer.disconnect();
    for (const [url] of this.tracking) {
      this.untrack(url);
    }
  }
}
