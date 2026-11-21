/* 暗林 · 幸存夜 — 基础工具 / 常量 / 物品表 */
(function (global) {
  'use strict';

  var DW = global.DW = global.DW || {};

  // ---------- 常量 ----------
  DW.TILE = 40;
  DW.MAP_W = 112;
  DW.MAP_H = 112;
  DW.MIN_PER_SEC = 6;         // 真实1秒 = 游戏6分钟 -> 一天约4分钟
  DW.DAY_START = 7 * 60;
  DW.NIGHT_START = 20 * 60;
  DW.NIGHT_END = 6 * 60;
  DW.SAVE_KEY = 'anlin_darkwood_save_v1';

  // 地表类型
  DW.G = { GRASS: 0, DIRT: 1, WATER: 2, ROCK: 3, TREE: 4, RUIN: 5, FLOOR: 6, BUSH: 7 };
  var G = DW.G;
  DW.SOLID_GROUND = {};
  DW.SOLID_GROUND[G.WATER] = true; DW.SOLID_GROUND[G.ROCK] = true;
  DW.SOLID_GROUND[G.TREE] = true; DW.SOLID_GROUND[G.RUIN] = true;

  // ---------- 数学 ----------
  DW.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  DW.lerp = function (a, b, t) { return a + (b - a) * t; };
  DW.dist = function (ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); };
  DW.dist2 = function (ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
  DW.angleTo = function (ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); };
  DW.angleDiff = function (a, b) {
    var d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  };
  DW.rand = function (a, b) { return a + Math.random() * (b - a); };
  DW.randInt = function (a, b) { return Math.floor(a + Math.random() * (b - a + 1)); };
  DW.pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
  DW.chance = function (p) { return Math.random() < p; };

  // ---------- 种子随机 + 值噪声 ----------
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  DW.mulberry32 = mulberry32;

  function hash2(x, y, seed) {
    var h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1274126177);
    h = (h ^ (h >>> 13)) | 0;
    h = Math.imul(h, 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function vnoise(x, y, seed) {
    var x0 = Math.floor(x), y0 = Math.floor(y);
    var fx = smooth(x - x0), fy = smooth(y - y0);
    var a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed);
    var c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed);
    return DW.lerp(DW.lerp(a, b, fx), DW.lerp(c, d, fx), fy);
  }
  DW.vnoise = vnoise;
  DW.fbm = function (x, y, oct, seed) {
    var v = 0, amp = 0.5, f = 1, norm = 0;
    for (var i = 0; i < oct; i++) {
      v += vnoise(x * f, y * f, seed + i * 101) * amp;
      norm += amp; amp *= 0.5; f *= 2;
    }
    return v / norm;
  };

  // ---------- 物品 ----------
  // kind: res(材料) consum(消耗品) weapon(武器) ammo(弹药) key(任务)
  DW.ITEMS = {
    wood:     { name: '木材',     kind: 'res',   ico: '🪵', desc: '砍树获得，建造的基础。' },
    plank:    { name: '木板',     kind: 'res',   ico: '▬', desc: '更结实的建材。' },
    metal:    { name: '金属零件', kind: 'res',   ico: '⚙', desc: '修电台、做陷阱。' },
    cloth:    { name: '布条',     kind: 'res',   ico: '≋', desc: '包扎伤口。' },
    food:     { name: '罐头',     kind: 'consum', ico: '🥫', desc: '+34 饥饿。', use: { food: 34 } },
    rawfood:  { name: '生肉',     kind: 'consum', ico: '✚', desc: '生吃有风险，篝火烤熟更好。', use: { food: 12, sanity: -3, hp: -3 } },
    cooked:   { name: '熟肉',     kind: 'consum', ico: '🍖', desc: '+44 饥饿 +6 理智。', use: { food: 44, sanity: 6 } },
    water:    { name: '水',       kind: 'consum', ico: '💧', desc: '+38 口渴。', use: { water: 38 } },
    meds:     { name: '药品',     kind: 'consum', ico: '✚', desc: '+30 生命 +12 理智。', use: { hp: 30, sanity: 12 } },
    bandage:  { name: '绷带',     kind: 'consum', ico: '十', desc: '+14 生命。', use: { hp: 14 } },
    beer:     { name: '罐装啤酒', kind: 'consum', ico: '🍺', desc: '+18 理智，-8 体力。', use: { sanity: 18, energy: -8, water: -6 } },
    ammo:     { name: '子弹',     kind: 'ammo',  ico: '·', desc: '手枪子弹。' },
    shells:   { name: '霰弹',     kind: 'ammo',  ico: '◍', desc: '霰弹枪子弹。' },
    fist:     { name: '拳头',     kind: 'weapon', ico: 'o', dmg: 8, spd: .42, stam: 2, range: 34, arc: 1.5,
                desc: '徒手，最安静，也最没用。' },
    bat:      { name: '木球棒',   kind: 'weapon', ico: '/\\', dmg: 26, spd: .55, stam: 7, range: 48, arc: 1.5,
                desc: '近战，安静。' },
    knife:    { name: '猎刀',     kind: 'weapon', ico: '✦', dmg: 18, spd: .32, stam: 4, range: 38, arc: 1.2,
                desc: '快，伤害低。' },
    axe:      { name: '斧头',     kind: 'weapon', ico: '⚒', dmg: 38, spd: .8, stam: 11, range: 46, arc: 1.3, chop: 2,
                desc: '重，砍树更快。' },
    pistol:   { name: '手枪',     kind: 'weapon', ico: '▐', dmg: 34, spd: .42, range: 420, ammo: 'ammo', shots: 1, spread: .06, loud: 340,
                desc: '远程，枪声会招人来。' },
    shotgun:  { name: '霰弹枪',   kind: 'weapon', ico: '▐▐', dmg: 15, spd: .9, range: 210, ammo: 'shells', shots: 5, spread: .22, loud: 420,
                desc: '近距离撕碎一切。' },
    rifle:    { name: '猎枪',     kind: 'weapon', ico: '▬▐', dmg: 46, spd: 1.0, range: 520, ammo: 'ammo', shots: 1, spread: .03, loud: 400,
                desc: '远、准、响。' },
    part:     { name: '电台零件', kind: 'key',   ico: '★', desc: '修好电台的关键，共 3 个。' }
  };

  DW.BUILD = {
    wall:  { name: '木墙',   cost: { wood: 3 },          hp: 90,  solid: true,  desc: '围住据点，夜里能挡人。' },
    gate:  { name: '木门',   cost: { wood: 4, metal: 1 }, hp: 70, solid: true,  desc: '可按互动键开合。' },
    floor: { name: '木地板', cost: { wood: 1 },          hp: 40,  solid: false, desc: '铺设通道，看着整齐。' },
    fire:  { name: '篝火',   cost: { wood: 4 },          hp: 60,  solid: false, light: 170, desc: '照明 + 把生肉烤成熟肉。' },
    spike: { name: '木陷阱', cost: { wood: 5, metal: 1 }, hp: 40, solid: false, trap: true, desc: '踩中的人流血减速。' },
    lamp:  { name: '油灯桩', cost: { metal: 2, cloth: 1 }, hp: 50, solid: false, light: 220, desc: '大范围照明。' }
  };

  DW.LOOT_TABLE = [
    ['wood', 4, .22], ['plank', 3, .14], ['metal', 2, .16], ['cloth', 3, .18],
    ['food', 2, .20], ['water', 2, .22], ['ammo', 8, .16], ['shells', 4, .10],
    ['bandage', 2, .16], ['meds', 1, .10], ['beer', 2, .10], ['rawfood', 2, .12],
    ['knife', 1, .05], ['bat', 1, .05], ['axe', 1, .035], ['pistol', 1, .04], ['shotgun', 1, .025], ['rifle', 1, .02]
  ];

  // ---------- 存档 ----------
  DW.save = function (data) {
    try { localStorage.setItem(DW.SAVE_KEY, JSON.stringify(data)); return true; }
    catch (e) { return false; }
  };
  DW.load = function () {
    try {
      var s = localStorage.getItem(DW.SAVE_KEY);
      return s ? JSON.parse(s) : null;
    } catch (e) { return null; }
  };
  DW.hasSave = function () { try { return !!localStorage.getItem(DW.SAVE_KEY); } catch (e) { return false; } };
  DW.clearSave = function () { try { localStorage.removeItem(DW.SAVE_KEY); } catch (e) {} };

  DW.newInv = function () {
    return { wood: 0, plank: 0, metal: 0, cloth: 0, food: 0, water: 0, bandage: 0, meds: 0,
             beer: 0, rawfood: 0, cooked: 0, ammo: 0, shells: 0, part: 0 };
  };
})(window);
