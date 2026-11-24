/* 暗林 · 幸存夜 — 精灵与渲染（全部程序化绘制，无外部素材） */
(function (global) {
  'use strict';
  var DW = global.DW, G = DW.G, TS = DW.TILE, W = DW.MAP_W, H = DW.MAP_H;

  function cvs(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    return { c: c, x: x };
  }
  var SPR = {};

  // ---------- 地表 40x40 ----------
  var groundCache = null;
  function noiseFill(x, w, h, base, dots, rnd) {
    x.fillStyle = base; x.fillRect(0, 0, w, h);
    for (var i = 0; i < dots; i++) {
      var px = Math.floor(rnd() * w), py = Math.floor(rnd() * h);
      var s = 1 + Math.floor(rnd() * 3);
      x.globalAlpha = 0.12 + rnd() * 0.35;
      x.fillRect(px, py, s, s);
    }
    x.globalAlpha = 1;
  }
  function tile(type, v) {
    var r = DW.mulberry32(type * 977 + v * 131 + 7);
    var o = cvs(TS, TS), x = o.x;
    if (type === G.GRASS) {
      noiseFill(x, TS, TS, '#2b3524', 60, r);
      for (var m = 0; m < 3; m++) {
        x.fillStyle = ['rgba(30,40,24,.6)', 'rgba(58,70,42,.45)', 'rgba(66,58,38,.3)'][m];
        x.beginPath();
        x.ellipse(r() * TS, r() * TS, 5 + r() * 9, 4 + r() * 6, r() * 3, 0, 7);
        x.fill();
      }
      x.strokeStyle = 'rgba(126,146,92,.25)'; x.lineWidth = 1;
      for (var i = 0; i < 7; i++) {
        var px = r() * TS, py = r() * TS;
        x.beginPath(); x.moveTo(px, py); x.lineTo(px + (r() - .5) * 4, py - 3 - r() * 4); x.stroke();
      }
      x.strokeStyle = 'rgba(84,72,50,.4)';
      x.beginPath(); var tx0 = r() * TS, ty0 = r() * TS;
      x.moveTo(tx0, ty0); x.lineTo(tx0 + 6 + r() * 6, ty0 + (r() - .5) * 5); x.stroke();
    } else if (type === G.DIRT) {
      noiseFill(x, TS, TS, '#332d22', 50, r);
      x.fillStyle = 'rgba(80,68,50,.5)';
      for (var k = 0; k < 5; k++) x.fillRect(r() * TS, r() * TS, 2 + r() * 3, 2);
    } else if (type === G.BUSH) {
      noiseFill(x, TS, TS, '#2b3524', 40, r);
      for (var b = 0; b < 5; b++) {
        x.fillStyle = 'rgba(70,96,58,' + (0.35 + r() * 0.4) + ')';
        x.beginPath(); x.ellipse(6 + r() * 28, 14 + r() * 22, 5 + r() * 5, 4 + r() * 3, 0, 0, 7); x.fill();
      }
    } else if (type === G.WATER) {
      noiseFill(x, TS, TS, '#1d2a2e', 25, r);
      x.strokeStyle = 'rgba(120,170,180,.22)';
      for (var wv = 0; wv < 3; wv++) {
        x.beginPath();
        var yy = 8 + wv * 12 + r() * 4;
        x.moveTo(2, yy); x.quadraticCurveTo(TS / 2, yy - 3, TS - 2, yy + 1); x.stroke();
      }
    } else if (type === G.FLOOR) {
      noiseFill(x, TS, TS, '#2f2a20', 30, r);
      x.strokeStyle = 'rgba(20,18,14,.55)'; x.lineWidth = 1;
      x.strokeRect(.5, .5, TS - 1, TS - 1);
      x.fillStyle = 'rgba(90,78,60,.25)'; x.fillRect(0, 0, TS, 2);
    } else if (type === G.ROCK) {
      noiseFill(x, TS, TS, '#2f3330', 40, r);
      x.fillStyle = '#4b4f49';
      x.beginPath(); x.moveTo(4, 34); x.lineTo(10, 12); x.lineTo(24, 8); x.lineTo(34, 26); x.lineTo(20, 36); x.closePath(); x.fill();
      x.fillStyle = 'rgba(150,155,145,.5)'; x.fillRect(12, 14, 8, 3);
      x.fillStyle = 'rgba(10,12,10,.4)'; x.fillRect(14, 26, 16, 8);
    } else if (type === G.RUIN) {
      noiseFill(x, TS, TS, '#4a4a44', 20, r);
      x.strokeStyle = 'rgba(20,20,18,.6)';
      for (var y2 = 4; y2 < TS; y2 += 8) { x.beginPath(); x.moveTo(0, y2); x.lineTo(TS, y2); x.stroke(); }
      for (var x2 = 6; x2 < TS; x2 += 14) { x.beginPath(); x.moveTo(x2, 0); x.lineTo(x2, TS); x.stroke(); }
    }
    return o.c;
  }
  function buildGround() {
    if (groundCache) return;
    groundCache = {};
    var types = [G.GRASS, G.DIRT, G.BUSH, G.WATER, G.FLOOR, G.ROCK, G.RUIN];
    for (var t = 0; t < types.length; t++) {
      var arr = [];
      for (var v = 0; v < 4; v++) arr.push(tile(types[t], v));
      groundCache[types[t]] = arr;
    }
  }

  // ---------- 树 ----------
  function buildTrees() {
    if (SPR.trees) return;
    SPR.trees = [];
    SPR.treeMeta = [];
    var greens = ['#16240f', '#1c2f14', '#22391a', '#122010', '#26401d', '#182b12'];
    for (var i = 0; i < 6; i++) {
      var r = DW.mulberry32(1000 + i * 97);
      var scale = 0.86 + (i % 3) * 0.12;
      var o = cvs(72, 96), x = o.x;
      x.save(); x.translate(36, 62); x.scale(scale, scale);
      // 影子
      x.fillStyle = 'rgba(0,0,0,.42)';
      x.beginPath(); x.ellipse(2, 28, 17, 7, 0, 0, 7); x.fill();
      // 树干
      var lean = (r() - 0.5) * 5;
      x.fillStyle = '#2b2016';
      x.beginPath(); x.moveTo(-4, 28); x.lineTo(-3 + lean, -6); x.lineTo(3 + lean, -6); x.lineTo(4, 28); x.closePath(); x.fill();
      x.fillStyle = '#3d2d1e';
      x.beginPath(); x.moveTo(-3.4, 28); x.lineTo(-2.4 + lean, -6); x.lineTo(-0.4 + lean, -6); x.lineTo(-0.6, 28); x.closePath(); x.fill();
      // 枝
      x.strokeStyle = '#2b2016'; x.lineWidth = 2;
      x.beginPath(); x.moveTo(lean, 4); x.lineTo(lean - 10, -8); x.moveTo(lean, 0); x.lineTo(lean + 11, -10); x.stroke();
      // 树冠：几团不规则叶
      var blobs = 4 + (i % 3);
      for (var b = 0; b < blobs; b++) {
        var bx = (r() - 0.5) * 26 + lean, by = -14 - r() * 22, br = 11 + r() * 9;
        x.fillStyle = greens[(b + i) % greens.length];
        x.beginPath();
        for (var a = 0; a < 11; a++) {
          var an = a / 11 * Math.PI * 2;
          var rad = br * (0.72 + r() * 0.5);
          var px = bx + Math.cos(an) * rad, py = by + Math.sin(an) * rad * 0.78;
          if (a === 0) x.moveTo(px, py); else x.lineTo(px, py);
        }
        x.closePath(); x.fill();
      }
      // 顶部受光
      x.fillStyle = 'rgba(126,160,88,.22)';
      x.beginPath(); x.ellipse(-4 + lean, -34, 10, 5, -0.35, 0, 7); x.fill();
      // 底部暗
      x.fillStyle = 'rgba(0,0,0,.3)';
      x.beginPath(); x.ellipse(2 + lean, -6, 13, 6, 0, 0, 7); x.fill();
      x.restore();
      SPR.trees.push(o.c);
      SPR.treeMeta.push({ ox: (r() - 0.5) * 10, oy: (r() - 0.5) * 6 });
    }
  }
  function buildSprites() {
    buildGround(); buildTrees();
    if (SPR.player) return;
    // 人物（朝右，可旋转）
    function figure(pal, scale) {
      var o = cvs(44, 44), x = o.x;
      x.translate(22, 22); x.scale(scale, scale);
      x.lineJoin = 'round';
      // 描边（让人物在任何背景下都跳出来）
      function ink(fn) { x.strokeStyle = 'rgba(8,8,6,.9)'; x.lineWidth = 2.6; fn(true); x.strokeStyle = 'rgba(8,8,6,.9)'; }
      // 腿
      x.fillStyle = pal.legs;
      ink(function () { x.strokeRect(-4, 1, 3.4, 9); x.strokeRect(1.2, 1, 3.4, 9); });
      x.fillRect(-4, 1, 3.4, 9); x.fillRect(1.2, 1, 3.4, 9);
      // 身体/外套
      x.fillStyle = pal.coat;
      x.beginPath(); x.moveTo(-7, 2); x.lineTo(-6, -8); x.lineTo(6, -8); x.lineTo(7, 2); x.closePath();
      x.strokeStyle = 'rgba(6,6,5,.95)'; x.lineWidth = 2.4; x.stroke(); x.fill();
      x.fillStyle = pal.coat2; x.fillRect(-7, -3, 14, 2);
      // 手臂（前伸）
      x.fillStyle = pal.skin;
      x.strokeStyle = 'rgba(6,6,5,.9)'; x.lineWidth = 2;
      x.beginPath(); x.rect(4, -7, 8, 3); x.stroke(); x.fill();
      x.fillStyle = pal.coat; x.fillRect(3, -7.5, 3.5, 4.5);
      // 头
      x.fillStyle = pal.skin;
      x.beginPath(); x.arc(1, -12, 5.4, 0, 7);
      x.lineWidth = 2.2; x.strokeStyle = 'rgba(6,6,5,.95)'; x.stroke(); x.fill();
      x.fillStyle = pal.hair;
      x.beginPath(); x.arc(0, -13.4, 5.4, Math.PI * 0.85, Math.PI * 2.15); x.fill();
      // 武器提示
      if (pal.gun) {
        x.fillStyle = '#22262a';
        x.fillRect(9, -7.5, 9, 3);
        x.fillStyle = '#12151a'; x.fillRect(9, -5, 3, 4);
      }
      return o.c;
    }
    SPR.player = figure({ coat: '#556046', coat2: '#414a34', legs: '#33322a', skin: '#d8b389', hair: '#2a2018' }, 1.2);
    SPR.bandit = figure({ coat: '#6b453c', coat2: '#52322b', legs: '#31251f', skin: '#c79a70', hair: '#1f1713' }, 1.15);
    SPR.guard = figure({ coat: '#5b5944', coat2: '#464436', legs: '#2c2a20', skin: '#c0956a', hair: '#1a1813', gun: 1 }, 1.15);
    SPR.feral = figure({ coat: '#7c6c55', coat2: '#5f5340', legs: '#3b3126', skin: '#b3a184', hair: '#787060' }, 1.1);
    SPR.ghost = figure({ coat: 'rgba(130,120,165,.6)', coat2: 'rgba(96,86,128,.55)', legs: 'rgba(74,68,96,.5)', skin: 'rgba(210,205,225,.55)', hair: 'rgba(64,58,84,.5)' }, 1.25);
    SPR.looter = figure({ coat: '#463a4e', coat2: '#332939', legs: '#241f2a', skin: '#b9988a', hair: '#201b22' }, 1.15);

    // 容器
    SPR.cont = {};
    function cont(w, h, body, lid, mark) {
      var o = cvs(44, 40), x = o.x; x.translate(22, 22);
      x.fillStyle = 'rgba(0,0,0,.35)'; x.beginPath(); x.ellipse(0, h / 2, w / 2, 4, 0, 0, 7); x.fill();
      x.fillStyle = body; x.fillRect(-w / 2, -h / 2, w, h);
      x.fillStyle = lid; x.fillRect(-w / 2, -h / 2, w, h * 0.34);
      x.strokeStyle = 'rgba(0,0,0,.5)'; x.lineWidth = 1; x.strokeRect(-w / 2 + .5, -h / 2 + .5, w - 1, h - 1);
      if (mark) { x.fillStyle = mark; x.fillRect(-2, -2, 4, 4); }
      return o.c;
    }
    SPR.cont.crate = cont(30, 22, '#4e3a22', '#63492b', '#8a6a3d');
    SPR.cont.cupboard = cont(26, 30, '#463a2a', '#5a4a33', '#7d6a45');
    SPR.cont.barrel = cont(22, 24, '#3c4a44', '#4e5f57', '#6d8078');
    SPR.cont.locker = cont(24, 32, '#3d4550', '#4d5766', '#7d8b9a');
    SPR.cont.backpack = cont(20, 24, '#4a4230', '#5d5340', '#8d7f5b');
    SPR.cont.tent = cont(30, 20, '#414a3a', '#526048', '#6f7d61');
    SPR.cont.car = (function () {
      var o = cvs(48, 34), x = o.x; x.translate(24, 18);
      x.fillStyle = 'rgba(0,0,0,.35)'; x.beginPath(); x.ellipse(0, 8, 21, 5, 0, 0, 7); x.fill();
      x.fillStyle = '#4a4138'; x.fillRect(-20, -6, 40, 14);
      x.fillStyle = '#5b5045'; x.fillRect(-11, -14, 22, 9);
      x.fillStyle = '#22201c'; x.fillRect(-8, -13, 16, 6);
      x.fillStyle = '#181614'; x.beginPath(); x.arc(-13, 8, 4.5, 0, 7); x.arc(13, 8, 4.5, 0, 7); x.fill();
      return o.c;
    })();

    // 结构
    SPR.struct = {};
    (function () { // 木墙
      var o = cvs(TS, TS + 10), x = o.x;
      x.fillStyle = 'rgba(0,0,0,.45)';
      x.fillRect(0, TS + 2, TS, 7);
      x.fillStyle = '#241a11'; x.fillRect(1, 4, TS - 2, TS + 3);
      for (var i = 0; i < 3; i++) {
        var yy = 7 + i * 12;
        x.fillStyle = ['#5b4326', '#4e3a20', '#55401f'][i];
        x.fillRect(3, yy, TS - 6, 10);
        x.fillStyle = 'rgba(255,225,170,.14)'; x.fillRect(3, yy, TS - 6, 2);
        x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(3, yy + 8, TS - 6, 2);
      }
      x.strokeStyle = 'rgba(12,10,7,.85)'; x.lineWidth = 1;
      x.strokeRect(1.5, 4.5, TS - 3, TS + 1);
      x.beginPath(); x.moveTo(TS / 2, 6); x.lineTo(TS / 2, TS + 6); x.stroke();
      SPR.struct.wall = o.c;
    })();
    (function () { // 废墟墙（石）
      var o = cvs(TS, TS + 8), x = o.x;
      noiseFill(x, TS, TS + 8, '#4c4c46', 60, DW.mulberry32(55));
      x.fillStyle = 'rgba(0,0,0,.45)';
      for (var i = 0; i < 6; i++) x.fillRect((i * 9) % TS, 6 + (i % 3) * 12, 7, 3);
      x.strokeStyle = 'rgba(15,15,13,.7)'; x.strokeRect(.5, .5, TS - 1, TS + 7);
      SPR.struct.ruinwall = o.c;
    })();
    (function () { // 门
      var o = cvs(TS, TS + 8), x = o.x;
      x.fillStyle = '#241d13'; x.fillRect(2, 6, TS - 4, TS);
      x.fillStyle = '#5c4527'; x.fillRect(4, 8, TS - 8, TS - 6);
      x.strokeStyle = '#2a2016';
      for (var i = 0; i < 4; i++) { x.beginPath(); x.moveTo(4, 12 + i * 9); x.lineTo(TS - 4, 12 + i * 9); x.stroke(); }
      x.fillStyle = '#9a8f5f'; x.fillRect(TS - 11, 22, 3, 5);
      SPR.struct.gate = o.c;
      var o2 = cvs(TS, TS + 8), x2 = o2.x;
      x2.fillStyle = '#3b2d1d'; x2.fillRect(3, 6, 6, TS); x2.fillRect(TS - 9, 6, 6, TS);
      x2.strokeStyle = 'rgba(120,100,60,.4)'; x2.setLineDash([3, 3]);
      x2.beginPath(); x2.moveTo(6, TS + 4); x2.lineTo(TS - 6, TS + 4); x2.stroke();
      SPR.struct.gateOpen = o2.c;
    })();
    (function () { // 木地板
      var o = cvs(TS, TS), x = o.x;
      noiseFill(x, TS, TS, '#4a3a26', 24, DW.mulberry32(88));
      x.strokeStyle = 'rgba(30,22,14,.6)';
      for (var i = 0; i <= TS; i += 10) { x.beginPath(); x.moveTo(0, i); x.lineTo(TS, i); x.stroke(); }
      SPR.struct.floor = o.c;
    })();
    (function () { // 陷阱
      var o = cvs(TS, TS), x = o.x;
      x.fillStyle = 'rgba(40,32,20,.8)'; x.fillRect(4, 4, TS - 8, TS - 8);
      x.strokeStyle = '#7a6a45'; x.lineWidth = 2;
      for (var i = 0; i < 4; i++) {
        x.beginPath(); x.moveTo(6 + i * 8, TS - 6); x.lineTo(10 + i * 8, 8); x.stroke();
      }
      SPR.struct.spike = o.c;
    })();
    (function () { // 油灯桩
      var o = cvs(TS, TS + 12), x = o.x;
      x.fillStyle = '#2b2620'; x.fillRect(17, 12, 6, 30);
      x.fillStyle = '#4b4238'; x.fillRect(14, 6, 12, 10);
      x.fillStyle = '#f0c463'; x.fillRect(17, 9, 6, 5);
      SPR.struct.lamp = o.c;
    })();
    (function () { // 床
      var o = cvs(TS, TS + 6), x = o.x;
      x.fillStyle = '#3a2f22'; x.fillRect(3, 8, TS - 6, TS - 4);
      x.fillStyle = '#6a6150'; x.fillRect(5, 10, TS - 10, TS - 10);
      x.fillStyle = '#8e8570'; x.fillRect(5, 10, TS - 10, 9);
      x.fillStyle = '#4d4436'; x.fillRect(3, 8, TS - 6, 3);
      SPR.struct.bed = o.c;
    })();
    (function () { // 电台
      var o = cvs(TS, TS + 10), x = o.x;
      x.fillStyle = '#2f3538'; x.fillRect(4, 10, TS - 8, TS - 4);
      x.fillStyle = '#454f55'; x.fillRect(6, 12, TS - 12, 12);
      x.fillStyle = '#6d7a80'; x.fillRect(8, 14, 8, 3); x.fillRect(20, 14, 4, 3);
      x.fillStyle = '#b03d34'; x.fillRect(TS - 14, 26, 4, 4);
      x.strokeStyle = '#7d8890'; x.lineWidth = 2;
      x.beginPath(); x.moveTo(TS / 2, 10); x.lineTo(TS / 2, -2); x.stroke();
      SPR.struct.radio = o.c;
    })();
    SPR.fire = (function () {
      var o = cvs(TS, TS), x = o.x;
      x.fillStyle = '#3a2a1a';
      for (var i = 0; i < 5; i++) { x.save(); x.translate(TS / 2, TS * .72); x.rotate(i * 0.9); x.fillRect(-11, -2, 22, 4); x.restore(); }
      return o.c;
    })();
    SPR.bullet = (function () {
      var o = cvs(8, 8), x = o.x; x.fillStyle = '#f6e08a'; x.fillRect(2, 3, 4, 2); return o.c;
    })();
  }
  DW.SPR = SPR;
  DW.buildSprites = buildSprites;

  // ---------- 主渲染 ----------
  var lightC = null, lightX = null, darkC = null, darkX = null;

  function ambient(minutes) {
    // 0 = 全黑, 1 = 全亮
    var h = minutes / 60;
    if (h >= 7.5 && h <= 18.5) return 1;
    if (h > 18.5 && h < 20.5) return 1 - (h - 18.5) / 2;
    if ((h >= 20.5 || h < 5) ) return 0;
    if (h >= 5 && h < 7.5) return (h - 5) / 2.5;
    return 0.5;
  }
  DW.ambient = ambient;
  DW.isNight = function (m) { var h = m / 60; return h >= 20 || h < 6; };

  DW.render = function (ctx, vw, vh, S) {
    buildSprites();
    var P = S.player, cam = S.cam, t = S.time;
    var amb = ambient(t.minutes);
    var night = 1 - amb;

    ctx.fillStyle = '#080a07';
    ctx.fillRect(0, 0, vw, vh);

    var cx = cam.x, cy = cam.y;
    var x0 = Math.max(0, Math.floor((cx - vw / 2) / TS) - 2), x1 = Math.min(W - 1, Math.ceil((cx + vw / 2) / TS) + 2);
    var y0 = Math.max(0, Math.floor((cy - vh / 2) / TS) - 3), y1 = Math.min(H - 1, Math.ceil((cy + vh / 2) / TS) + 3);

    function sx(wx) { return wx - cx + vw / 2; }
    function sy(wy) { return wy - cy + vh / 2; }

    var world_ = DW.world;
    var drawables = [];

    // 地表
    for (var ty = y0; ty <= y1; ty++) {
      for (var tx = x0; tx <= x1; tx++) {
        var k = DW.idx(tx, ty);
        if (!world_.explored[k]) continue;
        var g = world_.ground[k];
        var arr = groundCache[g] || groundCache[G.GRASS];
        var img = arr[(tx * 7 + ty * 13) & 3];
        ctx.drawImage(img, sx(tx * TS), sy(ty * TS));
        if (g === G.TREE) {
          drawables.push({ y: ty * TS + TS * 0.85, f: drawTree, tx: tx, ty: ty, k: k });
        }
      }
    }

    // 血迹
    for (var d = 0; d < S.decals.length; d++) {
      var dc = S.decals[d];
      ctx.globalAlpha = Math.max(0, dc.life / dc.max) * 0.55;
      ctx.fillStyle = dc.col;
      ctx.beginPath(); ctx.ellipse(sx(dc.x), sy(dc.y), dc.r, dc.r * 0.6, dc.a, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // 建筑：地面层（不挡人）
    var GROUNDY = { floor: 1, spike: 1, fire: 1 };
    for (var sg = 0; sg < world_.structures.length; sg++) {
      var g2 = world_.structures[sg];
      if (!GROUNDY[g2.type]) continue;
      if (g2.tx < x0 || g2.tx > x1 || g2.ty < y0 || g2.ty > y1) continue;
      if (!world_.explored[DW.idx(g2.tx, g2.ty)]) continue;
      drawStruct(ctx, { st: g2 }, sx, sy, S);
    }
    // 火：画在地面上，人从火上走过会疼
    for (var fi = 0; fi < S.fires.length; fi++) {
      var f = S.fires[fi];
      drawFire(ctx, sx(f.x), sy(f.y), f, S);
    }
    // 建筑：立起来的部分（参与遮挡排序）
    for (var si = 0; si < world_.structures.length; si++) {
      var st = world_.structures[si];
      if (GROUNDY[st.type]) continue;
      if (st.tx < x0 || st.tx > x1 || st.ty < y0 || st.ty > y1) continue;
      if (!world_.explored[DW.idx(st.tx, st.ty)]) continue;
      drawables.push({ y: (st.ty + 1) * TS - 2, f: drawStruct, st: st });
    }
    // 容器
    for (var ci = 0; ci < world_.containers.length; ci++) {
      var c = world_.containers[ci];
      if (c.x < (x0 - 1) * TS || c.x > (x1 + 1) * TS || c.y < (y0 - 1) * TS || c.y > (y1 + 1) * TS) continue;
      if (!world_.explored[DW.idx(Math.floor(c.x / TS), Math.floor(c.y / TS))]) continue;
      drawables.push({ y: c.y, f: drawCont, c: c });
    }
    // 掉落物
    for (var di = 0; di < S.drops.length; di++) {
      var dr = S.drops[di];
      drawables.push({ y: dr.y, f: drawDrop, dr: dr });
    }
    // 敌人
    for (var ei = 0; ei < S.enemies.length; ei++) {
      var en = S.enemies[ei];
      drawables.push({ y: en.y, f: drawEnemy, en: en });
    }
    drawables.push({ y: P.y, f: drawPlayer, p: P });

    drawables.sort(function (a, b) { return a.y - b.y; });
    for (var q = 0; q < drawables.length; q++) {
      var it = drawables[q];
      it.f(ctx, it, sx, sy, S);
    }

    // 子弹
    ctx.save();
    for (var bi = 0; bi < S.bullets.length; bi++) {
      var b = S.bullets[bi];
      ctx.strokeStyle = b.friendly ? 'rgba(255,236,150,.9)' : 'rgba(255,180,120,.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx(b.x), sy(b.y));
      ctx.lineTo(sx(b.x - b.vx * 0.02), sy(b.y - b.vy * 0.02));
      ctx.stroke();
    }
    ctx.restore();

    // 飞行中的燃烧瓶（抛物线 + 落点阴影，看得见才好躲）
    for (var bb = 0; bb < S.bombs.length; bb++) {
      var bm = S.bombs[bb];
      var bx = sx(bm.px), by = sy(bm.py), lift = bm.pz * 26;
      ctx.save();
      ctx.strokeStyle = 'rgba(0,0,0,.35)';
      ctx.beginPath(); ctx.ellipse(sx(bm.tx), sy(bm.ty), 9, 5, 0, 0, 7); ctx.stroke();
      ctx.translate(bx, by - lift);
      ctx.rotate(S.t * 9 + bb);
      ctx.fillStyle = '#6d7a52';
      ctx.fillRect(-3, -5, 6, 10);
      ctx.fillStyle = '#c9d1a8'; ctx.fillRect(-1.5, -8, 3, 4);
      ctx.fillStyle = 'rgba(255,170,80,.9)'; ctx.beginPath(); ctx.arc(0, -9, 2.2, 0, 7); ctx.fill();
      ctx.restore();
    }

    // 枪口闪光
    if (S.flash && S.flash.t > 0) {
      var gr = ctx.createRadialGradient(sx(S.flash.x), sy(S.flash.y), 2, sx(S.flash.x), sy(S.flash.y), 70);
      gr.addColorStop(0, 'rgba(255,240,180,' + (0.7 * S.flash.t / 0.08) + ')');
      gr.addColorStop(1, 'rgba(255,200,120,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(sx(S.flash.x) - 70, sy(S.flash.y) - 70, 140, 140);
    }

    // 攻击弧
    if (P.swing > 0) {
      ctx.save();
      ctx.translate(sx(P.x), sy(P.y));
      ctx.rotate(P.aim);
      ctx.strokeStyle = 'rgba(230,235,200,' + (0.5 * P.swing / 0.18) + ')';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(0, 0, 42, -0.9, 0.9); ctx.stroke();
      ctx.restore();
    }

    // ---------- 光照 ----------
    var lightR = 0; void lightR;
    if (!darkC) darkC = cvs(1, 1);
    if (darkC.c.width !== vw || darkC.c.height !== vh) { darkC.c.width = vw; darkC.c.height = vh; }
    darkX = darkC.x;
    darkX.globalCompositeOperation = 'source-over';
    darkX.clearRect(0, 0, vw, vh);

    var darkA = 0.93 * night;
    if (darkA > 0.01) {
      darkX.fillStyle = 'rgba(3,5,10,' + darkA + ')';
      darkX.fillRect(0, 0, vw, vh);
      darkX.globalCompositeOperation = 'destination-out';
      // 手电
      if (P.lantern) {
        var lg = darkX.createRadialGradient(sx(P.x), sy(P.y), 10, sx(P.x), sy(P.y), 190);
        lg.addColorStop(0, 'rgba(0,0,0,.95)'); lg.addColorStop(1, 'rgba(0,0,0,0)');
        darkX.fillStyle = lg;
        darkX.fillRect(sx(P.x) - 190, sy(P.y) - 190, 380, 380);
      } else {
        var ag = darkX.createRadialGradient(sx(P.x), sy(P.y), 4, sx(P.x), sy(P.y), 96);
        ag.addColorStop(0, 'rgba(0,0,0,.8)'); ag.addColorStop(1, 'rgba(0,0,0,0)');
        darkX.fillStyle = ag;
        darkX.fillRect(sx(P.x) - 96, sy(P.y) - 96, 192, 192);
      }
      // 光源：篝火/灯
      for (var li = 0; li < world_.structures.length; li++) {
        var s2 = world_.structures[li];
        var def = DW.BUILD[s2.type];
        if (!def || !def.light || s2.hp <= 0) continue;
        if (!world_.explored[DW.idx(s2.tx, s2.ty)]) continue;
        var lx = sx((s2.tx + .5) * TS), ly = sy((s2.ty + .5) * TS);
        if (lx < -200 || ly < -200 || lx > vw + 200 || ly > vh + 200) continue;
        var rr = def.light * (0.92 + Math.sin(S.t * 6 + s2.tx) * 0.05);
        var rg = darkX.createRadialGradient(lx, ly, 6, lx, ly, rr);
        rg.addColorStop(0, 'rgba(0,0,0,.92)'); rg.addColorStop(0.55, 'rgba(0,0,0,.5)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
        darkX.fillStyle = rg;
        darkX.fillRect(lx - rr, ly - rr, rr * 2, rr * 2);
      }
      // 火堆也是光源：夜里着火的据点很亮，但亮不等于安全
      for (var ffi = 0; ffi < S.fires.length; ffi++) {
        var ff = S.fires[ffi];
        var ffx = sx(ff.x), ffy = sy(ff.y);
        if (ffx < -220 || ffy < -220 || ffx > vw + 220 || ffy > vh + 220) continue;
        var ffr = 150 * (0.7 + 0.3 * Math.sin(S.t * 7 + ffi));
        var ffg = darkX.createRadialGradient(ffx, ffy, 6, ffx, ffy, ffr);
        ffg.addColorStop(0, 'rgba(0,0,0,.95)'); ffg.addColorStop(0.5, 'rgba(0,0,0,.5)'); ffg.addColorStop(1, 'rgba(0,0,0,0)');
        darkX.fillStyle = ffg;
        darkX.fillRect(ffx - ffr, ffy - ffr, ffr * 2, ffr * 2);
      }
      if (S.flash && S.flash.t > 0) {
        var fr = 140;
        var fg = darkX.createRadialGradient(sx(S.flash.x), sy(S.flash.y), 4, sx(S.flash.x), sy(S.flash.y), fr);
        fg.addColorStop(0, 'rgba(0,0,0,.9)'); fg.addColorStop(1, 'rgba(0,0,0,0)');
        darkX.fillStyle = fg;
        darkX.fillRect(sx(S.flash.x) - fr, sy(S.flash.y) - fr, fr * 2, fr * 2);
      }
      darkX.globalCompositeOperation = 'source-over';
      ctx.drawImage(darkC.c, 0, 0);
    }

    // 篝火暖色
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var fj = 0; fj < world_.structures.length; fj++) {
      var s3 = world_.structures[fj];
      if (s3.type !== 'fire' && s3.type !== 'lamp') continue;
      if (!world_.explored[DW.idx(s3.tx, s3.ty)]) continue;
      var fx = sx((s3.tx + .5) * TS), fy = sy((s3.ty + .5) * TS);
      if (fx < -100 || fy < -100 || fx > vw + 100 || fy > vh + 100) continue;
      var rad = s3.type === 'fire' ? 60 : 44;
      var fgr = ctx.createRadialGradient(fx, fy, 2, fx, fy, rad);
      fgr.addColorStop(0, 'rgba(255,170,70,' + (0.22 + night * 0.28) + ')');
      fgr.addColorStop(1, 'rgba(255,140,50,0)');
      ctx.fillStyle = fgr;
      ctx.fillRect(fx - rad, fy - rad, rad * 2, rad * 2);
    }
    for (var fg = 0; fg < S.fires.length; fg++) {
      var ffw = S.fires[fg];
      var wfx = sx(ffw.x), wfy = sy(ffw.y);
      if (wfx < -140 || wfy < -140 || wfx > vw + 140 || wfy > vh + 140) continue;
      var wrad = 110 * (0.7 + 0.3 * Math.sin(S.t * 8 + fg * 1.7));
      var wfgr = ctx.createRadialGradient(wfx, wfy, 2, wfx, wfy, wrad);
      wfgr.addColorStop(0, 'rgba(255,150,60,' + (0.3 + night * 0.3) + ')');
      wfgr.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = wfgr;
      ctx.fillRect(wfx - wrad, wfy - wrad, wrad * 2, wrad * 2);
    }
    ctx.restore();

    // 视野雾（暗林那种"看不远"）
    var fogR = (P.lantern && night > .5) ? 330 : (amb > .5 ? 430 : 250);
    if (P.sanity < 40) fogR *= 0.85;
    var fg2 = ctx.createRadialGradient(sx(P.x), sy(P.y), fogR * 0.42, sx(P.x), sy(P.y), fogR * 1.35);
    fg2.addColorStop(0, 'rgba(8,10,7,0)');
    fg2.addColorStop(1, 'rgba(8,10,7,' + (0.82 + (1 - amb) * 0.15) + ')');
    ctx.fillStyle = fg2;
    ctx.fillRect(0, 0, vw, vh);

    // 下雨：斜线 + 冷色，视野本来就窄，现在更窄一点
    if (S.weather === 'rain') {
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = '#5a6b78';
      ctx.fillRect(0, 0, vw, vh);
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = '#a8bcc8';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var rn = 0; rn < 70; rn++) {
        var rx = (rn * 97.3 + S.t * 260) % (vw + 60) - 30;
        var ry = (rn * 173.7 + S.t * 900) % (vh + 40) - 20;
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx - 5, ry + 15);
      }
      ctx.stroke();
      ctx.restore();
    }

    // 理智：色彩偏移 + 暗角抖动
    if (P.sanity < 55) {
      var k2 = (55 - P.sanity) / 55;
      ctx.save();
      ctx.globalAlpha = 0.12 + k2 * 0.3;
      ctx.fillStyle = k2 > 0.6 ? '#4a1f2e' : '#2a2440';
      ctx.fillRect(0, 0, vw, vh);
      ctx.globalAlpha = 0.5 * k2;
      ctx.strokeStyle = 'rgba(180,150,60,.35)';
      for (var sk = 0; sk < 4; sk++) {
        ctx.beginPath();
        var yy = (S.t * 40 + sk * 90) % vh;
        ctx.moveTo(0, yy); ctx.lineTo(vw, yy + 6); ctx.stroke();
      }
      ctx.restore();
    }

    // 建造预览
    if (S.build && S.build.type) {
      var gt = S.buildTile;
      if (gt) {
        var gx = sx(gt.tx * TS), gy = sy(gt.ty * TS);
        var okc = S.build.ok ? 'rgba(140,200,110,.55)' : 'rgba(210,90,80,.55)';
        ctx.strokeStyle = okc; ctx.lineWidth = 2;
        ctx.strokeRect(gx + 1, gy + 1, TS - 2, TS - 2);
        ctx.fillStyle = okc.replace('.55', '.16');
        ctx.fillRect(gx + 1, gy + 1, TS - 2, TS - 2);
      }
    }
  };

  // ---------- 绘制回调 ----------
  function drawTree(ctx, it, sx, sy, S) {
    var n = it.tx * 31 + it.ty * 17;
    var img = SPR.trees[n % 6], meta = SPR.treeMeta[n % 6];
    var sway = Math.sin(S.t * 0.9 + it.tx * 0.7 + it.ty * 0.5) * 1.8;
    var px = sx(it.tx * TS) + TS / 2 - 36 + meta.ox + sway;
    var py = sy(it.ty * TS) + TS - 88 + meta.oy;
    ctx.drawImage(img, px, py);
    if (S.world_ && S.world_.chop && S.world_.chop.k === it.k) {
      ctx.strokeStyle = 'rgba(240,220,150,.75)'; ctx.lineWidth = 2;
      ctx.strokeRect(sx(it.tx * TS) + 3, sy(it.ty * TS) + 3, TS - 6, TS - 6);
    }
  }
  function drawStruct(ctx, it, sx, sy, S) {
    var st = it.st, px = sx(st.tx * TS), py = sy(st.ty * TS);
    var img;
    if (st.type === 'gate') img = st.open ? SPR.struct.gateOpen : SPR.struct.gate;
    else img = SPR.struct[st.type] || SPR.struct.wall;
    if (st.flash > 0) { ctx.save(); ctx.globalAlpha = 0.6 + 0.4 * Math.sin(st.flash * 30); }
    ctx.drawImage(img, px, py - (st.type === 'wall' || st.type === 'ruinwall' ? 4 : 4));
    if (st.flash > 0) ctx.restore();
    if (st.type === 'fire') {
      ctx.save();
      ctx.translate(px + TS / 2, py + TS * 0.66);
      for (var fl = 0; fl < 3; fl++) {
        var hh = 13 + Math.sin(S.t * 9 + fl * 2.1) * 4.5 + (fl === 1 ? 5 : 0);
        var ww = 6.5 - fl * 1.6;
        ctx.fillStyle = ['rgba(255,170,55,.85)', 'rgba(255,115,35,.8)', 'rgba(255,236,170,.8)'][fl];
        ctx.beginPath();
        ctx.moveTo(-ww, 0);
        ctx.quadraticCurveTo(-ww * 0.7, -hh * 0.65, 0, -hh);
        ctx.quadraticCurveTo(ww * 0.7, -hh * 0.65, ww, 0);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    if (st.type === 'lamp') {
      ctx.fillStyle = 'rgba(255,225,150,' + (0.55 + Math.sin(S.t * 4) * 0.15) + ')';
      ctx.beginPath(); ctx.arc(px + TS / 2, py + 12, 4, 0, 7); ctx.fill();
    }
    if (st.hp < st.maxhp && st.maxhp < 900) {
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(px + 4, py - 6, TS - 8, 4);
      ctx.fillStyle = st.hp / st.maxhp > .4 ? '#a9883f' : '#a4443c';
      ctx.fillRect(px + 4, py - 6, (TS - 8) * (st.hp / st.maxhp), 4);
    }
  }
  // 地上的火：烧焦的圆 + 几簇会摆的火焰 + 冒起来的火星
  function drawFire(ctx, px, py, f, S) {
    var k = Math.max(0.15, Math.min(1, f.life / 6)); // 快灭了就矮下去
    var r = f.r * (0.6 + 0.4 * k);
    ctx.save();
    ctx.fillStyle = 'rgba(22,14,10,.75)';
    ctx.beginPath(); ctx.ellipse(px, py, r * 1.05, r * 0.6, 0, 0, 7); ctx.fill();
    for (var i = 0; i < 5; i++) {
      var a = i * 1.257 + Math.sin(S.t * 0.7 + i) * 0.3;
      var ox = Math.cos(a) * r * 0.42, oy = Math.sin(a) * r * 0.24;
      var hh = (16 + i * 3) * k * (0.85 + Math.sin(S.t * 11 + i * 2.3) * 0.2);
      var ww = (7 - i * 0.7) * k;
      ctx.fillStyle = ['rgba(255,150,45,.8)', 'rgba(255,110,30,.75)', 'rgba(255,225,150,.75)'][i % 3];
      ctx.beginPath();
      ctx.moveTo(px + ox - ww, py + oy);
      ctx.quadraticCurveTo(px + ox - ww * 0.6, py + oy - hh * 0.6, px + ox, py + oy - hh);
      ctx.quadraticCurveTo(px + ox + ww * 0.6, py + oy - hh * 0.6, px + ox + ww, py + oy);
      ctx.closePath(); ctx.fill();
    }
    // 火星
    for (var s = 0; s < 4; s++) {
      var ph = (S.t * 1.6 + s * 0.37) % 1;
      ctx.globalAlpha = (1 - ph) * 0.8;
      ctx.fillStyle = '#ffd08a';
      ctx.beginPath();
      ctx.arc(px + Math.sin(s * 2.1 + ph * 3) * 10, py - ph * 46, 1.6, 0, 7);
      ctx.fill();
    }
    ctx.restore();
  }
  function drawCont(ctx, it, sx, sy, S) {
    var c = it.c, img = SPR.cont[c.type] || SPR.cont.crate;
    var px = sx(c.x) - img.width / 2, py = sy(c.y) - img.height * 0.62;
    ctx.globalAlpha = c.searched ? 0.6 : 1;
    ctx.drawImage(img, px, py);
    ctx.globalAlpha = 1;
    if (!c.searched) {
      ctx.fillStyle = 'rgba(240,225,150,' + (0.4 + 0.3 * Math.sin(S.t * 3)) + ')';
      ctx.beginPath(); ctx.arc(px + img.width / 2, py - 6, 2.4, 0, 7); ctx.fill();
    }
  }
  function drawDrop(ctx, it, sx, sy, S) {
    var dr = it.dr, item = DW.ITEMS[dr.k];
    var bob = Math.sin(S.t * 3 + dr.x) * 2;
    ctx.save();
    ctx.translate(sx(dr.x), sy(dr.y) + bob);
    ctx.fillStyle = 'rgba(0,0,0,.4)';
    ctx.beginPath(); ctx.ellipse(0, 6, 8, 3, 0, 0, 7); ctx.fill();
    ctx.fillStyle = item && item.kind === 'weapon' ? '#8fa07a' : '#c9b877';
    ctx.fillRect(-6, -6, 12, 12);
    ctx.strokeStyle = 'rgba(30,26,18,.8)'; ctx.strokeRect(-6, -6, 12, 12);
    ctx.restore();
  }
  function drawEnemy(ctx, it, sx, sy, S) {
    var e = it.en, px = sx(e.x), py = sy(e.y);
    if (e.dead) return;
    ctx.fillStyle = 'rgba(0,0,0,.4)';
    ctx.beginPath(); ctx.ellipse(px, py + 8, 10, 4.2, 0, 0, 7); ctx.fill();
    ctx.save();
    ctx.translate(px, py);
    if (e.ghost) ctx.globalAlpha = 0.55 + Math.sin(S.t * 5) * 0.15;
    if (e.hit > 0) { ctx.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(e.hit * 40)); }
    ctx.rotate(e.face + Math.PI / 2);
    var img = SPR[e.spr] || SPR.bandit;
    ctx.drawImage(img, -img.width / 2, -img.height / 2 + 2);
    ctx.restore();
    // 血条 + 警戒
    if (e.hp < e.maxhp) {
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(px - 14, py - 26, 28, 3);
      ctx.fillStyle = '#a8443c'; ctx.fillRect(px - 14, py - 26, 28 * (e.hp / e.maxhp), 3);
    }
    if (e.alert > 0.12) {
      var a = e.alert > 0.7 ? '#e05a4a' : (e.alert > 0.35 ? '#e8b84a' : '#b9a755');
      ctx.fillStyle = a;
      ctx.globalAlpha = 0.85;
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(e.alert > 0.7 ? '!' : '?', px + 12, py - 24);
      ctx.globalAlpha = 1;
    }
    if (e.aiming > 0) {
      ctx.strokeStyle = 'rgba(230,90,70,.5)';
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(e.face) * 60, py + Math.sin(e.face) * 60); ctx.stroke();
    }
  }
  function drawPlayer(ctx, it, sx, sy, S) {
    var p = it.p, px = sx(p.x), py = sy(p.y);
    // 脚下标记
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.beginPath(); ctx.ellipse(px, py + 8, 11, 4.6, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(240,238,196,.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(px, py + 8, 13, 5.4, 0, 0, 7); ctx.stroke();
    ctx.save();
    ctx.translate(px, py);
    var bob = Math.sin(S.t * 10) * (p.moving ? 1.2 : 0.3);
    ctx.rotate(p.aim + Math.PI / 2);
    var img = SPR.player;
    ctx.drawImage(img, -img.width / 2, -img.height / 2 + 2 + bob);
    ctx.restore();
    // 朝向细线（帮你确认在瞄哪）
    ctx.strokeStyle = 'rgba(240,238,200,.16)';
    ctx.beginPath(); ctx.moveTo(px, py);
    ctx.lineTo(px + Math.cos(p.aim) * 40, py + Math.sin(p.aim) * 40); ctx.stroke();
    if (p.invuln > 0) {
      ctx.strokeStyle = 'rgba(240,120,90,.5)';
      ctx.beginPath(); ctx.arc(px, py, 17, 0, 7); ctx.stroke();
    }
  }
})(window);
