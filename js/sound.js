// Töne werden erzeugt, nicht geladen: keine Dateien, funktioniert offline.

let ctx = null;
let enabled = true;

export function setSound(on) {
  enabled = on;
}

export function unlock() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      ctx = null;
    }
  }
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

function out(gain = 0.3) {
  const g = ctx.createGain();
  g.gain.value = gain;
  g.connect(ctx.destination);
  return g;
}

function noise(dur, freq, q, gain, t0 = 0) {
  const t = ctx.currentTime + t0;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = out(gain);
  src.connect(f).connect(g);
  src.start(t);
}

function tone(freq, dur, type, gain, t0 = 0, slideTo = null) {
  const t = ctx.currentTime + t0;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = out(0);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g);
  o.start(t);
  o.stop(t + dur + 0.05);
}

const SOUNDS = {
  card: () => noise(0.06, 2400, 1.2, 0.5),
  collect: () => {
    noise(0.18, 900, 0.8, 0.35);
    noise(0.12, 1600, 1, 0.2, 0.06);
  },
  select: () => tone(880, 0.06, 'sine', 0.08),
  bid: () => tone(520, 0.12, 'triangle', 0.15),
  pass: () => tone(300, 0.15, 'triangle', 0.12),
  kontra: () => {
    noise(0.2, 120, 0.7, 1.2);
    tone(90, 0.25, 'sine', 0.5);
  },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.28, 'triangle', 0.18, i * 0.11)),
  lose: () => {
    tone(392, 0.35, 'sawtooth', 0.07, 0, 370);
    tone(370, 0.35, 'sawtooth', 0.07, 0.35, 349);
    tone(349, 0.8, 'sawtooth', 0.07, 0.7, 300);
  },
  deal: () => {
    for (let i = 0; i < 6; i++) noise(0.04, 2800, 1.5, 0.25, i * 0.05);
  },
};

export function play(name) {
  if (!enabled || !ctx) return;
  try {
    SOUNDS[name] && SOUNDS[name]();
  } catch {
    /* Ton ist Nebensache */
  }
}
