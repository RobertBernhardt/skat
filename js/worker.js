// Rechnet die Züge der Computer im Hintergrund, damit die Oberfläche nie einfriert.
import { decide } from './ai.js';

self.onmessage = (e) => {
  const { id, view, level, risk } = e.data;
  let decision = null;
  let error = null;
  try {
    decision = decide(view, level, risk);
  } catch (err) {
    error = String(err && err.stack ? err.stack : err);
  }
  self.postMessage({ id, decision, error });
};
