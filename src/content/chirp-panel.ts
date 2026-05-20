import type { InteractionType } from './interaction-tracker';
import type { Translator } from './translator';

const BIRD_SVG = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#1d9bf0" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
  <path d="M18 4c-1 1.5-3 2.5-5 2.5C11 6.5 9.5 5 8 4c-1 2 0 4 1.5 5.5C7 9.5 5 9 3.5 8c0 2 1.5 4 4 4.5C6 13 4.5 13.5 3 13.5c1.5 1.5 4 2.5 6.5 2.5 5 0 9-4 9-9.5"/>
  <circle cx="13" cy="7" r="0.8" fill="#1d9bf0" stroke="none"/>
</svg>`;

const STYLES = `
  :host {
    all: initial;
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 999999;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .chirp-fab {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(0, 0, 0, 0.08);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 12px rgba(0,0,0,0.1);
    transition: transform 0.2s, box-shadow 0.2s;
    position: relative;
  }
  .chirp-fab:hover {
    transform: scale(1.08);
    box-shadow: 0 4px 20px rgba(0,0,0,0.15);
  }

  .tray {
    position: absolute;
    bottom: 52px;
    right: 0;
    width: 280px;
    background: rgba(255, 255, 255, 0.96);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(0, 0, 0, 0.06);
    border-radius: 14px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.1);
    padding: 10px 12px;
    opacity: 0;
    transform: translateY(8px) scale(0.95);
    transition: opacity 0.2s ease, transform 0.2s ease;
    pointer-events: none;
  }
  .tray.open {
    opacity: 1;
    transform: translateY(0) scale(1);
    pointer-events: auto;
  }

  .tray-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .stats-text { font-size: 10px; color: #9ca3af; }
  .stats-text .val { color: #1d9bf0; font-weight: 600; }

  .actions-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 8px;
  }

  .digest-link {
    font-size: 11px;
    color: #1d9bf0;
    background: #eff6ff;
    border: 1px solid rgba(29, 155, 240, 0.15);
    border-radius: 10px;
    cursor: pointer;
    padding: 4px 10px;
    font-family: inherit;
    font-weight: 500;
    transition: background 0.15s;
  }
  .digest-link:hover { background: #dbeafe; }

  .toggle-row { display: flex; align-items: center; gap: 5px; }
  .toggle-label { font-size: 10px; color: #9ca3af; }
  .toggle-switch {
    width: 26px;
    height: 14px;
    background: #d1d5db;
    border-radius: 7px;
    position: relative;
    cursor: pointer;
    transition: background 0.2s;
    border: none;
    padding: 0;
  }
  .toggle-switch.on { background: #1d9bf0; }
  .toggle-switch::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 10px;
    height: 10px;
    background: white;
    border-radius: 50%;
    transition: transform 0.2s;
  }
  .toggle-switch.on::after { transform: translateX(12px); }
`;

export class ChirpPanel {
  private shadow: ShadowRoot;
  private host: HTMLElement;
  private fab: HTMLElement;
  private tray: HTMLElement;
  private _isTrayOpen = false;
  private counts = { tweetsRead: 0, liked: 0, bookmarked: 0 };
  private translator: Translator;

  constructor(translator: Translator) {
    this.translator = translator;

    this.host = document.createElement('div');
    this.host.id = 'chirp-panel-host';
    this.shadow = this.host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = STYLES;
    this.shadow.appendChild(style);

    const container = document.createElement('div');

    this.fab = document.createElement('button');
    this.fab.className = 'chirp-fab';
    this.fab.innerHTML = BIRD_SVG;

    this.tray = document.createElement('div');
    this.tray.className = 'tray';
    this.tray.innerHTML = `
      <div class="tray-row">
        <span class="stats-text" id="stats-text">
          <span class="val" id="s-read">0</span> read ·
          <span class="val" id="s-liked">0</span> liked ·
          <span class="val" id="s-saved">0</span> saved
        </span>
      </div>
      <div class="actions-row">
        <button class="digest-link" id="btn-digest">Today's Digest</button>
        <div class="toggle-row">
          <span class="toggle-label">译</span>
          <button class="toggle-switch on" id="t-translate"></button>
        </div>
      </div>
    `;

    container.appendChild(this.tray);
    container.appendChild(this.fab);
    this.shadow.appendChild(container);
    document.body.appendChild(this.host);

    this.bindEvents();
    this.loadInitialStats();
  }

  private bindEvents() {
    this.fab.addEventListener('click', () => this.toggleTray());

    this.shadow.getElementById('btn-digest')!.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' });
      this.closeTray();
    });

    const translateToggle = this.shadow.getElementById('t-translate')!;
    translateToggle.addEventListener('click', () => {
      const isOn = translateToggle.classList.toggle('on');
      this.translator.setEnabled(isOn);
    });

    document.addEventListener('click', (e) => {
      if (this._isTrayOpen && !this.host.contains(e.target as Node)) {
        this.closeTray();
      }
    });
  }

  private async loadInitialStats() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_TODAY_STATS' });
      if (response && !('error' in response)) {
        this.counts.tweetsRead = response.tweetsRead ?? 0;
        this.counts.liked = response.liked ?? 0;
        this.counts.bookmarked = response.bookmarked ?? 0;
        this.updateStats();
      }
    } catch {}
  }

  private updateStats() {
    const readEl = this.shadow.getElementById('s-read');
    const likedEl = this.shadow.getElementById('s-liked');
    const savedEl = this.shadow.getElementById('s-saved');
    if (readEl) readEl.textContent = String(this.counts.tweetsRead);
    if (likedEl) likedEl.textContent = String(this.counts.liked);
    if (savedEl) savedEl.textContent = String(this.counts.bookmarked);
  }

  private toggleTray() {
    if (this._isTrayOpen) this.closeTray();
    else this.openTray();
  }

  private openTray() {
    this._isTrayOpen = true;
    this.tray.classList.add('open');
  }

  private closeTray() {
    this._isTrayOpen = false;
    this.tray.classList.remove('open');
  }

  handleInteraction(type: InteractionType) {
    if (type === 'liked') this.counts.liked++;
    if (type === 'bookmarked') this.counts.bookmarked++;
    this.updateStats();
  }

  setTweetCount(n: number) {
    this.counts.tweetsRead = n;
    this.updateStats();
  }
}
