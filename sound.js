/*
 * sound.js — 効果音とBGM
 * 音声ファイルを使わず Web Audio API で音を合成する。
 * (素材の利用規約を気にしなくてよく、通信量もほぼゼロ)
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'casino-tutorial-muted';

  let ctx = null;
  let master = null;
  let bgmGain = null;
  let bgmTimer = null;
  let bgmName = 'none';
  let nextNoteTime = 0;
  let beatIndex = 0;
  let muted = readMuted();

  function readMuted() {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch (e) { return false; }
  }
  function writeMuted(v) {
    try { localStorage.setItem(STORAGE_KEY, v ? '1' : '0'); } catch (e) { /* 保存できなくても動作は続ける */ }
  }

  function ensureContext() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.8;
    master.connect(ctx.destination);
    bgmGain = ctx.createGain();
    bgmGain.gain.value = 0.18;
    bgmGain.connect(master);
    return ctx;
  }

  /** ユーザーのタップの中で呼ぶ(スマホは操作前の音の再生を制限するため) */
  function unlock() {
    const c = ensureContext();
    if (c && c.state === 'suspended') c.resume();
  }

  function tone(freq, start, dur, opts) {
    const o = opts || {};
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, start);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo, start + dur);
    const vol = o.vol == null ? 0.25 : o.vol;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + Math.min(0.015, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g);
    g.connect(o.out || master);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  function noise(start, dur, vol, filterFreq) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = filterFreq || 2500;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(start);
  }

  const SFX = {
    card(t) { noise(t, 0.09, 0.5, 3200); tone(900, t, 0.05, { type: 'triangle', vol: 0.05 }); },
    flip(t) { noise(t, 0.06, 0.4, 1800); noise(t + 0.07, 0.06, 0.35, 2600); },
    chip(t) { tone(2200, t, 0.06, { type: 'square', vol: 0.06 }); tone(2900, t + 0.05, 0.08, { type: 'square', vol: 0.05 }); },
    tap(t) { tone(880, t, 0.07, { type: 'sine', vol: 0.15 }); },
    correct(t) { tone(988, t, 0.1, { type: 'triangle' }); tone(1319, t + 0.09, 0.18, { type: 'triangle' }); },
    wrong(t) { tone(196, t, 0.22, { type: 'sawtooth', vol: 0.12 }); tone(185, t + 0.04, 0.22, { type: 'sawtooth', vol: 0.1 }); },
    win(t) { [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.09, 0.25, { type: 'triangle', vol: 0.2 })); },
    lose(t) { [392, 330, 262].forEach((f, i) => tone(f, t + i * 0.14, 0.3, { type: 'triangle', vol: 0.18 })); },
    spin(t) { for (let i = 0; i < 10; i++) tone(1200, t + i * 0.08 * (1 + i * 0.12), 0.03, { type: 'square', vol: 0.04 }); },
    page(t) { tone(660, t, 0.06, { type: 'sine', vol: 0.08 }); }
  };

  function sfx(name) {
    if (!name || name === 'none' || muted) return;
    const c = ensureContext();
    if (!c || c.state !== 'running' || !SFX[name]) return;
    SFX[name](c.currentTime + 0.01);
  }

  // ---- BGM(ゆっくりしたコード進行を自動で鳴らす) ----
  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
  const BGMS = {
    lounge: {
      bpm: 84,
      chords: [[62, 65, 69, 72], [55, 59, 62, 65], [60, 64, 67, 71], [57, 61, 64, 67]],
      bass: [38, 43, 36, 45],
      wave: 'triangle'
    },
    night: {
      bpm: 72,
      chords: [[57, 60, 64, 67], [53, 57, 60, 64], [50, 53, 57, 60], [52, 56, 59, 62]],
      bass: [45, 41, 38, 40],
      wave: 'sine'
    }
  };

  function scheduleBeat(def, time) {
    const beatsPerChord = 4;
    const beatDur = 60 / def.bpm;
    const chordIdx = Math.floor(beatIndex / beatsPerChord) % def.chords.length;
    const beatInBar = beatIndex % beatsPerChord;
    if (beatInBar === 0) {
      def.chords[chordIdx].forEach((n) => tone(midi(n), time, beatDur * beatsPerChord * 0.95, { type: def.wave, vol: 0.05, out: bgmGain }));
    }
    if (beatInBar === 0 || beatInBar === 2) {
      tone(midi(def.bass[chordIdx]), time, beatDur * 1.6, { type: 'sine', vol: 0.12, out: bgmGain });
    }
    // 軽いブラシ風の刻み
    if (beatInBar % 2 === 1) {
      const len = Math.floor(ctx.sampleRate * 0.05);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) * 0.25;
      const s = ctx.createBufferSource();
      const f = ctx.createBiquadFilter();
      f.type = 'highpass'; f.frequency.value = 5000;
      s.buffer = buf; s.connect(f); f.connect(bgmGain); s.start(time);
    }
  }

  function bgm(name) {
    stopBgm();
    bgmName = name || 'none';
    if (bgmName === 'none' || !BGMS[bgmName]) return;
    const c = ensureContext();
    if (!c) return;
    const def = BGMS[bgmName];
    beatIndex = 0;
    nextNoteTime = c.currentTime + 0.1;
    bgmTimer = setInterval(() => {
      if (c.state !== 'running') return;
      while (nextNoteTime < c.currentTime + 0.3) {
        scheduleBeat(def, nextNoteTime);
        nextNoteTime += 60 / def.bpm;
        beatIndex++;
      }
    }, 50);
  }

  function stopBgm() {
    if (bgmTimer) clearInterval(bgmTimer);
    bgmTimer = null;
  }

  function setMuted(v) {
    muted = !!v;
    writeMuted(muted);
    if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.8, ctx.currentTime, 0.05);
  }

  window.CasinoSound = {
    unlock,
    sfx,
    bgm,
    stopBgm,
    setMuted,
    isMuted: () => muted,
    SFX_NAMES: Object.keys(SFX),
    BGM_NAMES: Object.keys(BGMS)
  };
})();
