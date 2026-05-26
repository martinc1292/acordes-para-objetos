import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createMetronome, parseBPM } from './metronome.js';

describe('parseBPM', () => {
  it('extracts a BPM number from a free-form string', () => {
    assert.equal(parseBPM('120 BPM'), 120);
    assert.equal(parseBPM('76 BPM'), 76);
  });

  it('finds the first number in a longer label', () => {
    assert.equal(parseBPM('Medium swing ~140 BPM'), 140);
    assert.equal(parseBPM('Bossa nova ~140 BPM'), 140);
    assert.equal(parseBPM('120 BPM (balada pop)'), 120);
  });

  it('returns the default when the string has no number', () => {
    assert.equal(parseBPM('Slow'), 80);
    assert.equal(parseBPM(''), 80);
    assert.equal(parseBPM(null), 80);
    assert.equal(parseBPM(undefined), 80);
  });

  it('rejects values outside 20..300 and returns the default', () => {
    assert.equal(parseBPM('5 BPM'), 80);
    assert.equal(parseBPM('1000 BPM'), 80);
  });

  it('accepts a custom default', () => {
    assert.equal(parseBPM('', 100), 100);
    assert.equal(parseBPM('Slow', 100), 100);
  });
});

describe('createMetronome', () => {
  it('exposes default state before start', () => {
    const m = createMetronome({ bpm: 120, beatsPerBar: 4 });
    assert.equal(m.bpm, 120);
    assert.equal(m.beatsPerBar, 4);
    assert.equal(m.isRunning, false);
  });

  it('falls back to sensible defaults when no options are passed', () => {
    const m = createMetronome();
    assert.equal(m.bpm, 80);
    assert.equal(m.beatsPerBar, 4);
    assert.equal(m.isRunning, false);
  });

  it('calls onBeat with sequential 1..beatsPerBar values while running', () => {
    mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
    try {
      const beats = [];
      const m = createMetronome({
        bpm: 60,
        beatsPerBar: 4,
        onBeat: (beat) => beats.push(beat)
      });

      m.start();
      assert.deepEqual(beats, [1], 'first beat fires immediately on start');

      mock.timers.tick(1000);
      mock.timers.tick(1000);
      mock.timers.tick(1000);
      assert.deepEqual(beats, [1, 2, 3, 4]);

      mock.timers.tick(1000);
      assert.deepEqual(beats, [1, 2, 3, 4, 1], 'wraps back to 1 after a full bar');

      m.stop();
    } finally {
      mock.timers.reset();
    }
  });

  it('respects beatsPerBar=3 (waltz)', () => {
    mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
    try {
      const beats = [];
      const m = createMetronome({
        bpm: 60,
        beatsPerBar: 3,
        onBeat: (beat) => beats.push(beat)
      });
      m.start();
      mock.timers.tick(1000);
      mock.timers.tick(1000);
      mock.timers.tick(1000);
      assert.deepEqual(beats, [1, 2, 3, 1]);
      m.stop();
    } finally {
      mock.timers.reset();
    }
  });

  it('setBPM changes the interval immediately while running', () => {
    mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
    try {
      const beats = [];
      const m = createMetronome({
        bpm: 60,
        beatsPerBar: 4,
        onBeat: (beat) => beats.push(beat)
      });
      m.start();
      assert.equal(beats.length, 1);

      m.setBPM(120);
      assert.equal(m.bpm, 120);

      mock.timers.tick(500);
      assert.equal(beats.length, 2);

      mock.timers.tick(500);
      assert.equal(beats.length, 3);

      m.stop();
    } finally {
      mock.timers.reset();
    }
  });

  it('setBPM clamps to 20..300', () => {
    const m = createMetronome({ bpm: 100 });
    m.setBPM(5);
    assert.equal(m.bpm, 20);
    m.setBPM(1000);
    assert.equal(m.bpm, 300);
    m.setBPM(85.4);
    assert.equal(m.bpm, 85);
  });

  it('stop halts further onBeat callbacks', () => {
    mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
    try {
      const beats = [];
      const m = createMetronome({
        bpm: 60,
        onBeat: (beat) => beats.push(beat)
      });
      m.start();
      mock.timers.tick(1000);
      m.stop();
      assert.equal(m.isRunning, false);
      mock.timers.tick(5000);
      assert.deepEqual(beats, [1, 2]);
    } finally {
      mock.timers.reset();
    }
  });

  it('calling start twice does not double up callbacks', () => {
    mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
    try {
      const beats = [];
      const m = createMetronome({
        bpm: 60,
        onBeat: (beat) => beats.push(beat)
      });
      m.start();
      m.start();
      mock.timers.tick(1000);
      assert.deepEqual(beats, [1, 2]);
      m.stop();
    } finally {
      mock.timers.reset();
    }
  });

  it('does not initialise Web Audio in environments without it', () => {
    assert.equal(typeof globalThis.AudioContext, 'undefined');
    const m = createMetronome({ bpm: 80 });
    assert.doesNotThrow(() => m.start());
    m.stop();
  });
});
