/* 暗林 · 幸存夜 — 游戏状态 / 事件 / 主循环 / 存档 */
(function (global) {
  'use strict';
  var DW = global.DW, TS = DW.TILE, game = DW.game = {};
  var cv, ctx, vw = 0, vh = 0, dpr = 1;
  var S;

  // ---------- 初始化 ----------
  game.boot = function () {
    cv = document.getElementById('cv');
    ctx = cv.getContext('2d');
    resize();
    global.addEventListener('resize', resize);
    global.addEventListener('orientationchange', function () { setTimeout(resize, 250); });

    // 菜单背景：先生成一个随机世界
    var seed = (Math.random() * 1e9) >>> 0;
    DW.genWorld(seed);
    S = DW.S = newState(DW.world, DW.ent.makePlayer((DW.world.hut.tx + 0.5) * TS, (DW.world.hut.ty + 0.5) * TS));
    S.time.minutes = 19 * 60 + 40;
    revealAround(S, 10);
    DW.state = 'menu';
    DW.ui.init(S);
    if (DW.hasSave()) document.getElementById('btnCont').style.display = '';
    DW.ui.open('Menu');
    DW.ui.toast('欢迎来到暗林', 'good');
    running = true;
    requestAnimationFrame(frame);
  };

  function resize() {
    dpr = Math.min(2, global.devicePixelRatio || 1);
    vw = global.innerWidth; vh = global.innerHeight;
    cv.width = Math.floor(vw * dpr); cv.height = Math.floor(vh * dpr);
    cv.style.width = vw + 'px'; cv.style.height = vh + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function newState(world, player) {
    return {
      world_: world, player: player,
      enemies: [], bullets: [], drops: [], decals: [], pops: [],
      time: { minutes: DW.DAY_START, day: 1 },
      cam: { x: player.x, y: player.y },
      t: 0, input: DW.ui.input, build: { type: null }, buildTile: null,
      flags: { announced: false, raidNight: 0, slept: 0 },
      flash: null, flashHurt: 0, shake: 0, rescue: 0, rescueDay: 0,
      mouseWorld: null, mouseScreen: null, openLoot: null, saveT: 0,
      spawnQueue: [], raidAt: null, sleepT: 0
    };
  }

  function populate(S) {
    S.enemies.length = 0;
    var sp = S.world_.spawns || [];
    for (var i = 0; i < sp.length; i++) {
      var s = sp[i];
      var e = DW.ent.spawnEnemy(S, s.x, s.y, s.kind, { home: s.home });
      if (s.post !== undefined) { e.post = s.post; e.home = { tx: s.home.tx, ty: s.home.ty }; }
    }
  }

  function revealAround(S, r) {
    DW.reveal(S.player.x, S.player.y, r * TS);
  }

  function adoptState(fresh) {
    if (!S) { S = DW.S = fresh; return; }
    for (var k in fresh) { if (k === 'input') continue; S[k] = fresh[k]; }
    S.input = DW.ui.input;
  }

  // ---------- 新游戏 / 存档 ----------
  game.newGame = function () {
    DW.ui.close('Menu'); DW.ui.close('End');
    var seed = (Math.random() * 1e9) >>> 0;
    DW.genWorld(seed);
    var world = DW.world;
    var P = DW.ent.makePlayer((world.hut.tx + 0.5) * TS, (world.hut.ty + 0.8) * TS);
    P.inv.wood = 6; P.inv.food = 2; P.inv.water = 2; P.inv.bandage = 2;
    if (P.weapons.indexOf('knife') < 0) P.weapons.push('knife');
    adoptState(newState(world, P));
    populate(S);
    revealAround(S, 7);
    DW.state = 'play';
    DW.ui.toast('第 1 天。天黑前把墙补上。', 'good');
    DW.ui.toast('找不到路？看右上角小地图的黄点（小屋）', 'warn');
  };

  game.save = function (manual) {
    var w = S.world_, P = S.player;
    var expl = rle(w.explored);
    var built = [];
    for (var i = 0; i < w.structures.length; i++) {
      var st = w.structures[i];
      if (st.stat) continue;
      built.push({ tx: st.tx, ty: st.ty, type: st.type, hp: Math.round(st.hp), open: !!st.open });
    }
    var cont = [];
    for (var c = 0; c < w.containers.length; c++) {
      cont.push({ s: w.containers[c].searched ? 1 : 0, it: w.containers[c].items });
    }
    var towers = [];
    for (var t = 0; t < w.towers.length; t++) towers.push({ c: w.towers[t].cleared ? 1 : 0, g: w.towers[t].guardsLeft });
    var data = {
      seed: w.seed, ver: 1,
      time: S.time, rescue: S.rescue, rescueDay: S.rescueDay, repair: w.repairDone,
      player: {
        x: Math.round(P.x), y: Math.round(P.y), hp: P.hp, food: P.food, water: P.water,
        energy: P.energy, sanity: P.sanity, weapons: P.weapons, slot: P.slot,
        ammo: P.ammo, inv: P.inv, lantern: P.lantern, kills: P.kills
      },
      built: built, cont: cont, towers: towers, expl: expl, drops: S.drops,
      parts: w.containers.filter(function (c) { return c.hasPartTaken; }).length
    };
    if (DW.save(data)) { if (manual) DW.ui.toast('已保存', 'good'); }
    else if (manual) DW.ui.toast('保存失败（浏览器不允许）', 'bad');
  };

  game.loadGame = function () {
    var d = DW.load();
    if (!d) { game.newGame(); return; }
    DW.ui.close('Menu'); DW.ui.close('End');
    DW.genWorld(d.seed);
    var w = DW.world;
    var P = DW.ent.makePlayer(d.player.x, d.player.y);
    ['hp', 'food', 'water', 'energy', 'sanity', 'weapons', 'slot', 'ammo', 'inv', 'lantern', 'kills'].forEach(function (k) {
      if (d.player[k] !== undefined) P[k] = d.player[k];
    });
    if (!P.inv) P.inv = DW.newInv();
    S = DW.S; adoptState(newState(w, P));
    S.time = d.time;
    S.rescue = d.rescue || 0; S.rescueDay = d.rescueDay || 0;
    w.repairDone = !!d.repair;
    // 建筑
    for (var i = 0; i < w.structures.length; i++) if (!w.structures[i].stat) w.structures[i]._keep = false;
    var keepKeys = {};
    (d.built || []).forEach(function (b) { keepKeys[b.tx + ',' + b.ty] = b; });
    for (var j = w.structures.length - 1; j >= 0; j--) {
      var st = w.structures[j];
      if (st.stat) continue;
      var k = st.tx + ',' + st.ty;
      if (keepKeys[k]) { st.hp = keepKeys[k].hp; st.open = keepKeys[k].open; }
      else DW._removeS(st);
    }
    (d.built || []).forEach(function (b) {
      if (DW.s(b.tx, b.ty)) return;
      var ns = DW._addS(b.tx, b.ty, b.type, b.hp || 100);
      ns.maxhp = DW.BUILD[b.type] ? DW.BUILD[b.type].hp : 100;
      ns.hp = b.hp; ns.open = b.open;
    });
    DW.rebuildFlags();
    // 容器
    (d.cont || []).forEach(function (c, idx2) {
      var cc = w.containers[idx2];
      if (!cc) return;
      cc.searched = !!c.s; cc.items = c.it || [];
      if (cc.hasPart && cc.searched) cc.hasPartTaken = true;
    });
    // 据点
    (d.towers || []).forEach(function (t, idx3) {
      var T = w.towers[idx3];
      if (!T) return;
      T.cleared = !!t.c;
      if (t.g !== undefined) T.guardsLeft = t.g;
    });
    // 探索
    unrle(d.expl, w.explored);
    S.drops = (d.drops || []).slice();
    populate(S);
    DW.state = 'play';
    DW.ui.toast('读取存档：第 ' + S.time.day + ' 天', 'good');
  };

  function rle(arr) {
    var out = [], cur = arr[0], n = 0;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] === cur) n++;
      else { out.push(cur + 'x' + n); cur = arr[i]; n = 1; }
    }
    out.push(cur + 'x' + n);
    return out.join(',');
  }
  function unrle(str, arr) {
    if (!str) return;
    var parts = str.split(',');
    var p = 0;
    for (var i = 0; i < parts.length && p < arr.length; i++) {
      var kv = parts[i].split('x');
      var v = parseInt(kv[0], 10), n = parseInt(kv[1], 10);
      for (var j = 0; j < n && p < arr.length; j++) arr[p++] = v;
    }
  }

  game.quitToMenu = function () {
    game.save(false);
    DW.state = 'menu';
    document.getElementById('btnCont').style.display = '';
    DW.ui.open('Menu');
  };

  // ---------- 主循环 ----------
  var running = false, last = 0;
  function frame(ts) {
    if (!running) return;
    if (!last) last = ts;
    var dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    if (dt > 0) {
      if (DW.state === 'play') update(dt);
      else if (DW.state === 'menu') menuTick(dt);
      else if (DW.state === 'sleep') sleepTick(dt);
      else if (DW.state === 'pause') { /* 冻结 */ }
    }
    draw();
    requestAnimationFrame(frame);
  }
  game.loopOn = function () { last = 0; };

  function menuTick(dt) {
    S.t += dt;
    S.time.minutes += dt * DW.MIN_PER_SEC * 0.6;
    if (S.time.minutes >= 1440) { S.time.minutes -= 1440; }
    S.cam.x = S.player.x + Math.cos(S.t * 0.12) * 90;
    S.cam.y = S.player.y + Math.sin(S.t * 0.1) * 60;
    DW.ui.update(dt);
  }

  function update(dt) {
    S.t += dt;
    // 时间
    S.time.minutes += dt * DW.MIN_PER_SEC;
    if (S.time.minutes >= 1440) {
      S.time.minutes -= 1440;
      S.time.day++;
      game.newDay(S);
    }
    var wasNight = DW.isNight(S.time.minutes - dt * DW.MIN_PER_SEC);
    var isNight = DW.isNight(S.time.minutes);
    if (!wasNight && isNight) game.onNightfall(S);

    DW.ent.updatePlayer(S, dt);
    if (DW.state !== 'play') { draw(); return; }
    DW.ent.updateEnemies(S, dt);
    DW.ent.updateBullets(S, dt);
    if (S.input.attack) DW.ent.attack(S);

    // 掉落物自动拾取
    var P = S.player;
    for (var i = S.drops.length - 1; i >= 0; i--) {
      var d = S.drops[i];
      if (DW.dist(d.x, d.y, P.x, P.y) < 28) {
        DW.ent.give(S, d.k, d.n);
        var nm = DW.ITEMS[d.k];
        DW.sfx.pick();
        DW.ui.toast('+' + d.n + ' ' + nm.name, 'good');
        S.drops.splice(i, 1);
      }
    }
    // 粒子/飘字/血迹
    for (var p = S.pops.length - 1; p >= 0; p--) {
      S.pops[p].life -= dt; S.pops[p].y -= dt * 22;
      if (S.pops[p].life <= 0) S.pops.splice(p, 1);
    }
    for (var dc = S.decals.length - 1; dc >= 0; dc--) {
      S.decals[dc].life -= dt;
      if (S.decals[dc].life <= 0) S.decals.splice(dc, 1);
      else if (S.decals.length > 240) S.decals.shift();
    }
    if (S.flash) { S.flash.t -= dt; if (S.flash.t <= 0) S.flash = null; }

    // 据点清空判定
    for (var tw = 0; tw < S.world_.towers.length; tw++) {
      var T = S.world_.towers[tw];
      if (T.container.searched) T.cleared = true;
    }

    // 敌人数量控制：远处未警觉的清掉，夜里补充
    for (var en = S.enemies.length - 1; en >= 0; en--) {
      var e = S.enemies[en];
      if (e.dead || e.post !== undefined || e.raid) continue;
      if (DW.dist(e.x, e.y, P.x, P.y) > 1000 && e.alert < 0.2) S.enemies.splice(en, 1);
    }
    if (S.enemies.length < 8 && DW.chance(dt * 0.05)) spawnWanderer();

    // 袭击
    if (S.raidAt && S.t > S.raidAt) { doRaid(); S.raidAt = null; }

    // 救援
    if (S.rescue && S.time.day >= S.rescueDay) {
      game.win('直升机的灯光穿过树冠。你抱着最后一箱弹药跑向小屋前的空地——<br>' +
        '司机朝你挥手。森林在你身后合拢，像什么都没发生过。');
      return;
    }

    // 相机
    var cx = P.x, cy = P.y;
    S.cam.x += (cx - S.cam.x) * Math.min(1, dt * 7);
    S.cam.y += (cy - S.cam.y) * Math.min(1, dt * 7);
    S.cam.x = DW.clamp(S.cam.x, vw / 2, TS * DW.MAP_W - vw / 2);
    S.cam.y = DW.clamp(S.cam.y, vh / 2, TS * DW.MAP_H - vh / 2);
    if (S.shake > 0) { S.shake -= dt; S.cam.x += (Math.random() - 0.5) * 6; S.cam.y += (Math.random() - 0.5) * 6; }

    S.saveT += dt;
    if (S.saveT > 45) { S.saveT = 0; game.save(false); }
    DW.ui.update(dt);
  }

  function draw() {
    if (!S) return;
    if (DW.state === 'play' || DW.state === 'sleep') {
      // 飘字在渲染后叠加
    }
    DW.render(ctx, vw, vh, S);
    // 伤害飘字
    ctx.save();
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    for (var i = 0; i < S.pops.length; i++) {
      var pp = S.pops[i];
      ctx.globalAlpha = Math.min(1, pp.life * 1.6);
      ctx.fillStyle = pp.col;
      ctx.fillText(pp.txt, pp.x - S.cam.x + vw / 2, pp.y - S.cam.y + vh / 2);
    }
    ctx.restore();
    if (DW.state === 'sleep') {
      ctx.fillStyle = 'rgba(4,6,4,.86)';
      ctx.fillRect(0, 0, vw, vh);
      ctx.fillStyle = '#cfd0b8';
      ctx.font = '15px sans-serif';
      ctx.textAlign = 'center';
      var hh = Math.floor(S.time.minutes / 60), mm = Math.floor(S.time.minutes % 60);
      ctx.fillText('睡 着 了 …   第 ' + S.time.day + ' 天 ' + (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm, vw / 2, vh / 2);
      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#7d7c6c';
      ctx.fillText('点按任意处醒来（天亮了会自动醒）', vw / 2, vh / 2 + 24);
    }
    if (DW.state === 'play' && S.player.sanity < 25) {
      ctx.save();
      ctx.globalAlpha = (25 - S.player.sanity) / 25 * 0.5;
      ctx.fillStyle = '#e7d9a8';
      ctx.font = 'italic 16px serif';
      ctx.textAlign = 'center';
      ctx.fillText(DW.pick(['它们一直在看着你。', '你听见有人在念你的名字。', '这堵墙…刚才不是这样的。', '别再往前走了。', '你已经回不去了。']),
        vw / 2, vh * 0.24);
      ctx.restore();
    }
  }

  // ---------- 事件：昼夜 / 袭击 ----------
  game.onNightfall = function (st) {
    var day = st.time.day;
    DW.ui.toast('天黑了。森林开始移动。', 'warn');
    if (day >= 2 && day % 2 === 0) {
      st.raidAt = st.t + DW.rand(35, 70);
      st.flags.raidNight = day;
    } else if (day >= 3) {
      // 夜行疯子游荡进来
      var n = DW.randInt(1, 2);
      for (var i = 0; i < n; i++) spawnAt(18 + DW.rand(0, 8), 'feral', {});
    }
  };

  function doRaid() {
    var day = S.time.day;
    var n = Math.min(7, 2 + Math.floor(day / 2));
    DW.sfx.alarm();
    DW.ui.toast('有人袭击你的据点！（' + n + ' 人）', 'bad');
    for (var i = 0; i < n; i++) {
      spawnAt(DW.rand(11, 16), i % 3 === 0 ? 'feral' : 'bandit', { raid: true, gun: i !== 0 });
    }
    S.shake = 0.4;
  }

  function spawnAt(tileDist, kind, opts) {
    var a = DW.rand(0, 6.283);
    var tx = Math.round(S.player.x / TS + Math.cos(a) * tileDist);
    var ty = Math.round(S.player.y / TS + Math.sin(a) * tileDist);
    tx = DW.clamp(tx, 4, DW.MAP_W - 5); ty = DW.clamp(ty, 4, DW.MAP_H - 5);
    // 找附近可站的地方
    for (var r = 0; r < 8; r++) {
      if (!DW.collide((tx + r) * TS + 20, (ty + r) * TS + 20, 12)) {
        DW.ent.spawnEnemy(S, (tx + r) * TS + 20, (ty + r) * TS + 20, kind, opts);
        return;
      }
    }
    var wx = tx * TS + 20, wy = ty * TS + 20;
    if (DW.collide(wx, wy, 12)) { wx = S.player.x + 400; wy = S.player.y; }
    DW.ent.spawnEnemy(S, wx, wy, kind, opts);
  }

  function spawnWanderer() {
    var P = S.player;
    var a = DW.rand(0, 6.283), d = DW.rand(26, 40) * TS;
    var x = P.x + Math.cos(a) * d, y = P.y + Math.sin(a) * d;
    if (DW.collide(x, y, 12)) return;
    DW.ent.spawnEnemy(S, x, y, DW.isNight(S.time.minutes) ? 'feral' : 'bandit', {});
  }

  game.newDay = function (st) {
    var P = st.player;
    DW.ui.toast('第 ' + st.time.day + ' 天。', 'good');
    if (st.time.day % 4 === 0 && !st.rescue) {
      DW.ui.toast('森林里安静得不对劲…（物资刷新了）', 'warn');
      refreshLoot(st);
    }
    if (P.sanity < 40) DW.ui.toast('你一夜没睡好，理智 ' + Math.round(P.sanity), 'warn');
  };

  function refreshLoot(st) {
    var n = 0;
    for (var i = 0; i < st.world_.containers.length; i++) {
      var c = st.world_.containers[i];
      if (c.hasPart) continue;
      if (c.searched && DW.chance(0.35) && n < 10) { c.searched = false; c.items = DW.rollLoot(3, false); n++; }
    }
  }

  // ---------- 互动 ----------
  game.interactTarget = function () {
    var P = S.player;
    var drop = null, dd = 40;
    for (var i = 0; i < S.drops.length; i++) {
      var d = DW.dist(P.x, P.y, S.drops[i].x, S.drops[i].y);
      if (d < dd) { dd = d; drop = S.drops[i]; }
    }
    var c = DW.nearContainer(P.x, P.y, 58);
    var gate = DW.nearStruct(P.x, P.y, ['gate'], 52);
    var radio = DW.nearStruct(P.x, P.y, ['radio'], 56);
    var bed = DW.nearStruct(P.x, P.y, ['bed'], 56);
    var fire = DW.nearStruct(P.x, P.y, ['fire'], 70);
    var wall = DW.nearStruct(P.x, P.y, ['wall', 'spike', 'lamp', 'floor'], 46);
    if (radio) return { type: 'radio', obj: radio, label: '电台' + (S.world_.repairDone ? '（已修好）' : '（需要 3 个零件，你身上 ' + P.inv.part + '）') };
    if (bed) return { type: 'bed', obj: bed, label: '床 · 睡觉到天亮' };
    if (gate) return { type: 'gate', obj: gate, label: '木门 · ' + (gate.open ? '关' : '开') };
    if (fire) return { type: 'fire', obj: fire, label: (P.inv.rawfood > 0 ? '篝火 · 烤肉（生肉 ' + P.inv.rawfood + '）' : '篝火 · 照暖和烤东西') };
    if (c) return { type: 'container', obj: c, label: '搜刮 ' + c.label };
    if (wall) return { type: 'wall', obj: wall, label: '拆掉这段' + DW.BUILD[wall.type].name + '（退材料）' };
    if (drop) return { type: 'drop', obj: drop, label: '拾取 ' + DW.ITEMS[drop.k].name + ' x' + drop.n };
    return null;
  };

  game.interact = function () {
    if (DW.state === 'sleep') { return; }
    if (DW.state !== 'play' || DW.ui.blocked()) return;
    var tg = game.interactTarget();
    if (!tg) {
      var P = S.player;
      if (DW.nearStruct(P.x, P.y, ['fire'], 90)) DW.ui.toast('这里没有可烤的东西');
      return;
    }
    var obj = tg.obj;
    switch (tg.type) {
      case 'radio':
        if (S.world_.repairDone) { DW.ui.toast('电台已经修好了，等救援。', 'good'); return; }
        if ((S.player.inv.part | 0) >= 3) {
          S.world_.repairDone = true;
          S.player.inv.part -= 3;
          S.rescue = 1;
          S.rescueDay = S.time.day + 1;
          DW.ui.close('Loot');
          DW.ui.toast('电台修好了！撑到第 ' + S.rescueDay + ' 天早上，救援会在小屋外出现。', 'good');
          DW.ui.toast('（想快点结束？睡觉跳过时间）', 'warn');
          game.save(false);
        } else {
          DW.ui.toast('还缺 ' + (3 - S.player.inv.part) + ' 个电台零件（红点据点的铁皮柜里）', 'warn');
        }
        break;
      case 'bed':
        trySleep();
        break;
      case 'gate':
        obj.open = !obj.open;
        DW.rebuildFlags();
        DW.sfx.door(obj.open);
        DW.ui.toast('木门' + (obj.open ? '打开' : '关上') + '了');
        if (!obj.open) DW.ent.noise(S, obj.tx * TS, obj.ty * TS, 80, 0.35);
        break;
      case 'fire':
        if (!DW.ent.cook(S)) DW.ui.toast('篝火旁没有生肉', 'warn');
        break;
      case 'container':
        S.openLoot = obj;
        DW.ui.openLoot(obj);
        if (!obj.searched) { obj.searched = true; DW.ent.noise(S, obj.x, obj.y, 100, 0.3); }
        break;
      case 'wall':
        if (obj.stat) { DW.ui.toast('这个拆不了'); break; }
        var back = DW.BUILD[obj.type].cost;
        for (var k in back) DW.ent.give(S, k, Math.ceil(back[k] / 2));
        DW.deconstruct(obj);
        DW.ui.toast('拆掉了，回收一半材料');
        break;
      case 'drop':
        DW.ent.give(S, obj.k, obj.n);
        DW.ui.toast('+' + obj.n + ' ' + DW.ITEMS[obj.k].name, 'good');
        S.drops.splice(S.drops.indexOf(obj), 1);
        break;
    }
  };

  game.takeItem = function (c, i) {
    var it = c.items[i];
    if (!it) return;
    DW.ent.give(S, it.k, it.n);
    if (it.k === 'part') c.hasPartTaken = true;
    DW.sfx.pick();
    DW.ui.toast('拿走 ' + it.n + ' x ' + DW.ITEMS[it.k].name, 'good');
    c.items.splice(i, 1);
    if (!c.items.length) {
      DW.ui.close('Loot');
      S.openLoot = null;
      if (c.hasPart) {
        var parts = S.world_.containers.filter(function (x) { return x.hasPartTaken; }).length;
        DW.ui.toast('零件 ' + parts + '/3 —— 带回小屋的电台', 'warn');
      }
    }
  };
  game.takeAll = function () {
    var c = S.openLoot;
    if (!c) return;
    while (c.items.length) game.takeItem(c, 0);
  };

  // ---------- 建造 ----------
  game.buildGhost = function (sx, sy) {
    var w = game.screenToWorld(sx, sy);
    S.buildTile = { tx: Math.floor(w.x / TS), ty: Math.floor(w.y / TS) };
    checkBuildValid();
  };
  function checkBuildValid() {
    var gt = S.buildTile;
    S.build.ok = false;
    if (!gt || !S.build.type) return;
    var d = DW.dist((gt.tx + .5) * TS, (gt.ty + .5) * TS, S.player.x, S.player.y);
    if (d > TS * 4.2) { S.build.why = '太远了（最多 4 格）'; return; }
    var res = probePlace(gt.tx, gt.ty);
    S.build.ok = res.ok; S.build.why = res.why;
  }
  function probePlace(tx, ty) {
    if (tx < 2 || ty < 2 || tx >= DW.MAP_W - 2 || ty >= DW.MAP_H - 2) return { ok: false, why: '太靠边' };
    var k = DW.idx(tx, ty);
    if (DW.world.sMap[k]) return { ok: false, why: '这里已经有东西' };
    if (DW.SOLID_GROUND[DW.world.ground[k]]) return { ok: false, why: '地面是树/石头，先清开' };
    var P = S.player;
    if (DW.ent.weapon(P) && !DW.ent.weapon(P).ammo && tx === Math.floor(P.x / TS) && ty === Math.floor(P.y / TS)) {
      return { ok: false, why: '不能在自己脚下建' };
    }
    return { ok: true };
  }
  game.buildAt = function (sx, sy) {
    if (!S.build.type) return;
    if (DW.state !== 'play') { S.build.type = null; return; }
    game.buildGhost(sx, sy);
    var gt = S.buildTile;
    if (!gt) return;
    var type = S.build.type;
    var def = DW.BUILD[type];
    // 材料
    for (var k in def.cost) {
      var have = (S.player.inv[k] | 0);
      if (have < def.cost[k]) { DW.ui.toast(def.name + ' 需要 ' + DW.ITEMS[k].name + ' x' + def.cost[k], 'warn'); S.build.type = null; return; }
    }
    var v = probePlace(gt.tx, gt.ty);
    if (!v.ok) { DW.ui.toast(v.why, 'warn'); return; }
    for (var k2 in def.cost) S.player.inv[k2] -= def.cost[k2];
    var st = DW.placeStructure(gt.tx, gt.ty, type);
    if (!st.ok) { DW.ui.toast(st.why, 'warn'); return; }
    S.player.energy = Math.max(0, S.player.energy - 6);
    DW.ent.noise(S, S.player.x, S.player.y, 110, 0.35);
    DW.ui.toast('建好：' + def.name, 'good');
    S.buildTile = null;
    game.save(false);
  };
  game.cancelBuild = function () { S.build.type = null; };

  game.screenToWorld = function (sx, sy) {
    return { x: sx - vw / 2 + S.cam.x, y: sy - vh / 2 + S.cam.y };
  };

  // ---------- 睡觉 ----------
  function trySleep() {
    var P = S.player;
    if (DW.isOutside(P.x, P.y)) { DW.ui.toast('先回屋里，露天睡觉会被拖走', 'bad'); return; }
    var threat = 0;
    for (var i = 0; i < S.enemies.length; i++) {
      var e = S.enemies[i];
      if (e.dead || e.ghost) continue;
      if (DW.dist(P.x, P.y, e.x, e.y) < 420 && (e.alert > 0.5 || e.state === 'chase')) threat++;
    }
    if (threat) { DW.ui.toast('附近有人（' + threat + '）——睡不着', 'bad'); return; }
    if (!DW.nearStruct(P.x, P.y, ['wall'], 200)) DW.ui.toast('据点连一段墙都没有，你不敢睡', 'warn');
    if (DW.isNight(S.time.minutes)) {
      S.sleepT = 0;
      DW.state = 'sleep';
      DW.ui.toast('睡着了…', 'good');
    } else {
      // 白天打盹：只推进 4 小时
      advanceTime(240, true);
      DW.ui.toast('打了个盹，+体力');
    }
  }

  function sleepTick(dt) {
    S.sleepT += dt;
    var speed = 16; // 快进倍数（相对实时）
    advanceTime(dt * DW.MIN_PER_SEC * speed, false);
    var P = S.player;
    P.food = Math.max(0, P.food - dt * 0.5);
    P.water = Math.max(0, P.water - dt * 0.7);
    if (!DW.isNight(S.time.minutes)) {
      // 天亮醒来
      P.energy = 100;
      P.hp = DW.clamp(P.hp + 14, 0, 100);
      var lit = !!DW.nearStruct(P.x, P.y, ['fire', 'lamp'], 150);
      P.sanity = DW.clamp(P.sanity + (lit ? 26 : 16), 0, 100);
      DW.state = 'play';
      game.save(false);
      var hh = Math.floor(S.time.minutes / 60);
      DW.ui.toast('天亮了，第 ' + S.time.day + ' 天 ' + hh + ':00', 'good');
      // 夜里剩下的袭击者撤退
      for (var i = S.enemies.length - 1; i >= 0; i--) {
        var e = S.enemies[i];
        if (e.raid && e.alert < 0.6) { S.enemies.splice(i, 1); }
      }
      return;
    }
    if (S.sleepT > 0.6 && S.input.attack) DW.state = 'play';
  }

  function advanceTime(mins, nap) {
    S.time.minutes += mins;
    while (S.time.minutes >= 1440) {
      S.time.minutes -= 1440;
      S.time.day++;
      if (S.rescue && S.time.day >= S.rescueDay) {
        DW.state = 'play';
        game.win('你合上眼再睁开时，屋顶已经在震。<br>直升机的探照灯扫过树冠——你活着离开了暗林。');
        return;
      }
    }
    if (nap) {
      S.player.energy = DW.clamp(S.player.energy + 40, 0, 100);
      S.player.food = Math.max(0, S.player.food - 4);
      S.player.water = Math.max(0, S.player.water - 5);
    }
  }

  // ---------- 结束 ----------
  game.die = function (st, reason) {
    if (DW.state === 'over') return;
    DW.state = 'over';
    DW.ui.input.attack = false;
    st.build.type = null;
    var P = st.player;
    DW.sfx.lose();
    DW.ui.endScreen(false,
      '死因：<b>' + (reason || '未知') + '</b><br>' +
      '存活 <b>' + st.time.day + '</b> 天 · 击杀 <b>' + P.kills + '</b> · 电台零件 <b>' + P.inv.part + '/3</b><br>' +
      (P.sanity < 20 ? '到最后你看见的东西，比真实的多。' : (st.time.day < 3 ? '暗林对新来的人没什么耐心。' : '差一点点。')));
  };
  game.win = function (text) {
    if (DW.state === 'over') return;
    DW.state = 'over';
    DW.ui.input.attack = false;
    DW.sfx.win();
    DW.ui.endScreen(true,
      text + '<br><br>存活 <b>' + S.time.day + '</b> 天 · 击杀 <b>' + S.player.kills + '</b> · ' +
      '理智 <b>' + Math.round(S.player.sanity) + '</b><br>' +
      '<span style="color:#8d8b78">想挑战更难的？下一版可以加阵营、好感度和真正的“看不见即不存在”潜行。</span>');
    DW.clearSave();
    document.getElementById('btnCont').style.display = 'none';
  };

  game.cycleWeapon = function () {
    var P = S.player;
    P.slot = (P.slot + 1) % P.weapons.length;
    DW.ui.toast('装备 ' + DW.ITEMS[P.weapons[P.slot]].name);
  };

  DW.game = game;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', game.boot);
  else game.boot();
})(window);
