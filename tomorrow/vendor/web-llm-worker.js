/*
 * web-llm-worker.js — the model runs here, not on the page's thread.
 *
 * Generating a token is arithmetic on a few hundred million parameters, and on
 * the main thread that means the interface stops answering: the stop button
 * cannot be clicked, the spinner does not spin, and the tab is reported as
 * unresponsive by the browser while it is in fact working perfectly.
 *
 * A worker of our own, from a file on this origin, is also what keeps
 * `worker-src 'self'` sufficient. The library can create its own worker from a
 * blob URL, which would need `worker-src blob:` — a broader grant on an origin
 * that holds the neighbouring app's API keys, for no gain.
 */

import { WebWorkerMLCEngineHandler } from './web-llm.js';

const handler = new WebWorkerMLCEngineHandler();

self.onmessage = (event) => {
  handler.onmessage(event);
};
