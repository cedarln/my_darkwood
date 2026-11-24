/* 暗林 · 幸存夜 — 玩家 / 敌人 / 战斗 / 生存数值 */
(function (global) {
  'use strict';
  var DW = global.DW, TS = DW.TILE;

  var E = DW.ent = {};

  // ---------- 玩家 ----------
  E.makePlayer = function (x, y) {
    return {
      x: x, y: y, r: 12, aim: -Math.PI / 2, moving: false, sprint: false,
      hp: 100, food: 78, water: 76, energy: 90, sanity: 88,
      weapons: ['fist', 'bat'], slot: 1, ammo: { ammo: 0, shells: 0 },
      inv: DW.newInv(), lantern: true,
      swing: 0, atkCd: 0, chopCd: 0, invuln: 0, hurt: 0,
      noise: 0, kills: 0
    };
  };
  E.weapon = function (P) { return DW.ITEMS[P.weapons[P.slot]] || null; };

  E.hurtPlayer = function (S, dmg, src, silent) {
    var P = S.player;
    if (P.invuln > 0 || P.hp <= 0) return;
    P.hp -= dmg;
    P.invuln = 0.35; P.hurt = 0.4;
    DW.sfx.hurt();
    P.sanity = DW.clamp(P.sanity - dmg * 0.22, 0, 100);
    S.flashHurt = 0.35;
    if (!silent) DW.ui.toast('受了 ' + Math.round(dmg) + ' 点伤', 'bad');
    if (P.hp <= 0) { P.hp = 0; DW.game.die(S, src); }
  };

  E.updatePlayer = function (S, dt) {
    var P = S.player, inp = S.input;
    var mv = inp.vec;
    var len = Math.sqrt(mv.x * mv.x + mv.y * mv.y);
    P.moving = len > 0.12;

    var spd = 116;
    if (P.food < 15 || P.water < 15 || P.energy < 12) spd *= 0.72;
    if (P.sanity < 25) spd *= 0.9;
    var wantSprint = inp.sprint && P.moving && P.energy > 6;
    P.sprint = wantSprint;
    if (wantSprint) { spd *= 1.62; P.energy = Math.max(0, P.energy - 10 * dt); }
    else if (!P.moving) P.energy = Math.min(100, P.energy + (P.food > 8 && P.water > 8 ? 5.2 : 0) * dt);
    else P.energy = Math.min(100, P.energy + 1.6 * dt);

    if (P.moving) {
      var nx = mv.x / len, ny = mv.y / len, mag = Math.min(1, len * 2.2);
      P.aim = Math.atan2(mv.y, mv.x);
      DW.moveWithCollision(P, nx * spd * dt * mag, ny * spd * dt * mag);
      P.noise = wantSprint ? 150 : 55;
      if (wantSprint) E.noise(S, P.x, P.y, 170, 0.45);
    } else P.noise = 0;

    if (inp.mouseActive && S.mouseWorld) {
      P.aim = Math.atan2(S.mouseWorld.y - P.y, S.mouseWorld.x - P.x);
    }

    // 生存消耗（真实秒）
    P.food = Math.max(0, P.food - 0.20 * dt);
    P.water = Math.max(0, P.water - 0.30 * dt);
    if (P.food <= 0) P.hp -= 1.1 * dt;
    if (P.water <= 0) P.hp -= 1.9 * dt;
    if (P.food > 55 && P.water > 55 && P.hp < 100) P.hp += 0.35 * dt;

    // 理智
    var night = DW.isNight(S.time.minutes);
    var outside = DW.isOutside(P.x, P.y);
    var lit = !!DW.nearStruct(P.x, P.y, ['fire', 'lamp'], 150);
    var dsan = 0;
    if (!night) dsan += 0.55; else dsan -= (outside ? 1.05 : 0.32);
    if (night && !lit && outside) dsan -= 0.5;
    if (lit) dsan += 0.35;
    if (!outside) dsan += 0.25;
    var threat = 0, nearest = 1e9;
    for (var i = 0; i < S.enemies.length; i++) {
      var e = S.enemies[i];
      if (e.dead || e.friendly) continue;
      var d = DW.dist(P.x, P.y, e.x, e.y);
      if (d < nearest) nearest = d;
      if (d < 260 && e.alert > 0.5) threat++;
    }
    if (threat > 0) dsan -= 0.35 * Math.min(3, threat);
    else if (!night && nearest > 500) dsan += 0.2;
    if (P.hp < 30) dsan -= 0.25;
    P.sanity = DW.clamp(P.sanity + dsan * dt, 0, 100);

    if (P.sanity < 26 && DW.chance(dt * 0.06)) E.spawnGhost(S);
    if (P.sanity < 12) P.hp -= 0.5 * dt;

    P.swing = Math.max(0, P.swing - dt);
    P.atkCd = Math.max(0, P.atkCd - dt);
    P.chopCd = Math.max(0, P.chopCd - dt);
    P.invuln = Math.max(0, P.invuln - dt);
    P.hurt = Math.max(0, P.hurt - dt);
    if (P.hp <= 0) { P.hp = 0; DW.game.die(S, '伤重不治'); }

    DW.reveal(P.x, P.y, (P.lantern && night) ? 215 : 190);
  };

  // ---------- 攻击 ----------
  E.attack = function (S) {
    var P = S.player;
    if (P.atkCd > 0 || P.hp <= 0 || DW.ui.blocked()) return;
    var w = E.weapon(P);
    if (w && w.ammo) {
      if ((P.ammo[w.ammo] | 0) <= 0) { DW.ui.toast('没有 ' + DW.ITEMS[w.ammo].name, 'warn'); P.atkCd = 0.3; return; }
      P.ammo[w.ammo]--;
      P.atkCd = w.spd;
      var n = w.shots || 1;
      var shake = (1 - P.sanity / 100) * 0.12;
      for (var i = 0; i < n; i++) {
        var a = P.aim + (Math.random() - 0.5) * w.spread * 2 + shake * (Math.random() - 0.5);
        E.bullet(S, P.x + Math.cos(a) * 18, P.y + Math.sin(a) * 18, a, w, true);
      }
      S.flash = { x: P.x + Math.cos(P.aim) * 22, y: P.y + Math.sin(P.aim) * 22, t: 0.09 };
      DW.sfx.shot(w.shots > 1);
      E.noise(S, P.x, P.y, w.loud, 1);
      return;
    }
    // 近战 / 徒手 / 砍树
    P.atkCd = w ? w.spd : 0.5;
    P.swing = 0.18;
    DW.sfx.swing();
    var dmg = w ? w.dmg : 8;
    var range = w ? w.range : 34, arc = w ? w.arc : 1.5;
    if (P.energy < 4) dmg *= 0.4;
    P.energy = Math.max(0, P.energy - (w ? (w.stam || 5) : 2));
    var hit = 0;
    for (var j = 0; j < S.enemies.length; j++) {
      var en = S.enemies[j];
      if (en.dead) continue;
      var dd = DW.dist(P.x, P.y, en.x, en.y);
      if (dd > range + en.r) continue;
      if (Math.abs(DW.angleDiff(Math.atan2(en.y - P.y, en.x - P.x), P.aim)) > arc) continue;
      E.damageEnemy(S, en, dmg, 'melee', P.aim);
      hit++;
    }
    if (!hit) E.tryChop(S, P, w);
    if (!hit && !S.world_.chop) E.noise(S, P.x, P.y, 70, 0.28);
  };

  E.tryChop = function (S, P, w) {
    var px = P.x + Math.cos(P.aim) * 34, py = P.y + Math.sin(P.aim) * 34;
    var tx = Math.floor(px / TS), ty = Math.floor(py / TS);
    if (DW.groundAt(tx, ty) !== DW.G.TREE) { S.world_.chop = null; return; }
    if (P.chopCd > 0) return;
    var key = DW.idx(tx, ty);
    if (!S.world_.chop || S.world_.chop.k !== key) S.world_.chop = { k: key, hits: 0 };
    S.world_.chop.hits++;
    P.chopCd = 0.42;
    DW.sfx.chop();
    P.energy = Math.max(0, P.energy - 4);
    E.noise(S, P.x, P.y, 90, 0.3);
    var need = (w && w.chop === 2) ? 2 : 3;
    if (S.world_.chop.hits >= need) {
      S.world_.chop.hits = 0;
      S.world_.chop = null;
      var got = DW.randInt(2, 4);
      E.give(S, 'wood', got);
      DW.ui.toast('砍到 +' + got + ' 木材', 'good');
      if (DW.chance(0.25)) { E.give(S, 'plank', 1); }
      if (DW.chance(0.14)) E.give(S, DW.pick(['food', 'cloth', 'rawfood']), 1);
    } else {
      DW.ui.toast('砍树… ' + S.world_.chop.hits + '/' + need);
    }
  };

  E.bullet = function (S, x, y, ang, w, friendly) {
    var sp = 700;
    S.bullets.push({
      x: x, y: y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
      dmg: w.dmg, friendly: friendly !== false, life: (w.range || 400) / sp
    });
  };

  E.updateBullets = function (S, dt) {
    var arr = S.bullets, P = S.player;
    for (var i = arr.length - 1; i >= 0; i--) {
      var b = arr[i], alive = true, steps = 3;
      for (var s = 0; s < steps && alive; s++) {
        b.x += b.vx * dt / steps; b.y += b.vy * dt / steps;
        var tx = Math.floor(b.x / TS), ty = Math.floor(b.y / TS);
        if (DW.blockingLine(tx, ty)) {
          var st = DW.s(tx, ty);
          if (st && !st.stat && (st.type === 'wall' || st.type === 'gate' || st.type === 'spike' || st.type === 'lamp' || st.type === 'fire')) {
            st.hp -= b.dmg * 0.7; st.flash = 0.3;
            if (st.hp <= 0) { DW.deconstruct(st); DW.sfx.collapse(); DW.ui.toast('一段围墙被砸塌了！', 'bad'); }
          }
          alive = false; break;
        }
        if (b.friendly) {
          for (var j = 0; j < S.enemies.length; j++) {
            var e = S.enemies[j];
            if (e.dead) continue;
            if (DW.dist2(b.x, b.y, e.x, e.y) < (e.r + 5) * (e.r + 5)) {
              E.damageEnemy(S, e, b.dmg, 'shot', Math.atan2(b.vy, b.vx));
              alive = false; break;
            }
          }
        } else if (P.invuln <= 0 && DW.dist2(b.x, b.y, P.x, P.y) < (P.r + 5) * (P.r + 5)) {
          E.hurtPlayer(S, b.dmg, '子弹');
          alive = false; break;
        }
      }
      b.life -= dt;
      if (!alive || b.life <= 0) arr.splice(i, 1);
    }
  };

  // ---------- 敌人 ----------
  var KINDS = {
    bandit: { hp: 52, spd: 74, spr: 'bandit', dmg: 7, gun: 0.45, gunDmg: 12, vr: 300, vrn: 165, fov: 1.7 },
    guard:  { hp: 70, spd: 82, spr: 'guard', dmg: 9, gun: 0.85, gunDmg: 16, vr: 340, vrn: 210, fov: 1.9 },
    feral:  { hp: 40, spd: 118, spr: 'feral', dmg: 15, gun: 0, gunDmg: 0, vr: 300, vrn: 320, fov: 2.4 },
    ghost:  { hp: 24, spd: 92, spr: 'ghost', dmg: 12, gun: 0, gunDmg: 0, vr: 320, vrn: 340, fov: 2.6 },
    // 掠夺者：不打人，专门烧据点。带 3 个燃烧瓶，扔完就转近战/撤。
    looter: { hp: 46, spd: 100, spr: 'looter', dmg: 8, gun: 0, gunDmg: 0, vr: 330, vrn: 300, fov: 2.0 }
  };

  E.spawnEnemy = function (S, x, y, kind, opts) {
    var K = KINDS[kind] || KINDS.bandit;
    opts = opts || {};
    var gun = K.gun > 0 && opts.gun !== false && DW.chance(K.gun);
    var e = {
      x: x, y: y, r: 12, kind: kind, spr: K.spr, ghost: kind === 'ghost',
      hp: opts.hp || K.hp, maxhp: opts.hp || K.hp, spd: K.spd * (opts.spdMul || 1),
      dmg: K.dmg, hasGun: gun, gunDmg: K.gunDmg, vr: K.vr, vrn: K.vrn, fov: K.fov,
      face: DW.rand(0, Math.PI * 2), alert: 0, state: 'wander',
      wx: x, wy: y, lastKnown: { x: x, y: y }, atkCd: DW.rand(0.3, 1),
      aiming: 0, hit: 0, dead: false, friendly: false, home: opts.home || null,
      raid: !!opts.raid, slow: 0, lost: 0, discovered: false
    };
    if (kind === 'ghost') e.life = DW.rand(9, 16);
    if (kind === 'looter') e.molotovs = opts.molotovs === undefined ? 3 : opts.molotovs;
    S.enemies.push(e);
    return e;
  };

  E.spawnGhost = function (S) {
    var P = S.player, a = DW.rand(0, 6.28), d = DW.rand(120, 220);
    var x = P.x + Math.cos(a) * d, y = P.y + Math.sin(a) * d;
    if (DW.collide(x, y, 12)) return;
    E.spawnEnemy(S, x, y, 'ghost', { hp: 24 });
    DW.ui.toast('你看见了什么……', 'warn');
  };

  E.damageEnemy = function (S, e, dmg, how, ang) {
    if (e.dead) return;
    e.hp -= dmg;
    e.hit = 0.25;
    DW.sfx.hit();
    e.alert = 1;
    e.lastKnown = { x: S.player.x, y: S.player.y };
    e.state = 'chase'; e.lost = 0;
    if (ang !== undefined) { e.x += Math.cos(ang) * 6; e.y += Math.sin(ang) * 6; }
    S.pops.push({ x: e.x, y: e.y - 22, txt: Math.round(dmg), life: 0.8, col: how === 'shot' ? '#f0dc9a' : '#e2c1a0' });
    S.decals.push({ x: e.x, y: e.y, r: DW.rand(3, 7), a: DW.rand(0, 3), life: 30, max: 30, col: 'rgba(120,25,20,.8)' });
    if (e.hp <= 0) killEnemy(S, e);
  };

  function killEnemy(S, e) {
    e.dead = true;
    e.hp = 0;
    S.player.kills++;
    for (var i = 0; i < 6; i++) {
      S.decals.push({ x: e.x + DW.rand(-14, 14), y: e.y + DW.rand(-10, 10), r: DW.rand(4, 11), a: DW.rand(0, 3), life: 45, max: 45, col: 'rgba(110,20,18,.75)' });
    }
    if (e.ghost) { DW.ui.toast('幻觉散开了', 'warn'); return; }
    if (e.post !== undefined && e.post !== null) {
      var T = DW.world.towers[e.post];
      if (T) { T.guardsLeft = Math.max(0, (T.guardsLeft === undefined ? T.guards : T.guardsLeft) - 1); }
    }
    var drops = [];
    if (e.hasGun) drops.push(DW.chance(0.5) ? ['pistol', 1] : ['ammo', DW.randInt(4, 10)]);
    drops.push(['ammo', DW.randInt(0, 6)]);
    drops.push(['metal', DW.randInt(0, 2)]);
    drops.push(['cloth', DW.randInt(0, 2)]);
    drops.push(['food', DW.randInt(0, 2)]);
    drops.push(['bandage', DW.randInt(0, 1)]);
    if (e.kind === 'guard') drops.push(['metal', DW.randInt(1, 3)]);
    if (e.kind === 'feral') drops.push(['rawfood', DW.randInt(1, 2)]);
    if (e.kind === 'looter') drops.push(['cloth', DW.randInt(1, 3)], ['metal', DW.randInt(0, 2)]);
    for (var d = 0; d < drops.length; d++) {
      if (!drops[d][1]) continue;
      S.drops.push({ x: e.x + DW.rand(-18, 18), y: e.y + DW.rand(-18, 18), k: drops[d][0], n: drops[d][1] });
    }
    DW.ui.toast('击杀了' + enemyName(e), 'good');
    S.player.sanity = DW.clamp(S.player.sanity - 2.5, 0, 100);
    E.noise(S, e.x, e.y, 200, 0.8);
  }
  function enemyName(e) {
    return e.kind === 'guard' ? '据点守卫' : (e.kind === 'feral' ? '林中的疯子' :
      (e.kind === 'ghost' ? '幻觉' : (e.kind === 'looter' ? '掠夺者' : '匪徒')));
  }
  E.enemyName = enemyName;

  E.noise = function (S, x, y, r, strength) {
    if (S.weather === 'rain') r *= 0.8; // 雨声盖过脚步
    for (var i = 0; i < S.enemies.length; i++) {
      var e = S.enemies[i];
      if (e.dead) continue;
      if (DW.dist(x, y, e.x, e.y) > r) continue;
      if (e.alert < strength) {
        e.alert = Math.max(e.alert, strength);
        e.lastKnown = { x: x, y: y };
        if (e.alert > 0.4 && e.state === 'wander') e.state = 'investigate';
      }
    }
  };

  function nearestWallTarget(e, S) {
    var P = S.player, best = null, bd = 1e9;
    for (var i = 0; i < S.world_.structures.length; i++) {
      var st = S.world_.structures[i];
      if (st.type !== 'wall' || st.stat) continue;
      if (!DW.isOutside(st.tx * TS + 20, st.ty * TS + 20)) continue;
      var d = DW.dist(e.x, e.y, (st.tx + .5) * TS, (st.ty + .5) * TS);
      if (d < bd) { bd = d; best = st; }
    }
    return best;
  }

  // 掠夺者的目标：玩家自己建的东西（不含天生废墟）
  var BURNABLE = { wall: 1, gate: 1, spike: 1, fire: 1, lamp: 1, floor: 1 };
  function nearestBuilt(e, S) {
    var best = null, bd = 1e9, list = S.world_.structures;
    for (var i = 0; i < list.length; i++) {
      var st = list[i];
      if (st.stat || !BURNABLE[st.type]) continue;
      var d = DW.dist(e.x, e.y, (st.tx + 0.5) * TS, (st.ty + 0.5) * TS);
      if (d < bd) { bd = d; best = st; }
    }
    return best;
  }

  function throwMolotov(S, e, st) {
    e.molotovs--;
    e.atkCd = DW.rand(4.5, 6.5); // 扔一瓶看一会儿，不连珠炮
    var tx = (st.tx + 0.5) * TS + DW.rand(-14, 14), ty = (st.ty + 0.5) * TS + DW.rand(-14, 14);
    var d = DW.dist(e.x, e.y, tx, ty) || 1;
    S.bombs.push({
      ox: e.x, oy: e.y, px: e.x, py: e.y, tx: tx, ty: ty,
      t: 0, dur: Math.max(0.35, d / 260), pz: 0
    });
    E.noise(S, e.x, e.y, 150, 0.5);
    DW.sfx.swing();
    if (DW.dist(S.player.x, S.player.y, tx, ty) < 620) DW.ui.toast('有人朝你的墙扔了个瓶子！', 'bad');
  }

  E.updateBombs = function (S, dt) {
    for (var i = S.bombs.length - 1; i >= 0; i--) {
      var b = S.bombs[i];
      b.t += dt;
      var k = Math.min(1, b.t / b.dur);
      b.px = DW.lerp(b.ox, b.tx, k);
      b.py = DW.lerp(b.oy, b.ty, k);
      b.pz = Math.sin(k * Math.PI); // 抛物线高度，渲染用
      if (k >= 1) { E.startFire(S, b.tx, b.ty); S.bombs.splice(i, 1); }
    }
  };

  // ---------- 火 ----------
  // 一场火最多 5 处：再多就不是「快去扑火」而是「这局没了」
  E.FIRE_MAX = 5;
  E.startFire = function (S, x, y) {
    if (S.fires.length >= E.FIRE_MAX) return null;
    S.fires.push({ x: x, y: y, life: DW.rand(8, 13), max: 12, r: DW.rand(30, 44), tick: DW.rand(0.2, 0.7) });
    S.shake = Math.max(S.shake, 0.25);
    DW.sfx.whoosh();
    E.noise(S, x, y, 260, 0.9);
  };

  // 浇水：手里有水就能扑灭身边的火，玩家得有反制手段
  E.douse = function (S) {
    var P = S.player, n = 0;
    for (var i = S.fires.length - 1; i >= 0; i--) {
      if (DW.dist(P.x, P.y, S.fires[i].x, S.fires[i].y) < 150) { S.fires.splice(i, 1); n++; }
    }
    if (n) { DW.sfx.douse(); DW.ui.toast('扑灭了 ' + n + ' 处火', 'good'); }
    return n;
  };

  E.updateFires = function (S, dt) {
    var P = S.player, rain = S.weather === 'rain';
    for (var i = S.fires.length - 1; i >= 0; i--) {
      var f = S.fires[i];
      // 下雨直接浇灭：火活不过第一秒
      if (rain) { S.fires.splice(i, 1); continue; }
      f.life -= dt;
      f.tick -= dt;
      if (f.tick <= 0) {
        f.tick = 0.7; // 所有伤害都按这个节奏走，否则几处火会把间隔压成每帧一次
        // 烧到附近的自建结构：一段木墙能扛住一瓶子，前提是你去扑
        var list = S.world_.structures;
        for (var j = 0; j < list.length; j++) {
          var st = list[j];
          if (st.stat || !BURNABLE[st.type]) continue;
          var d = DW.dist(f.x, f.y, (st.tx + 0.5) * TS, (st.ty + 0.5) * TS);
          if (d > f.r + 16) continue;
          st.hp -= 5;
          st.flash = 0.3;
          if (st.hp <= 0) {
            DW.deconstruct(st);
            DW.ui.toast('一段' + (DW.BUILD[st.type] ? DW.BUILD[st.type].name : '建筑') + '烧塌了！', 'bad');
          }
        }
        // 玩家站在火上：够疼，但留给你跑开／浇水的时间
        if (DW.dist(P.x, P.y, f.x, f.y) < f.r * 0.8 && P.invuln <= 0) {
          E.hurtPlayer(S, 6, '烧伤');
          P.sanity = DW.clamp(P.sanity - 1, 0, 100);
        }
        // 火会往旁边爬一格（只爬向可燃建筑，不无限扩散）
        if (f.life > 4 && S.fires.length < 4 && DW.chance(0.12)) {
          var nx = f.x + DW.rand(-1, 1) * f.r, ny = f.y + DW.rand(-1, 1) * f.r;
          if (nearestFireTarget(S, nx, ny)) E.startFire(S, nx, ny);
        }
      }
      if (f.life <= 0) S.fires.splice(i, 1);
    }
  };

  function nearestFireTarget(S, x, y) {
    var list = S.world_.structures;
    for (var j = 0; j < list.length; j++) {
      var st = list[j];
      if (st.stat || !BURNABLE[st.type]) continue;
      if (DW.dist(x, y, (st.tx + 0.5) * TS, (st.ty + 0.5) * TS) < 34) return st;
    }
    return null;
  }

  E.updateEnemies = function (S, dt) {
    var P = S.player, night = DW.isNight(S.time.minutes);
    for (var i = S.enemies.length - 1; i >= 0; i--) {
      var e = S.enemies[i];
      if (e.dead) {
        if (e.removeAt === undefined) e.removeAt = S.t + 8;
        if (S.t > e.removeAt) S.enemies.splice(i, 1);
        continue;
      }
      e.hit = Math.max(0, e.hit - dt);
      e.atkCd = Math.max(0, e.atkCd - dt);
      e.aiming = Math.max(0, e.aiming - dt);
      e.slow = Math.max(0, e.slow - dt);
      if (e.life !== undefined) { e.life -= dt; if (e.life <= 0) { e.dead = true; continue; } }

      var d = DW.dist(e.x, e.y, P.x, P.y);
      var vr = night ? e.vrn : e.vr;
      if (P.lantern && night) vr *= 1.25;
      if (P.sprint) vr *= 1.15;
      if (S.weather === 'rain') vr *= 0.85; // 雨幕挡视线
      if (e.ghost && P.sanity < 40) vr *= 1.35;
      var angToP = Math.atan2(P.y - e.y, P.x - e.x);
      var inCone = Math.abs(DW.angleDiff(angToP, e.face)) < (e.alert > 0.6 ? 3.2 : e.fov);
      var canSee = d < vr && P.hp > 0 && inCone && DW.hasLOS(e.x, e.y, P.x, P.y);

      if (canSee) {
        e.alert = Math.min(1, e.alert + dt * (e.alert > 0.5 ? 1.9 : 1.1) * (d < vr * 0.5 ? 1.4 : 0.85));
        e.lastKnown = { x: P.x, y: P.y };
        e.lost = 0;
        if (e.alert > 0.72) e.state = 'chase';
        else if (e.state === 'wander') e.state = 'investigate';
        if (!e.discovered && !e.ghost) {
          e.discovered = true;
          if (!S.flags.announced) { S.flags.announced = true; DW.ui.toast('你被发现了！', 'bad'); }
        }
      } else {
        e.alert = Math.max(0, e.alert - dt * 0.18);
        e.lost += dt;
        if (e.alert < 0.2 && e.state !== 'wander') { e.state = 'wander'; e.discovered = false; S.flags.announced = false; }
      }

      var spd = e.spd * (e.slow > 0 ? 0.5 : 1);
      if (e.kind === 'feral' && !night) spd *= 0.6;

      // 掠夺者的正事是放火：只要兜里还有瓶子就直奔你自建的东西，
      // 夜袭时哪怕完全没看见你也会绕到墙边点火（扔完才转近战）。
      if (e.kind === 'looter' && e.molotovs > 0) {
        var burn = nearestBuilt(e, S);
        if (burn) {
          var ax = (burn.tx + 0.5) * TS, ay = (burn.ty + 0.5) * TS;
          e.face = Math.atan2(ay - e.y, ax - e.x);
          if (DW.dist(e.x, e.y, ax, ay) < 205) {
            if (e.atkCd <= 0) throwMolotov(S, e, burn);
          } else if (!DW.approach(e, ax, ay, spd, dt)) {
            e.stuck = (e.stuck || 0) + dt;
            if (e.stuck > 2.4) { // 被树或自家墙卡住：换个方向蹭一下
              e.stuck = 0;
              var ja = DW.rand(0, 6.28);
              DW.approach(e, e.x + Math.cos(ja) * 90, e.y + Math.sin(ja) * 90, spd, dt);
            }
          } else e.stuck = 0;
          continue;
        }
      }

      if (e.state === 'chase') {
        var tgt = canSee ? { x: P.x, y: P.y } : e.lastKnown;
        e.face = Math.atan2(tgt.y - e.y, tgt.x - e.x) + Math.sin(S.t * 2 + i) * 0.1;
        var keep = e.hasGun ? 145 : 26;
        var moveIn = !(e.hasGun && canSee && d < keep + 40);
        if (moveIn && d > 24) {
          if (!DW.approach(e, tgt.x, tgt.y, spd, dt)) e.stuck = (e.stuck || 0) + dt;
          else e.stuck = 0;
        } else e.stuck = 0;
        // 被墙挡住太久：绕着找缺口，别站桩
        if (e.stuck > 2.2 && !canSee) {
          e.stuck = 0;
          e.alert = Math.min(e.alert, 0.55);
          e.state = 'investigate';
          var aa = DW.rand(0, 6.28);
          e.lastKnown = { x: e.x + Math.cos(aa) * 150, y: e.y + Math.sin(aa) * 150 };
        }

        if (e.hasGun) {
          if (d < 300 && canSee && e.atkCd <= 0) {
            e.atkCd = DW.rand(1.3, 2.5);
            e.aiming = 0.35;
            var spread = 0.15 + (P.sprint ? 0.1 : 0) + (d > 200 ? 0.09 : 0);
            var a2 = angToP + (Math.random() - 0.5) * spread * 2;
            E.bullet(S, e.x + Math.cos(a2) * 16, e.y + Math.sin(a2) * 16, a2, { dmg: e.gunDmg, range: 420 }, false);
            S.flash = { x: e.x + Math.cos(a2) * 18, y: e.y + Math.sin(a2) * 18, t: 0.08 };
            DW.sfx.shot(false);
            E.noise(S, e.x, e.y, 300, 1);
          }
        } else if (d < 30 && e.atkCd <= 0) {
          e.atkCd = 1.25;
          E.hurtPlayer(S, e.dmg, enemyName(e));
        }

        // 拆挡路的墙
        var fx = Math.floor((e.x + Math.cos(e.face) * 26) / TS);
        var fy = Math.floor((e.y + Math.sin(e.face) * 26) / TS);
        var wall = DW.s(fx, fy);
        if (wall && (wall.type === 'wall' || wall.type === 'gate' || wall.type === 'spike') && !wall.stat) {
          if (wall.type === 'gate' && wall.open) { wall.open = false; DW.rebuildFlags(); }
          else if (e.atkCd <= 0) {
            e.atkCd = 0.9;
            wall.hp -= e.hasGun ? 7 : 13;
            wall.flash = 0.3;
            E.noise(S, e.x, e.y, 120, 0.5);
            if (wall.hp <= 0) { DW.deconstruct(wall); DW.sfx.collapse(); DW.ui.toast('一段围墙被拆了！', 'bad'); }
          }
        } else if (e.raid && d > 240) {
          var w2 = nearestWallTarget(e, S);
          if (w2) DW.approach(e, (w2.tx + .5) * TS, (w2.ty + .5) * TS, spd * 0.9, dt);
        }
      } else if (e.state === 'investigate') {
        DW.approach(e, e.lastKnown.x, e.lastKnown.y, spd * 0.72, dt);
        e.face = Math.atan2(e.lastKnown.y - e.y, e.lastKnown.x - e.x);
        if (DW.dist(e.x, e.y, e.lastKnown.x, e.lastKnown.y) < 26) {
          e.state = 'wander';
          e.wx = e.x + DW.rand(-90, 90); e.wy = e.y + DW.rand(-90, 90);
        }
      } else {
        var bx, by;
        if (e.home) { bx = (e.home.tx + 0.5) * TS; by = (e.home.ty + 0.5) * TS; }
        else { bx = e.x; by = e.y; }
        if (DW.dist(e.x, e.y, e.wx, e.wy) < 26 || e.wanderInit === undefined) {
          e.wanderInit = true;
          e.wx = bx + DW.rand(-180, 180); e.wy = by + DW.rand(-180, 180);
          if (e.raid) { e.wx = DW.world.hut.tx * TS; e.wy = DW.world.hut.ty * TS; }
        }
        DW.approach(e, e.wx, e.wy, spd * 0.4, dt);
        e.face = Math.atan2(e.wy - e.y, e.wx - e.x);
      }

      // 陷阱
      var stp = DW.s(Math.floor(e.x / TS), Math.floor(e.y / TS));
      if (stp && stp.type === 'spike' && !stp.busy) {
        stp.busy = true;
        stp._timer = setTimeout(function (o) { return function () { o.busy = false; }; }(stp), 2500);
        E.damageEnemy(S, e, 24, 'shot', 0);
        e.slow = 3;
        stp.hp -= 14;
        if (stp.hp <= 0) DW.deconstruct(stp);
      }

      // 白天普通匪徒不主动贴脸
      if (!night && e.kind === 'bandit' && !e.raid && e.alert < 0.35 && d < 150) {
        var away = Math.atan2(e.y - P.y, e.x - P.x);
        DW.approach(e, e.x + Math.cos(away) * 120, e.y + Math.sin(away) * 120, spd * 0.5, dt);
      }
    }
  };

  E.give = function (S, k, n) {
    if (!n) return;
    var it = DW.ITEMS[k];
    if (!it) return;
    var P = S.player;
    if (it.kind === 'weapon') {
      if (P.weapons.indexOf(k) < 0) {
        P.weapons.push(k);
        DW.ui.toast('获得 ' + it.name + '（背包里可切换）', 'good');
      } else {
        P.inv.wood += 2;
        DW.ui.toast(it.name + ' 已有，拆成 +2 木材');
      }
      return;
    }
    if (it.kind === 'ammo') { P.ammo[k] = (P.ammo[k] | 0) + n; return; }
    P.inv[k] = (P.inv[k] | 0) + n;
  };

  E.use = function (S, k) {
    var it = DW.ITEMS[k];
    if (!it || !it.use) return false;
    var P = S.player;
    if ((P.inv[k] | 0) <= 0) return false;
    P.inv[k]--;
    for (var key in it.use) {
      var v = it.use[key];
      if (key === 'hp') P.hp = DW.clamp(P.hp + v, 0, 100);
      else if (key === 'food') P.food = DW.clamp(P.food + v, 0, 100);
      else if (key === 'water') P.water = DW.clamp(P.water + v, 0, 100);
      else if (key === 'energy') P.energy = DW.clamp(P.energy + v, 0, 100);
      else if (key === 'sanity') P.sanity = DW.clamp(P.sanity + v, 0, 100);
    }
    DW.ui.toast('用了 ' + it.name, 'good');
    if (k === 'water') E.douse(S); // 一水两用：解渴还是灭火，玩家自己选
    return true;
  };

  E.cook = function (S) {
    var P = S.player;
    if ((P.inv.rawfood | 0) > 0 && DW.nearStruct(P.x, P.y, ['fire'], 90)) {
      P.inv.rawfood--; P.inv.cooked++;
      DW.ui.toast('烤好了：+1 熟肉', 'good');
      return true;
    }
    return false;
  };
})(window);
