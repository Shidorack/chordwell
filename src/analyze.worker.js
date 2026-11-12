// Runs the analysis off the main thread so the page stays smooth on phones.
import { analyze } from './analyze.js';

self.onmessage = e => {
  const { samples, sr, chart } = e.data;
  try {
    let last = 0;
    const result = analyze(samples, sr, p => {
      if (p - last > 0.02 || p === 1) { last = p; self.postMessage({ progress: p }); }
    }, { chart });
    self.postMessage({ result });
  } catch (err) {
    self.postMessage({ error: String(err && err.message || err) });
  }
};
