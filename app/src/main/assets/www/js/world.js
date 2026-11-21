/* 暗林 · 幸存夜 — 世界生成 / 碰撞 / 视线 / 区域判定 */
(function (global) {
  'use strict';
  var DW = global.DW, G = DW.G;

  var W = DW.MAP_W, H = DW.MAP_H, TS = DW.TILE;

  var world = DW.world = {
    w: W, h: H, seed: 0,
    ground: null, sight: null, pass: null, explored: null,
    structures: [], sMap: {},
    containers: [], towers: [], hut: null,
    partsTotal: 3, repairDone: false, rescueNight: 0,
    variant: null
  };

  function idx(tx, ty) { return ty * W + tx; }
  DW.idx = idx;
  DW.tileOf = function (x, y) { return { tx: Math.floor(x / TS), ty: Math.floor(y / TS) }; };
  DW.groundAt = function (tx, ty) {
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) return G.WATER;
    return world.ground[idx(tx, ty)];
  };
  DW.s = function (tx, ty) {
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) return null;
    return world.sMap[idx(tx, ty)] || null;
  };

  // ---------- 生成 ----------
  DW.genWorld = function (seed) {
    seed = seed >>> 0;
    world.seed = seed;
    var rnd = DW.mulberry32(seed);
    var gr = new Uint8Array(W * H);
    world.ground = gr;

    var hut = { tx: Math.floor(W / 2), ty: Math.floor(H / 2) };
    world.hut = hut;

    // 1) 基础地表
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var i = idx(x, y);
        var n = DW.fbm(x * 0.045, y * 0.045, 4, seed);
        var wn = DW.fbm(x * 0.022 + 40, y * 0.022 + 90, 3, seed + 771);
        var rn = DW.fbm(x * 0.07 + 300, y * 0.07 + 20, 2, seed + 1337);
        var t = G.GRASS;
        if (n > 0.585) t = G.TREE;
        else if (n > 0.505) { t = rnd() < 0.58 ? G.TREE : G.BUSH; }
        else if (n < 0.35) t = G.DIRT;
        if (wn > 0.735) t = G.WATER;
        else if (wn > 0.712 && t === G.GRASS) t = G.DIRT;
        if (rn > 0.815 && t !== G.WATER) t = G.ROCK;
        gr[i] = t;
      }
    }

    // 边缘封死（防止跑出森林）
    for (var e = 0; e < 4; e++) {
      for (var k = 0; k < Math.max(W, H); k++) {
        gr[idx(k, e)] = G.TREE; gr[idx(k, H - 1 - e)] = G.TREE;
        gr[idx(e, k)] = G.TREE; gr[idx(W - 1 - e, k)] = G.TREE;
      }
    }

    // 2) 空地（carve）
    function carve(cx, cy, r, toType, clearAll) {
      for (var y = cy - r; y <= cy + r; y++) {
        for (var x = cx - r; x <= cx + r; x++) {
          if (x < 3 || y < 3 || x >= W - 3 || y >= H - 3) continue;
          var d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
          if (d > r) continue;
          var i = idx(x, y);
          if (clearAll || gr[i] === G.TREE || gr[i] === G.BUSH || gr[i] === G.ROCK) {
            if (gr[i] === G.WATER) continue;
            gr[i] = (toType === undefined) ? G.DIRT : toType;
          }
        }
      }
    }

    // 3) 小屋
    carve(hut.tx, hut.ty, 6, G.DIRT, true);
    for (var yy = hut.ty - 2; yy <= hut.ty + 2; yy++)
      for (var xx = hut.tx - 2; xx <= hut.tx + 2; xx++) gr[idx(xx, yy)] = G.FLOOR;

    world.structures = []; world.sMap = {};
    function addS(tx, ty, type, hp) {
      if (tx < 1 || ty < 1 || tx >= W - 1 || ty >= H - 1) return null;
      var st = { tx: tx, ty: ty, type: type, hp: hp, maxhp: hp, open: false, stat: false, flash: 0 };
      world.structures.push(st); world.sMap[idx(tx, ty)] = st;
      return st;
    }
    // 小屋残墙：留 2 个缺口，玩家得自己补
    var gaps = [];
    for (var d2 = 0; d2 < 2; d2++) gaps.push(DW.randInt(0, 15));
    var wallTiles = [];
    for (var oy = -2; oy <= 2; oy++) {
      for (var ox = -2; ox <= 2; ox++) {
        if (Math.abs(ox) !== 2 && Math.abs(oy) !== 2) continue;
        wallTiles.push([hut.tx + ox, hut.ty + oy]);
      }
    }
    for (var wi = 0; wi < wallTiles.length; wi++) {
      var isGap = gaps.indexOf(wi) >= 0;
      var s = addS(wallTiles[wi][0], wallTiles[wi][1], 'wall', 220);
      if (s) { s.stat = true; if (isGap) { removeS(s); } }
    }
    function removeS(st) {
      var n = world.structures.indexOf(st);
      if (n >= 0) world.structures.splice(n, 1);
      delete world.sMap[idx(st.tx, st.ty)];
    }
    DW._removeS = removeS;
    DW._addS = addS;

    // 小屋家具：床 / 电台 / 木箱
    var bed = addS(hut.tx - 1, hut.ty - 1, 'bed', 999); if (bed) bed.stat = true;
    var radio = addS(hut.tx + 1, hut.ty + 1, 'radio', 999); if (radio) radio.stat = true;
    var hb = addContainer(hut.tx * TS + TS / 2 + 8, (hut.ty) * TS + TS / 2 + 14, 'crate', '屋里的木箱');
    hb.items = [{ k: 'food', n: 2 }, { k: 'water', n: 2 }, { k: 'wood', n: 6 }, { k: 'bandage', n: 2 }];
    var hc = addContainer((hut.tx + 1) * TS + TS / 2, (hut.ty - 2) * TS - 6, 'backpack', '树下的背包');
    hc.items = [{ k: 'bat', n: 1 }, { k: 'ammo', n: 10 }];

    // 4) 据点（3 个电台零件）
    world.towers = [];
    var names = ['伐木场哨站', '废弃观测塔', '军方检查站'];
    var tries = 0;
    while (world.towers.length < 3 && tries < 600) {
      tries++;
      var tx = DW.randInt(9, W - 10), ty = DW.randInt(9, H - 10);
      var dd = Math.sqrt(Math.pow(tx - hut.tx, 2) + Math.pow(ty - hut.ty, 2));
      if (dd < 24 || dd > 44) continue;
      var tooClose = false;
      for (var q = 0; q < world.towers.length; q++) {
        var t0 = world.towers[q];
        if (Math.sqrt(Math.pow(t0.tx - tx, 2) + Math.pow(t0.ty - ty, 2)) < 18) tooClose = true;
      }
      if (tooClose) continue;
      var tower = { tx: tx, ty: ty, name: names[world.towers.length], cleared: false, guards: 0,
                    container: null };
      world.towers.push(tower);
    }
    for (var ti2 = 0; ti2 < world.towers.length; ti2++) {
      var T = world.towers[ti2];
      carve(T.tx, T.ty, 7, G.DIRT, true);
      // 围栏
      for (var oy2 = -4; oy2 <= 4; oy2++) {
        for (var ox2 = -4; ox2 <= 4; ox2++) {
          if (Math.abs(ox2) !== 4 && Math.abs(oy2) !== 4) continue;
          if (Math.abs(ox2) === 4 && Math.abs(oy2) === 4) continue;
          if (ox2 === 0 && oy2 === 4) continue; // 入口
          var st2 = addS(T.tx + ox2, T.ty + oy2, 'ruinwall', 240);
          if (st2) st2.stat = true;
        }
      }
      for (var fy = -3; fy <= 3; fy++)
        for (var fx = -3; fx <= 3; fx++) gr[idx(T.tx + fx, T.ty + fy)] = G.FLOOR;
      var c = addContainer(T.tx * TS + TS / 2, T.ty * TS + TS / 2, 'locker', T.name + ' · 铁皮柜');
      c.hasPart = true;
      c.items = [{ k: 'part', n: 1 }, { k: 'metal', n: 3 }, { k: 'ammo', n: 18 }, { k: 'meds', n: 1 },
                 { k: 'food', n: 2 }];
      T.container = c;
      // 补给箱
      var c2 = addContainer((T.tx + 2) * TS + TS / 2, (T.ty - 1) * TS + TS / 2, 'crate', T.name + ' · 弹药箱');
      c2.items = [{ k: 'shells', n: 8 }, { k: 'cloth', n: 3 }, { k: DW.pick(['shotgun', 'rifle', 'pistol']), n: 1 }];
      T.guards = 3 + ti2;
    }

    // 5) 废墟空地
    world.containers.length;
    var clearCount = 0, att = 0;
    while (clearCount < 30 && att < 1200) {
      att++;
      var cx = DW.randInt(6, W - 7), cy = DW.randInt(6, H - 7);
      var dc = Math.sqrt(Math.pow(cx - hut.tx, 2) + Math.pow(cy - hut.ty, 2));
      if (dc < 5) continue;
      var near = false;
      for (var tw = 0; tw < world.towers.length; tw++) {
        if (Math.sqrt(Math.pow(cx - world.towers[tw].tx, 2) + Math.pow(cy - world.towers[tw].ty, 2)) < 8) near = true;
      }
      if (near) continue;
      clearCount++;
      var r = DW.randInt(3, 5);
      carve(cx, cy, r, G.DIRT, true);
      if (rnd() < 0.68) {
        // 废墟墙
        var rw = DW.randInt(3, 5), rh = DW.randInt(3, 4);
        var gx = cx - (rw >> 1), gy = cy - (rh >> 1);
        var door = DW.randInt(0, 3);
        for (var oy3 = 0; oy3 < rh; oy3++) {
          for (var ox3 = 0; ox3 < rw; ox3++) {
            var perim = (oy3 === 0 || oy3 === rh - 1 || ox3 === 0 || ox3 === rw - 1);
            if (!perim) { gr[idx(gx + ox3, gy + oy3)] = G.FLOOR; continue; }
            var skip = false;
            if (door === 0 && oy3 === 0 && ox3 === (rw >> 1)) skip = true;
            if (door === 1 && oy3 === rh - 1 && ox3 === (rw >> 1)) skip = true;
            if (door === 2 && ox3 === 0 && oy3 === (rh >> 1)) skip = true;
            if (door === 3 && ox3 === rw - 1 && oy3 === (rh >> 1)) skip = true;
            if (rnd() < 0.22) skip = true; // 塌了
            if (!skip) { var s3 = addS(gx + ox3, gy + oy3, 'ruinwall', 240); if (s3) s3.stat = true; }
            else gr[idx(gx + ox3, gy + oy3)] = G.FLOOR;
          }
        }
        var cnt = DW.randInt(1, 3);
        for (var ci = 0; ci < cnt; ci++) {
          var px = gx + DW.randInt(0, rw - 1), py = gy + DW.randInt(0, rh - 1);
          if (world.sMap[idx(px, py)]) continue;
          addLootContainer(px * TS + TS / 2, py * TS + TS / 2, DW.pick(['crate', 'cupboard', 'barrel', 'locker']));
        }
      } else {
        // 露天藏货
        var oc = DW.randInt(1, 2);
        for (var oi = 0; oi < oc; oi++) {
          var ox4 = cx + DW.randInt(-r, r), oy4 = cy + DW.randInt(-r, r);
          if (DW.SOLID_GROUND[gr[idx(ox4, oy4)]]) continue;
          if (world.sMap[idx(ox4, oy4)]) continue;
          addLootContainer(ox4 * TS + TS / 2, oy4 * TS + TS / 2, DW.pick(['backpack', 'tent', 'car', 'barrel']), true);
        }
      }
    }

    // 6) 道路：小屋 -> 各据点
    for (var rd = 0; rd < world.towers.length; rd++) {
      var TT = world.towers[rd];
      var steps = 400, px2 = hut.tx, py2 = hut.ty;
      for (var sp = 0; sp < steps; sp++) {
        var ddx = TT.tx - px2, ddy = TT.ty - py2;
        var len = Math.sqrt(ddx * ddx + ddy * ddy);
        if (len < 1.2) break;
        px2 += ddx / len + (rnd() - 0.5) * 0.8;
        py2 += ddy / len + (rnd() - 0.5) * 0.8;
        var it = idx(Math.round(px2), Math.round(py2));
        if (gr[it] === G.TREE || gr[it] === G.BUSH || gr[it] === G.ROCK) gr[it] = G.DIRT;
        if (gr[it] !== G.WATER && gr[it] !== G.FLOOR) gr[it] = G.DIRT;
        if (!world.sMap[it] && gr[it] === G.DIRT) { /* noop */ }
      }
    }

    // 7) 初始敌人分布（野外游荡）
    world.spawns = [];
    for (var sw = 0; sw < 26; sw++) {
      var sx = DW.randInt(5, W - 6), sy = DW.randInt(5, H - 6);
      var ds = Math.sqrt(Math.pow(sx - hut.tx, 2) + Math.pow(sy - hut.ty, 2));
      if (ds < 11) continue;
      if (DW.SOLID_GROUND[gr[idx(sx, sy)]] || world.sMap[idx(sx, sy)]) continue;
      world.spawns.push({ x: sx * TS + TS / 2, y: sy * TS + TS / 2, kind: ds < 26 ? 'bandit' : (rnd() < 0.35 ? 'feral' : 'bandit') });
    }
    for (var tg = 0; tg < world.towers.length; tg++) {
      var TG = world.towers[tg];
      for (var gg = 0; gg < TG.guards; gg++) {
        world.spawns.push({ x: (TG.tx + DW.randInt(-3, 3)) * TS + 20, y: (TG.ty + DW.randInt(-3, 3)) * TS + 20,
                            kind: 'guard', home: { tx: TG.tx, ty: TG.ty }, post: tg });
      }
    }

    buildFlags();
    world.explored = new Uint8Array(W * H);
    computeRegions();
    return world;
  };

  function addContainer(x, y, type, label) {
    var c = { x: x, y: y, type: type, label: label, items: [], searched: false, hasPart: false };
    world.containers.push(c);
    return c;
  }
  function addLootContainer(x, y, type, poor) {
    var labels = { crate: '木箱', cupboard: '碗柜', barrel: '铁桶', locker: '铁皮柜', backpack: '背包', tent: '帐篷', car: '废弃汽车' };
    var c = addContainer(x, y, type, labels[type] || '容器');
    c.items = rollLoot(poor ? 2 : 3, poor);
    return c;
  }
  DW.rollLoot = rollLoot;
  function rollLoot(maxItems, poor) {
    var out = [], n = DW.randInt(1, maxItems);
    for (var i = 0; i < n; i++) {
      var tbl = [];
      for (var t = 0; t < DW.LOOT_TABLE.length; t++) {
        var row = DW.LOOT_TABLE[t];
        var isGun = DW.ITEMS[row[0]].kind === 'weapon';
        var isAmmo = row[2] <= 0.16 && (row[0] === 'ammo' || row[0] === 'shells');
        if (poor && (isGun || isAmmo)) continue;
        if (poor && Math.random() < 0.4) continue;
        tbl.push(row);
      }
      var r = DW.pick(tbl), cnt = DW.randInt(1, r[1]);
      for (var q = 0; q < out.length; q++) if (out[q].k === r[0]) { out[q].n += cnt; cnt = 0; break; }
      if (cnt) out.push({ k: r[0], n: cnt });
    }
    return out;
  }

  // ---------- 阻挡 / 视线 / 区域 ----------
  var pass = null, sight = null;
  function buildFlags() {
    pass = world.pass = new Uint8Array(W * H);
    sight = world.sight = new Uint8Array(W * H);
    var gr = world.ground;
    for (var i = 0; i < W * H; i++) {
      var g = gr[i], solid = !!DW.SOLID_GROUND[g];
      sight[i] = (g === G.TREE || g === G.ROCK || g === G.RUIN || g === G.WATER) ? 1 : 0;
      pass[i] = solid ? 0 : 1;
    }
    for (var s = 0; s < world.structures.length; s++) {
      var st = world.structures[s], k = idx(st.tx, st.ty);
      var def = DW.BUILD[st.type];
      var blocks = (st.type === 'wall' || st.type === 'ruinwall' || st.type === 'bed' || st.type === 'radio' ||
                    (st.type === 'gate' && !st.open));
      if (blocks) { pass[k] = 0; }
      if (st.type === 'wall' || st.type === 'ruinwall' || st.type === 'gate' || st.type === 'bed' || st.type === 'radio' || st.type === 'lamp') {
        sight[k] = 1;
      }
      if (st.hp <= 0) { pass[k] = 1; sight[k] = 0; }
    }
  }
  DW.rebuildFlags = function () { buildFlags(); computeRegions(); };

  var region = null;
  DW.regionOf = function (tx, ty) {
    if (!region) return 1;
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) return 0;
    return region[idx(tx, ty)];
  };
  function computeRegions() {
    region = new Uint8Array(W * H); // 0 unknown 1 outside 2 inside
    var q = new Int32Array(W * H), head = 0, tail = 0;
    function push(ix, iy) {
      if (ix < 0 || iy < 0 || ix >= W || iy >= H) return;
      var k = idx(ix, iy);
      if (region[k] || !pass[k]) return;
      region[k] = 1; q[tail++] = k;
    }
    for (var x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
    for (var y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
    while (head < tail) {
      var k2 = q[head++], cx = k2 % W, cy = (k2 / W) | 0;
      push(cx + 1, cy); push(cx - 1, cy); push(cx, cy + 1); push(cx, cy - 1);
    }
    for (var i2 = 0; i2 < W * H; i2++) if (!region[i2]) region[i2] = pass[i2] ? 2 : 0;
    world.region = region;
  }
  DW.isOutside = function (x, y) {
    var tx = Math.floor(x / TS), ty = Math.floor(y / TS);
    return DW.regionOf(tx, ty) === 1;
  };

  DW.blockedAt = function (x, y) {
    var tx = Math.floor(x / TS), ty = Math.floor(y / TS);
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) return true;
    return pass[idx(tx, ty)] === 0;
  };
  // 圆形角色碰撞：按四角+中心采样
  DW.collide = function (x, y, r) {
    if (DW.blockedAt(x, y)) return true;
    var pts = [[x - r, y], [x + r, y], [x, y - r], [x, y + r], [x - r * .7, y - r * .7], [x + r * .7, y + r * .7],
               [x - r * .7, y + r * .7], [x + r * .7, y - r * .7]];
    for (var i = 0; i < pts.length; i++) if (DW.blockedAt(pts[i][0], pts[i][1])) return true;
    return false;
  };
  DW.moveWithCollision = function (o, dx, dy) {
    if (dx) {
      var nx = o.x + dx;
      if (!DW.collide(nx, o.y, o.r)) o.x = nx;
      else { if (!DW.collide(nx, o.y - 2, o.r)) { o.x = nx; o.y -= 2; } else if (!DW.collide(nx, o.y + 2, o.r)) { o.x = nx; o.y += 2; } }
    }
    if (dy) {
      var ny = o.y + dy;
      if (!DW.collide(o.x, ny, o.r)) o.y = ny;
      else { if (!DW.collide(o.x - 2, ny, o.r)) { o.x -= 2; o.y = ny; } else if (!DW.collide(o.x + 2, ny, o.r)) { o.x += 2; o.y = ny; } }
    }
  };
  DW.blockingLine = function (tx, ty) {
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) return true;
    return sight[idx(tx, ty)] === 1;
  };
  DW.hasLOS = function (x0, y0, x1, y1) {
    var d = Math.sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0));
    var steps = Math.max(2, Math.ceil(d / (TS * 0.5)));
    for (var i = 1; i < steps; i++) {
      var t = i / steps;
      var x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      if (DW.blockingLine(Math.floor(x / TS), Math.floor(y / TS))) return false;
    }
    return true;
  };
  // A* 简化：朝目标走，被挡就沿墙滑动；用于围墙上寻路
  DW.approach = function (o, tx, ty, speed, dt) {
    var dx = tx - o.x, dy = ty - o.y;
    var l = Math.sqrt(dx * dx + dy * dy) || 1;
    dx /= l; dy /= l;
    var tries = [[dx, dy], [dx + dy * 0.7, dy - dx * 0.7], [dx - dy * 0.7, dy + dx * 0.7], [dy, -dx], [-dy, dx]];
    for (var i = 0; i < tries.length; i++) {
      var vx = tries[i][0], vy = tries[i][1];
      var nl = Math.sqrt(vx * vx + vy * vy) || 1;
      var nx = o.x + (vx / nl) * speed * dt, ny = o.y + (vy / nl) * speed * dt;
      if (!DW.collide(nx, ny, o.r)) { o.x = nx; o.y = ny; return true; }
    }
    return false;
  };

  DW.reveal = function (x, y, r) {
    var cx = Math.floor(x / TS), cy = Math.floor(y / TS), tr = Math.ceil(r / TS);
    for (var y2 = cy - tr; y2 <= cy + tr; y2++) {
      for (var x2 = cx - tr; x2 <= cx + tr; x2++) {
        if (x2 < 0 || y2 < 0 || x2 >= W || y2 >= H) continue;
        if (Math.sqrt((x2 - cx) * (x2 - cx) + (y2 - cy) * (y2 - cy)) <= tr) world.explored[idx(x2, y2)] = 1;
      }
    }
  };

  DW.placeStructure = function (tx, ty, type) {
    if (tx < 2 || ty < 2 || tx >= W - 2 || ty >= H - 2) return { ok: false, why: '太靠边了' };
    var k = idx(tx, ty);
    if (world.sMap[k]) return { ok: false, why: '这里已经有东西' };
    var g = world.ground[k];
    if (DW.SOLID_GROUND[g]) return { ok: false, why: '地面放不下（先砍树/清石）' };
    var def = DW.BUILD[type];
    var st = DW._addS(tx, ty, type, def.hp);
    st.def = type;
    DW.rebuildFlags();
    return { ok: true, st: st };
  };
  DW.deconstruct = function (st) { if (st.stat) return false; DW._removeS(st); DW.rebuildFlags(); return true; };

  // 最近可互动的结构/容器
  DW.nearStruct = function (x, y, types, r) {
    var best = null, bd = r || (TS * 1.4);
    for (var i = 0; i < world.structures.length; i++) {
      var st = world.structures[i];
      if (types && types.indexOf(st.type) < 0) continue;
      var d = DW.dist(x, y, (st.tx + .5) * TS, (st.ty + .5) * TS);
      if (d < bd) { bd = d; best = st; }
    }
    return best;
  };
  DW.nearContainer = function (x, y, r) {
    var best = null, bd = r || 54;
    for (var i = 0; i < world.containers.length; i++) {
      var c = world.containers[i];
      if (c.searched && (!c.items || !c.items.length)) continue;
      var d = DW.dist(x, y, c.x, c.y);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  };
})(window);
