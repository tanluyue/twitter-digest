import { MessageBuffer } from '../shared/messages';
import { MESSAGE_BUFFER_INTERVAL_MS } from '../shared/constants';
import { VisibilityTracker } from './visibility-tracker';
import { InteractionTracker } from './interaction-tracker';
import { FeedObserver } from './feed-observer';
import { Translator } from './translator';
import { ChirpPanel } from './chirp-panel';
import { DigestController } from './digest-controller';

function shouldActivate(): boolean {
  const path = location.pathname;
  return path === '/home'
    || path === '/search'
    || path.startsWith('/i/')
    || /^\/\w+\/status\//.test(path)
    || /^\/\w+$/.test(path);
}

if (shouldActivate()) {
  const buffer = new MessageBuffer(MESSAGE_BUFFER_INTERVAL_MS);
  const translator = new Translator();
  const visibility = new VisibilityTracker(buffer);
  const interactions = new InteractionTracker(buffer);
  const panel = new ChirpPanel(translator);
  const digestController = new DigestController(panel);

  const feed = new FeedObserver(visibility, buffer, translator);

  feed.onTweetObserved((tweet) => {
    digestController.onTweetObserved(tweet);
  });

  interactions.onInteraction((type, tweetUrl) => {
    panel.handleInteraction(type);
    digestController.onInteraction(type, tweetUrl);
  });

  feed.start();
  console.log('[Chirp] Content script activated');
}
