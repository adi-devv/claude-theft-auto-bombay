import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAudio } from '../../src/audio/audio.js';
import { mulberry32 } from '../../src/audio/radio.js';

function fakeBus() {
  const h = new Map();
  return {
    on(evt, fn) { if (!h.has(evt)) h.set(evt, []); h.get(evt).push(fn); },
    emit(evt, p) { for (const fn of h.get(evt) || []) fn(p); },
    count: (evt) => (h.get(evt) || []).length,
  };
}

test('no AudioContext exists in node', () => {
  assert.equal(typeof globalThis.AudioContext, 'undefined');
});

test('every method before unlock is a silent no-op', () => {
  const bus = fakeBus();
  const a = createAudio(bus);
  assert.equal(a.ready, false);
  assert.doesNotThrow(() => {
    a.update(0.016, { x: 0, z: 0 });
    a.engine('car', 10, 0.5);
    a.engine('auto', 5, 1);
    a.engine(null, 0, 0);
    a.horn();
    a.horn({ x: 1, z: 1 });
    a.siren(true);
    a.siren(false);
    a.crash(0.7);
    a.coin();
    a.fail();
    a.success();
    a.setVolume(0.5);
    a.toggleMute();
    a.toggleMute();
  });
  assert.doesNotThrow(() => {
    bus.emit('horn', { pos: { x: 3, z: 3 }, source: 'player' });
    bus.emit('horn', { pos: { x: 300, z: 3 }, source: 'npc' });
    bus.emit('vehicle:damaged', { impact: 0.8 });
    bus.emit('money:change', { delta: 50 });
    bus.emit('money:change', { delta: -5 });
    bus.emit('mission:complete', {});
    bus.emit('mission:fail', {});
  });
  assert.equal(a.ready, false);
});

test('subscribes to the contract events', () => {
  const bus = fakeBus();
  createAudio(bus);
  for (const e of ['horn', 'vehicle:damaged', 'money:change', 'mission:complete', 'mission:fail']) {
    assert.ok(bus.count(e) >= 1, e);
  }
});

test('unlock without AudioContext does not throw and leaves ready false', () => {
  const a = createAudio(fakeBus());
  assert.doesNotThrow(() => a.unlock());
  assert.doesNotThrow(() => a.unlock());
  assert.equal(a.ready, false);
});

test('works with a missing bus', () => {
  assert.doesNotThrow(() => createAudio(null).coin());
  assert.doesNotThrow(() => createAudio().unlock());
});

test('radioNext cycles Off -> Bombay Beats -> Filmi FM -> Off', () => {
  const a = createAudio(fakeBus());
  assert.equal(a.radioNext(), 'Bombay Beats');
  assert.equal(a.radioNext(), 'Filmi FM');
  assert.equal(a.radioNext(), 'Off');
  assert.equal(a.radioNext(), 'Bombay Beats');
});

test('toggleMute returns booleans', () => {
  const a = createAudio(fakeBus());
  assert.equal(a.toggleMute(), true);
  assert.equal(a.toggleMute(), false);
});

test('mulberry32 is deterministic and in [0,1)', () => {
  const r1 = mulberry32(42);
  const r2 = mulberry32(42);
  for (let i = 0; i < 100; i++) {
    const v = r1();
    assert.equal(v, r2());
    assert.ok(v >= 0 && v < 1);
  }
});
