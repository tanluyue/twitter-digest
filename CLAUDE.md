# CLAUDE.md

## Project Overview

Chirp is a Chrome Extension (Manifest V3) that acts as a personal Twitter/X reading companion. It silently tracks reading behavior, translates English tweets to Chinese in real-time, and generates AI-powered daily reading digests.

## Tech Stack

- **Build**: Vite + @crxjs/vite-plugin (Chrome Extension bundling)
- **Language**: TypeScript (strict)
- **Storage**: IndexedDB via `idb` library (schema v2: tweets, interactions, digests, translations)
- **LLM**: Doubao API (豆包) at `ark.cn-beijing.volces.com`, model `doubao-1-5-pro-32k-250115`
- **UI isolation**: Shadow DOM for content script UI (FAB panel)

## Architecture

```
src/
├── background/          # Service worker (MV3)
│   ├── worker.ts        # Message router, entry point
│   ├── doubao-client.ts # Doubao API client (regular + SSE streaming)
│   ├── digest-generator.ts  # Daily digest: scores tweets → LLM → structured JSON
│   └── digest-scheduler.ts  # chrome.alarms for nightly digest
├── content/             # Content script injected into x.com
│   ├── index.ts         # Wiring: creates all modules, connects callbacks
│   ├── feed-observer.ts # MutationObserver + history monkey-patch for SPA nav
│   ├── visibility-tracker.ts  # IntersectionObserver for dwell time
│   ├── interaction-tracker.ts # Detects likes, bookmarks, click-into, follows
│   ├── tweet-extractor.ts     # DOM → TweetRecord
│   ├── translator.ts    # Inline translation with streaming chunks
│   ├── chirp-panel.ts   # FAB + tray UI (Shadow DOM)
│   └── digest-controller.ts   # In-memory tweet tracking for session
├── db/index.ts          # IndexedDB CRUD (idb wrapper)
├── shared/              # Shared between content + background
│   ├── constants.ts     # Selectors, config defaults, API key
│   ├── messages.ts      # MessageBuffer for batching chrome.runtime messages
│   └── scoring.ts       # Tweet engagement scoring formula
├── types/models.ts      # All TypeScript interfaces
├── sidepanel/           # Side panel (Today's Digest + Liked/Saved tabs)
└── popup/               # Extension popup
```

## Key Data Flows

1. **Tweet observation**: DOM → `feed-observer` → `TWEET_OBSERVED` + `INTERACTION_UPDATE` → IndexedDB
2. **Dwell tracking**: `IntersectionObserver` → accumulate time → `DWELL_UPDATE` on scroll-off → IndexedDB
3. **Translation**: tweet text → `TRANSLATE_REQUEST` → Doubao streaming → `TRANSLATE_CHUNK` → inline DOM injection
4. **Daily digest**: `GENERATE_DIGEST_NOW` → read all interactions+tweets for date → score → LLM → structured JSON → IndexedDB → side panel renders

## Commands

- `npm run dev` — dev mode with HMR
- `npm run build` — production build to `dist/`
- Load `dist/` as unpacked extension in `chrome://extensions`

## Important Patterns

- **MessageBuffer**: Content script batches messages every 10s to reduce chrome.runtime.sendMessage calls
- **Shadow DOM**: `chirp-panel.ts` uses closed Shadow DOM to avoid Twitter CSS conflicts
- **SPA navigation**: `history.pushState` is monkey-patched + `popstate` listened to detect Twitter navigation; `chirp:navigation` custom event is dispatched
- **Streaming SSE**: `callDoubaoStream` parses SSE `data:` lines manually from ReadableStream for translation and digest generation
- **Interaction records**: Every observed tweet immediately gets an interaction record (even with zero signals) so `getInteractionsByDate` returns ALL tweets seen that day

## Gotchas

- `chrome.sidePanel.open()` requires user gesture context — must be called synchronously in the message listener, not after async work
- `upsertTweet` only inserts if not existing (idempotent by URL) — tweet content is never updated after first observation
- Digest prompt explicitly requires ALL tweets to appear in output topics — without this constraint the LLM cherry-picks a few
