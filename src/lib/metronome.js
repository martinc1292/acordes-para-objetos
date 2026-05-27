const MIN_BPM = 20;
const MAX_BPM = 300;
const DEFAULT_BPM = 80;

function clampBPM(value) {
  const rounded = Math.round(value);
  if (Number.isNaN(rounded)) return DEFAULT_BPM;
  return Math.max(MIN_BPM, Math.min(MAX_BPM, rounded));
}

export function parseBPM(input, fallback = DEFAULT_BPM) {
  if (typeof input !== 'string') return fallback;
  const match = input.match(/\d+/);
  if (!match) return fallback;
  const value = parseInt(match[0], 10);
  if (value < MIN_BPM || value > MAX_BPM) return fallback;
  return value;
}

function getAudioContextCtor() {
  if (typeof globalThis === 'undefined') return null;
  return globalThis.AudioContext || globalThis.webkitAudioContext || null;
}

function playClick(audioCtx, accent) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const now = audioCtx.currentTime;
  osc.frequency.value = accent ? 1320 : 880;
  gain.gain.setValueAtTime(accent ? 0.5 : 0.35, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.05);
}

export function createMetronome(options = {}) {
  const {
    bpm: initialBpm = DEFAULT_BPM,
    beatsPerBar = 4,
    onBeat = null
  } = options;

  let currentBPM = clampBPM(initialBpm);
  let currentBeat = 0;
  let intervalId = null;
  let audioCtx = null;

  function intervalMs() {
    return 60_000 / currentBPM;
  }

  function tick() {
    currentBeat = (currentBeat % beatsPerBar) + 1;
    if (audioCtx) {
      try {
        playClick(audioCtx, currentBeat === 1);
      } catch {
        // Audio failure should not stop the metronome
      }
    }
    if (typeof onBeat === 'function') {
      onBeat(currentBeat);
    }
  }

  function startInterval() {
    intervalId = setInterval(tick, intervalMs());
  }

  function stopInterval() {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  function start() {
    if (intervalId !== null) return;
    const Ctor = getAudioContextCtor();
    if (Ctor && !audioCtx) {
      try {
        audioCtx = new Ctor();
      } catch {
        audioCtx = null;
      }
    }
    currentBeat = 0;
    tick();
    startInterval();
  }

  function stop() {
    stopInterval();
    currentBeat = 0;
  }

  function setBPM(value) {
    currentBPM = clampBPM(value);
    if (intervalId !== null) {
      stopInterval();
      startInterval();
    }
  }

  return {
    start,
    stop,
    setBPM,
    get bpm() {
      return currentBPM;
    },
    get beatsPerBar() {
      return beatsPerBar;
    },
    get isRunning() {
      return intervalId !== null;
    }
  };
}
