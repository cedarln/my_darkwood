/* 暗林 · 幸存夜 — 合成音效（无外部素材） */
(function (global) {
  'use strict';
  var DW = global.DW;
  var sfx = DW.sfx = { on: true, ctx: null, master: null };
  var noiseBuf = null;

  function ac() {
    if (!sfx.ctx) {
      try {
        var C = global.AudioContext || global.webkitAudioContext;
        if (!C) { sfx.on = false; return null; }
        sfx.ctx = new C();
        sfx.master = sfx.ctx.createGain();
        sfx.master.gain.value = 0.5;
        sfx.master.connect(sfx.ctx.destination);
      } catch (e) { sfx.on = false; return null; }
    }
    if (sfx.ctx.state === 'suspended' && sfx.ctx.resume) sfx.ctx.resume();
    return sfx.ctx;
  }
  // 给配乐模块用：建/唤醒上下文，不看音效开关
  sfx.ensure = ac;
  sfx.unlock = function () { return ac(); };

  // 切后台就把整个上下文挂起：否则手机上的玩家在菜单外还听见心跳
  if (global.document && global.document.addEventListener) {
    global.document.addEventListener('visibilitychange', function () {
      if (!sfx.ctx) return;
      try {
        if (global.document.hidden) { if (sfx.ctx.suspend) sfx.ctx.suspend(); }
        else if (sfx.on || (DW.music && DW.music.on)) { if (sfx.ctx.resume) sfx.ctx.resume(); }
      } catch (e) { /* 忽略 */ }
    });
  }

  function noise(c, dur, type, freq, q, gain, sweepTo) {
    var src = c.createBufferSource();
    src.buffer = noiseBuffer(c);
    var f = c.createBiquadFilter();
    f.type = type || 'bandpass';
    f.frequency.value = freq || 800;
    f.Q.value = q || 1;
    var g = c.createGain();
    g.gain.setValueAtTime(gain || 0.3, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, c.currentTime + dur);
    src.connect(f); f.connect(g); g.connect(sfx.master);
    src.start(); src.stop(c.currentTime + dur);
  }
  function tone(c, dur, f0, f1, gain, type) {
    var o = c.createOscillator();
    o.type = type || 'square';
    o.frequency.setValueAtTime(f0, c.currentTime);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), c.currentTime + dur);
    var g = c.createGain();
    g.gain.setValueAtTime(gain || 0.18, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.connect(g); g.connect(sfx.master);
    o.start(); o.stop(c.currentTime + dur);
  }
  function noiseBuffer(c) {
    if (noiseBuf) return noiseBuf;
    var n = Math.floor(c.sampleRate * 0.6);
    noiseBuf = c.createBuffer(1, n, c.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }

  function play(fn) {
    if (!sfx.on) return;
    var c = ac();
    if (!c) return;
    try { fn(c); } catch (e) { /* 忽略音频错误 */ }
  }

  sfx.shot = function (big) { play(function (c) { noise(c, big ? 0.28 : 0.16, 'highpass', 900, 0.7, big ? 0.5 : 0.36, 240); tone(c, 0.09, big ? 160 : 240, 60, 0.22, 'sawtooth'); }); };
  sfx.swing = function () { play(function (c) { noise(c, 0.13, 'bandpass', 1400, 1.6, 0.16, 420); }); };
  sfx.hit = function () { play(function (c) { tone(c, 0.12, 180, 70, 0.24, 'square'); noise(c, 0.1, 'lowpass', 500, 1, 0.2); }); };
  sfx.hurt = function () { play(function (c) { tone(c, 0.22, 300, 120, 0.2, 'triangle'); noise(c, 0.16, 'lowpass', 400, 1, 0.16); }); };
  sfx.pick = function () { play(function (c) { tone(c, 0.07, 660, 980, 0.12, 'triangle'); }); };
  sfx.door = function (open) { play(function (c) { noise(c, 0.2, 'bandpass', open ? 300 : 520, 3, 0.16, open ? 620 : 260); }); };
  sfx.chop = function () { play(function (c) { noise(c, 0.14, 'bandpass', 320, 1.2, 0.24, 140); tone(c, 0.1, 120, 60, 0.14, 'sine'); }); };
  sfx.alarm = function () { play(function (c) { tone(c, 0.4, 520, 300, 0.16, 'square'); setTimeout(function () { tone(c, 0.4, 460, 260, 0.14, 'square'); }, 260); }); };
  sfx.collapse = function () { play(function (c) { noise(c, 0.5, 'lowpass', 700, 0.8, 0.3, 120); }); };
  // 火：起燃是一下短促的"呼"，浇水是一声闷响
  sfx.whoosh = function () { play(function (c) { noise(c, 0.42, 'bandpass', 420, 0.6, 0.26, 1500); }); };
  sfx.douse = function () { play(function (c) { noise(c, 0.5, 'lowpass', 1600, 0.5, 0.3, 260); tone(c, 0.2, 900, 200, 0.08, 'sine'); }); };
  sfx.win = function () { play(function (c) { [440, 550, 660, 880].forEach(function (f, i) { setTimeout(function () { tone(c, 0.3, f, f, 0.16, 'triangle'); }, i * 160); }); }); };
  sfx.lose = function () { play(function (c) { [300, 240, 180, 110].forEach(function (f, i) { setTimeout(function () { tone(c, 0.5, f, f * 0.7, 0.18, 'sawtooth'); }, i * 220); }); }); };
})(window);
