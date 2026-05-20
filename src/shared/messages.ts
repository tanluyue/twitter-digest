import type { ChirpMessage } from '../types/models';

export function sendMessage(message: ChirpMessage): void {
  chrome.runtime.sendMessage(message).catch(() => {
    // Service worker may be waking up — message will be retried via buffer
  });
}

export class MessageBuffer {
  private buffer: ChirpMessage[] = [];
  private intervalId: number;

  constructor(intervalMs: number) {
    this.intervalId = window.setInterval(() => this.flush(), intervalMs);
    window.addEventListener('beforeunload', () => this.flush());
  }

  enqueue(msg: ChirpMessage) {
    this.buffer.push(msg);
  }

  private flush() {
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0);
    chrome.runtime.sendMessage({ type: 'BATCH', payload: batch } as ChirpMessage).catch(() => {
      this.buffer.unshift(...batch);
    });
  }

  destroy() {
    window.clearInterval(this.intervalId);
    this.flush();
  }
}
