// Metrónomo singleton — Web Audio API, tap-tempo, parseo de tempo desde string

let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function clickBeat(ctx, time) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0.35, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
  osc.start(time);
  osc.stop(time + 0.05);
}

// Estado global único
const state = {
  bpm: 80,
  running: false,
  intervalId: null,
  nextBeatTime: 0,
  tapTimes: [],
  onChange: null, // callback para que la UI se actualice
};

export function parseTempo(tempoStr) {
  if (!tempoStr) return 80;
  const match = String(tempoStr).match(/\d+/);
  const bpm = match ? parseInt(match[0], 10) : 80;
  if (bpm >= 20 && bpm <= 300) return bpm;
  return 80;
}

export function getBpm() {
  return state.bpm;
}

export function setBpm(bpm) {
  const clamped = Math.max(20, Math.min(300, Math.round(bpm)));
  state.bpm = clamped;
  if (state.running) {
    stop();
    start();
  }
  state.onChange?.(clamped);
}

export function isRunning() {
  return state.running;
}

export function start() {
  if (state.running) return;
  const ctx = getAudioCtx();
  if (ctx.state === 'suspended') ctx.resume();
  state.running = true;
  state.nextBeatTime = ctx.currentTime;

  state.intervalId = setInterval(() => {
    const ctx = getAudioCtx();
    // Programa beats con lookahead de 100ms para evitar glitches
    while (state.nextBeatTime < ctx.currentTime + 0.1) {
      clickBeat(ctx, state.nextBeatTime);
      state.nextBeatTime += 60 / state.bpm;
    }
  }, 25);

  state.onChange?.(state.bpm);
}

export function stop() {
  if (!state.running) return;
  clearInterval(state.intervalId);
  state.intervalId = null;
  state.running = false;
  state.onChange?.(state.bpm);
}

export function toggle() {
  state.running ? stop() : start();
}

export function tap() {
  const now = Date.now();
  state.tapTimes.push(now);

  // Solo usar los últimos 8 taps
  if (state.tapTimes.length > 8) state.tapTimes.shift();

  if (state.tapTimes.length < 2) return state.bpm;

  const intervals = [];
  for (let i = 1; i < state.tapTimes.length; i++) {
    intervals.push(state.tapTimes[i] - state.tapTimes[i - 1]);
  }
  const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const newBpm = Math.round(60000 / avgMs);
  setBpm(newBpm);
  return state.bpm;
}

export function resetTaps() {
  state.tapTimes = [];
}

// La UI se suscribe para recibir actualizaciones cuando cambia BPM o estado
export function onMetronomeChange(cb) {
  state.onChange = cb;
}
