/* 暗林 · 幸存夜 — 原创程序化配乐
 * 全部用 WebAudio 现场合成：没有音频文件、没有外部素材、不联网。
 * 气质参考「黑暗生存恐怖」这类配乐共有的手法（低频 drone + 失谐拨弦 + 房间底噪），
 * 不是对任何既有作品的改编或采样。
 */
(function (global) {
  'use strict';
  var DW = global.DW;
  var M = DW.music = { on: true, eng: null, timer: 0, volume: 0.24, ready: false };

  // 调性中心慢慢漂移，每次换和弦换一个根音 —— 听起来"总在同一个调又不太对"
  var ROOTS = [55.0, 51.91, 58.27, 49.0, 61.74];
  // 白天和弦：自然小调色彩
  var DAY_CHORDS = [[0, 7, 12, 15], [0, 5, 9, 14], [0, 7, 11, 16]];
  // 夜里和弦：三全音、小二度，故意留不解决的摩擦
  var NIGHT_CHORDS = [[0, 6, 7, 13], [0, 1, 7, 12], [0, 6, 10, 13]];
  var DAY_SCALE = [0, 3, 7, 10, 12, 15];
  var NIGHT_SCALE = [0, 1, 6, 7, 11, 13];

  function semi(root, n) { return root * Math.pow(2, n / 12); }

  function mkNoise(ctx, secs, brown) {
    var n = Math.max(1, Math.floor(ctx.sampleRate * secs));
    var buf = ctx.createBuffer(1, n, ctx.sampleRate);
    var d = buf.getChannelData(0), last = 0;
    for (var i = 0; i < n; i++) {
      var w = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      else d[i] = w;
    }
    return buf;
  }

  // 纯合成混响：4 条 comb delay 互相错开，没有脉冲响应素材
  function mkVerb(ctx, dest) {
    var input = ctx.createGain(), wet = ctx.createGain();
    wet.gain.value = 0.55;
    [37, 53, 71, 97].forEach(function (ms) {
      var d = ctx.createDelay(0.5); d.delayTime.value = ms / 1000;
      var fb = ctx.createGain(); fb.gain.value = 0.7;
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
      input.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d);
      d.connect(wet);
    });
    wet.connect(dest);
    return input;
  }

  function build(ctx, offline) {
    var white = mkNoise(ctx, 1.2, false);
    var out = ctx.createGain(); out.gain.value = 0;
    // 轻限幅：多层叠加时防止削顶爆音
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.knee.value = 14; comp.ratio.value = 8;
    comp.attack.value = 0.008; comp.release.value = 0.3;
    out.connect(comp); comp.connect(ctx.destination);

    var dry = ctx.createGain(); dry.gain.value = 0.9; dry.connect(out);
    var send = ctx.createGain(); send.gain.value = 0.45;
    send.connect(mkVerb(ctx, out));

    var eng = {
      ctx: ctx, out: out, dry: dry, send: send, white: white,
      mood: { night: 0.2, threat: 0, sanity: 1, state: 'menu', duck: 1 },
      p: {}, rootIdx: 0, chordIdx: 0,
      nextChord: 0, nextPluck: 0, nextPulse: 0, started: false
    };

    /* ---------- 层 1：低频 drone（一直在，夜里更沉） ---------- */
    var dLevel = ctx.createGain(); dLevel.gain.value = 0;
    var dLp = ctx.createBiquadFilter(); dLp.type = 'lowpass'; dLp.frequency.value = 180; dLp.Q.value = 0.9;
    dLp.connect(dLevel); dLevel.connect(dry); dLevel.connect(send);
    var dVoices = [];
    [[0.5, 'sine', 1.0], [1, 'sine', 0.5], [1, 'sawtooth', 0.09], [1.5, 'triangle', 0.2], [2, 'sine', 0.14]].forEach(function (sp) {
      var o = ctx.createOscillator(); o.type = sp[1]; o.frequency.value = ROOTS[0] * sp[0];
      var g = ctx.createGain(); g.gain.value = sp[2];
      o.connect(g); g.connect(dLp); o.start();
      dVoices.push({ o: o, mult: sp[0] });
    });
    // 两条极慢 LFO 推滤波器与音高，让它像活的、随时要走音
    var lfo1 = ctx.createOscillator(); lfo1.frequency.value = 0.037;
    var lfo1g = ctx.createGain(); lfo1g.gain.value = 70;
    lfo1.connect(lfo1g); lfo1g.connect(dLp.frequency); lfo1.start();
    var lfo2 = ctx.createOscillator(); lfo2.frequency.value = 0.061;
    var lfo2g = ctx.createGain(); lfo2g.gain.value = 4;
    lfo2.connect(lfo2g); lfo2.start();

    /* ---------- 层 2：和弦垫（几十秒换一次，换的时候滑过去） ---------- */
    var pLevel = ctx.createGain(); pLevel.gain.value = 0;
    var pTrem = ctx.createGain(); pTrem.gain.value = 0.8;
    var pLp = ctx.createBiquadFilter(); pLp.type = 'lowpass'; pLp.frequency.value = 820;
    pLp.connect(pTrem); pTrem.connect(pLevel); pLevel.connect(dry); pLevel.connect(send);
    var trem = ctx.createOscillator(); trem.frequency.value = 0.073;
    var tremg = ctx.createGain(); tremg.gain.value = 0.2;
    trem.connect(tremg); tremg.connect(pTrem.gain); trem.start();
    var pVoices = [];
    for (var i = 0; i < 4; i++) {
      var po = ctx.createOscillator(); po.type = i % 2 ? 'triangle' : 'sine';
      po.frequency.value = semi(ROOTS[0], DAY_CHORDS[0][i]);
      var pg = ctx.createGain(); pg.gain.value = 0.3;
      po.connect(pg); pg.connect(pLp); po.start();
      lfo2g.connect(po.detune);
      pVoices.push(po);
    }

    /* ---------- 层 3：风/林子的底噪，用 fbm 噪声函数调制 ---------- */
    var wSrc = ctx.createBufferSource(); wSrc.buffer = mkNoise(ctx, 3, true); wSrc.loop = true;
    var wBp = ctx.createBiquadFilter(); wBp.type = 'bandpass'; wBp.frequency.value = 480; wBp.Q.value = 0.7;
    var wLevel = ctx.createGain(); wLevel.gain.value = 0;
    wSrc.connect(wBp); wBp.connect(wLevel); wLevel.connect(dry); wLevel.connect(send); wSrc.start();

    /* ---------- 层 4：理智低时的耳语（只进混响，像在屋外绕） ---------- */
    var nSrc = ctx.createBufferSource(); nSrc.buffer = white; nSrc.loop = true;
    var nBp = ctx.createBiquadFilter(); nBp.type = 'bandpass'; nBp.frequency.value = 1700; nBp.Q.value = 5;
    var nTrem = ctx.createGain(); nTrem.gain.value = 0.5;
    var nLevel = ctx.createGain(); nLevel.gain.value = 0;
    var nLfo = ctx.createOscillator(); nLfo.frequency.value = 5.3;
    var nLfoG = ctx.createGain(); nLfoG.gain.value = 0.45;
    nLfo.connect(nLfoG); nLfoG.connect(nTrem.gain); nLfo.start();
    nSrc.connect(nBp); nBp.connect(nTrem); nTrem.connect(nLevel); nLevel.connect(send); nSrc.start();

    /* ---------- 一次性音源 ---------- */
    function thump(t, amp) {
      var o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(88, t);
      o.frequency.exponentialRampToValueAtTime(34, t + 0.16);
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(amp, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(g); g.connect(dry);
      o.start(t); o.stop(t + 0.34);
    }
    // 预制钢琴味：基音 + 失谐泛音列，短攻击长衰减
    function pluck(t, f, dur, amp) {
      [[1, 1], [2.02, 0.3], [2.76, 0.15], [4.17, 0.06]].forEach(function (p) {
        var o = ctx.createOscillator(); o.type = 'sine';
        o.frequency.value = f * p[0];
        o.detune.value = Math.random() * 9 - 4.5;
        var g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(amp * p[1], t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur * (p[0] < 2 ? 1 : 0.5));
        o.connect(g); g.connect(dry); g.connect(send);
        o.start(t); o.stop(t + dur + 0.1);
      });
      var ns = ctx.createBufferSource(); ns.buffer = white;
      var nb = ctx.createBiquadFilter(); nb.type = 'bandpass'; nb.frequency.value = f * 3; nb.Q.value = 1.4;
      var ng = ctx.createGain();
      ng.gain.setValueAtTime(amp * 0.22, t);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      ns.connect(nb); nb.connect(ng); ng.connect(dry);
      ns.start(t); ns.stop(t + 0.14);
    }
    // 过场重音：入夜 / 遇袭 / 死亡
    function sting(t, kind) {
      var f0 = kind === 'death' ? 120 : 70, f1 = kind === 'death' ? 26 : 30;
      var o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + 1.5);
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.55, t + 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
      o.connect(g); g.connect(dry); g.connect(send);
      o.start(t); o.stop(t + 2);
      var ns = ctx.createBufferSource(); ns.buffer = white; ns.loop = true;
      var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
      bp.frequency.setValueAtTime(200, t);
      bp.frequency.exponentialRampToValueAtTime(kind === 'night' ? 1800 : 700, t + 1.1);
      var ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001, t);
      ng.gain.linearRampToValueAtTime(0.18, t + 0.8);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);
      ns.connect(bp); bp.connect(ng); ng.connect(send);
      ns.start(t); ns.stop(t + 1.8);
    }
    eng.sting = sting;

    /* ---------- 和弦切换 ---------- */
    function changeChord(t) {
      var night = eng.mood.night > 0.5;
      var list = night ? NIGHT_CHORDS : DAY_CHORDS;
      eng.chordIdx = (eng.chordIdx + 1 + (Math.random() * 2 | 0)) % list.length;
      eng.rootIdx = (eng.rootIdx + 1 + (Math.random() * 3 | 0)) % ROOTS.length;
      var root = ROOTS[eng.rootIdx], chord = list[eng.chordIdx];
      // 理智越低，和弦越往"错"的方向偏
      var skew = (1 - eng.mood.sanity) * 1.4;
      pVoices.forEach(function (o, i) {
        var n = chord[i] + (i === 3 && skew > 0.7 ? 1 : 0);
        o.frequency.setTargetAtTime(semi(root, n), t, 2.2);
      });
      dVoices.forEach(function (v) {
        v.o.frequency.setTargetAtTime(root * v.mult, t, 3.4);
      });
    }
    eng.changeChord = changeChord;

    /* ---------- 把 mood 折算成各层目标值 ---------- */
    eng.applyMood = function (m, t) {
      eng.mood = m;
      var night = DW.clamp(m.night, 0, 1), threat = DW.clamp(m.threat, 0, 1);
      var sanity = DW.clamp(m.sanity, 0, 1), duck = DW.clamp(m.duck, 0, 1);
      var over = m.state === 'over', menu = m.state === 'menu', sleep = m.state === 'sleep';
      var fade = over ? 0.5 : sleep ? 0.4 : 1;
      var p = eng.p;
      p.drone = (0.1 + 0.15 * night + 0.05 * threat) * fade;
      p.pad = (0.045 + 0.055 * night + 0.03 * (1 - sanity)) * fade;
      p.wind = (0.02 + 0.05 * night) * (0.65 + 0.7 * DW.clamp(m.away || 0, 0, 1)) * fade;
      p.whisper = (sanity < 0.35 ? (0.35 - sanity) / 0.35 : 0) * 0.05;
      p.pluckAmp = (menu ? 0.06 : 0.075 + 0.05 * night) * (over ? 0 : 1) * fade;
      p.pluckGap = (menu ? 12 : 10 - 5.5 * night);
      p.pulseGap = (threat > 0.05 && !menu && !over) ? (0.95 - 0.3 * threat) : 0;
      p.pulseAmp = threat * 0.3;
      p.chordHold = 22 - 8 * night;
      p.detune = (1 - sanity) * 20 + night * 5;
      p.cut = 150 + 130 * (1 - night);
      p.send = 0.42 + 0.28 * night + 0.22 * (1 - sanity);
      var tc = 1.6;
      dLevel.gain.setTargetAtTime(p.drone, t, tc);
      pLevel.gain.setTargetAtTime(p.pad, t, tc);
      wLevel.gain.setTargetAtTime(p.wind, t, tc);
      nLevel.gain.setTargetAtTime(p.whisper, t, tc);
      dLp.frequency.setTargetAtTime(p.cut, t, tc);
      send.gain.setTargetAtTime(p.send, t, tc);
      lfo2g.gain.setTargetAtTime(p.detune, t, tc);
      out.gain.setTargetAtTime(M.on ? M.volume * duck : 0, t, 0.9);
    };

    /* ---------- 排程：只往前看 1~2 秒，切后台不会堆一坨音符 ---------- */
    eng.schedule = function (now, ahead) {
      var p = eng.p;
      if (!eng.started) {
        eng.started = true;
        eng.nextChord = now + 0.4;
        eng.nextPluck = now + 2.5;
        eng.nextPulse = now + 0.6;
      }
      var guard = 0;
      while (eng.nextChord < now + ahead && guard++ < 8) {
        changeChord(eng.nextChord);
        eng.nextChord += Math.max(8, p.chordHold || 20) * DW.rand(0.85, 1.2);
      }
      guard = 0;
      while (eng.nextPluck < now + ahead && guard++ < 12) {
        if (p.pluckAmp > 0.002) {
          var sc = eng.mood.night > 0.5 ? NIGHT_SCALE : DAY_SCALE;
          var root = ROOTS[eng.rootIdx];
          var deg = DW.pick(sc) + (DW.chance(0.3) ? 12 : 0) + 12;
          pluck(eng.nextPluck, semi(root, deg), DW.rand(2.6, 5.4), p.pluckAmp * DW.rand(0.7, 1.15));
        }
        eng.nextPluck += (p.pluckGap || 10) * DW.rand(0.6, 1.7);
      }
      if (p.pulseGap) {
        guard = 0;
        while (eng.nextPulse < now + ahead && guard++ < 12) {
          thump(eng.nextPulse, p.pulseAmp);
          thump(eng.nextPulse + 0.26, p.pulseAmp * 0.62);
          eng.nextPulse += p.pulseGap;
        }
      }
    };

    return eng;
  }

  /* ---------- 实时电平监测：证明"真的在出声"，不是空转 ---------- */
  var anBuf = null, anNode = null, anCtx = null;
  function tapAnalyser(ctx, eng) {
    if (anCtx !== ctx) {
      try {
        anNode = ctx.createAnalyser();
        anNode.fftSize = 1024;
        eng.out.connect(anNode);
        anBuf = new Float32Array(anNode.fftSize);
        anCtx = ctx;
      } catch (e) { anNode = null; }
    }
  }
  M.levels = function () {
    if (!M.eng || !anNode) return null;
    anNode.getFloatTimeDomainData(anBuf);
    var s = 0, pk = 0;
    for (var i = 0; i < anBuf.length; i++) {
      var v = anBuf[i], a = v < 0 ? -v : v;
      if (a > pk) pk = a; s += v * v;
    }
    return { rms: Math.sqrt(s / anBuf.length), peak: pk };
  };

  /* ---------- 开关 ---------- */
  function ensure() {
    if (!DW.sfx.on && !M.on) return null;
    var ctx = DW.sfx.ensure ? DW.sfx.ensure() : null;
    if (!ctx) return null;
    if (!M.eng || M.eng.ctx !== ctx) {
      try { M.eng = build(ctx, false); tapAnalyser(ctx, M.eng); }
      catch (e) { M.eng = null; return null; }
    }
    if (!M.timer) {
      M.timer = global.setInterval(function () {
        var c = M.eng && M.eng.ctx;
        if (!M.on) return;
        // 切后台或上下文没在跑就别排：恢复时会把攒下的音符一次性砸出来
        if (!c || c.state !== 'running' || global.document && global.document.hidden) return;
        try { M.eng.schedule(c.currentTime, 1.6); } catch (e) { /* 忽略 */ }
      }, 400);
    }
    M.ready = true;
    return ctx;
  }

  M.enable = function () {
    M.on = true;
    var ctx = ensure();
    if (ctx && M.eng) M.eng.applyMood(M.eng.mood, ctx.currentTime);
    return !!ctx;
  };
  M.disable = function () {
    M.on = false;
    if (M.eng) {
      try { M.eng.out.gain.setTargetAtTime(0, M.eng.ctx.currentTime, 0.4); } catch (e) { }
    }
  };
  M.toggle = function () { if (M.on) M.disable(); else M.enable(); return M.on; };

  /* ---------- 过场重音 ---------- */
  M.event = function (kind) {
    if (!M.on || !M.eng) return;
    var ctx = M.eng.ctx;
    if (!ctx || ctx.state !== 'running') return;
    try { M.eng.sting(ctx.currentTime + 0.02, kind); } catch (e) { }
  };

  /* ---------- 每帧：从游戏状态推 mood ---------- */
  var probeT = 0, lastNight = null;
  function nightFactor(minutes) {
    var h = (minutes / 60) % 24;
    // 18:30 起暗，20:30 全黑，5:00 起亮，6:40 全白天
    if (h >= 18.5 && h < 20.5) return (h - 18.5) / 2;
    if (h >= 20.5 || h < 5) return 1;
    if (h >= 5 && h < 6.66) return 1 - (h - 5) / 1.66;
    return 0;
  }
  M.update = function (dt, S) {
    if (!M.on || !M.eng) return;
    var ctx = M.eng.ctx;
    if (!ctx || ctx.state !== 'running') return;
    probeT -= dt;
    var m = M.eng.mood;
    m.state = DW.state;
    m.night = S ? nightFactor(S.time.minutes) : 0.25;
    m.sanity = S ? DW.clamp(S.player.sanity / 100, 0, 1) : 1;
    m.duck = DW.state === 'pause' ? 0.45 : 1;
    if (probeT <= 0 && S) {
      probeT = 0.4;
      var P = S.player, th = 0;
      for (var i = 0; i < S.enemies.length; i++) {
        var e = S.enemies[i];
        if (e.dead) continue;
        var d = DW.dist(P.x, P.y, e.x, e.y);
        if (d > 620) continue;
        var w = (e.state === 'chase' ? 1 : e.alert > 0.5 ? 0.6 : 0.22) * (1 - DW.clamp(d / 620, 0, 1));
        if (w > th) th = w;
      }
      if (S.flags && S.flags.raidNight === S.time.day) th = Math.max(th, 0.85);
      m.threat = th;
      // 离小屋越远，风声越重（在野外过夜比屋里吓人）
      var hut = S.world_ && S.world_.hut;
      var hd = hut ? DW.dist(P.x, P.y, (hut.tx + 0.5) * DW.TILE, (hut.ty + 0.5) * DW.TILE) : 700;
      m.away = DW.clamp(hd / 1400, 0, 1);
      M.eng.applyMood(m, ctx.currentTime);
      if (lastNight === null) lastNight = m.night > 0.5;
      else if (m.night > 0.5 && !lastNight) { lastNight = true; M.event('night'); }
      else if (m.night <= 0.5 && lastNight) lastNight = false;
    } else if (!S) {
      m.threat = 0; m.away = 0.5;
      M.eng.applyMood(m, ctx.currentTime);
    }
  };

  /* ---------- 自检：离线渲染几秒，量 RMS / 峰值，证明真的出声 ---------- */
  M.render = function (secs, mood) {
    var OC = global.OfflineAudioContext || global.webkitOfflineAudioContext;
    if (!OC) return Promise.reject(new Error('no OfflineAudioContext'));
    var sr = 44100;
    var ctx = new OC(2, Math.floor(sr * secs), sr);
    var eng = build(ctx, true);
    var m = { night: 0.8, threat: 0.6, sanity: 0.3, state: 'play', duck: 1 };
    if (mood) for (var k in mood) m[k] = mood[k];
    eng.applyMood(m, 0);
    eng.schedule(0, secs);
    return ctx.startRendering().then(function (buf) {
      var s = 0, n = 0, pk = 0, clip = 0;
      for (var ch = 0; ch < buf.numberOfChannels; ch++) {
        var d = buf.getChannelData(ch);
        for (var i = 0; i < d.length; i++) {
          var v = d[i], a = v < 0 ? -v : v;
          if (a > pk) pk = a;
          if (a > 0.999) clip++;
          s += v * v; n++;
        }
      }
      return { secs: secs, rms: Math.sqrt(s / n), peak: pk, clipped: clip };
    });
  };

  M.debug = function (S) {
    return {
      on: M.on, ready: M.ready, timer: !!M.timer,
      state: M.eng ? M.eng.ctx.state : 'none',
      mood: M.eng ? M.eng.mood : null,
      p: M.eng ? M.eng.p : null,
      levels: M.levels(),
      night: S ? nightFactor(S.time.minutes) : null
    };
  };
})(window);
