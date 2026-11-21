/* 暗林 · 幸存夜 — 输入 / HUD / 面板 */
(function (global) {
  'use strict';
  var DW = global.DW, TS = DW.TILE;
  var ui = DW.ui = {};
  var S = null;
  var el = {};
  var layers = ['Menu', 'End', 'Loot', 'Bag', 'Build', 'Pause'];

  ui.blocked = function () {
    if (DW.state !== 'play') return true;
    for (var i = 0; i < layers.length; i++) {
      if (el['layer' + layers[i]] && el['layer' + layers[i]].classList.contains('show')) return true;
    }
    return false;
  };
  function open(name) { el['layer' + name].classList.add('show'); }
  function close(name) { el['layer' + name].classList.remove('show'); }
  function isOpen(name) { return el['layer' + name].classList.contains('show'); }
  ui.open = open; ui.close = close; ui.isOpen = isOpen;

  // ---------- 输入 ----------
  var input = ui.input = { vec: { x: 0, y: 0 }, sprint: false, attack: false, aimAngle: null, mouseActive: false };
  var keys = {};
  var stick = { active: false, id: -1, ox: 0, oy: 0, dx: 0, dy: 0 };
  var R = 56;

  function setStickVisual(x, y, vx, vy, show) {
    el.pad.style.left = (x - 66) + 'px';
    el.pad.style.top = (y - 66) + 'px';
    el.pad.style.bottom = 'auto';
    el.pad.style.opacity = show ? 1 : 0.55;
    el.stick.style.transform = 'translate(' + vx + 'px,' + vy + 'px)';
  }
  function stickStart(x, y, id) {
    stick.active = true; stick.id = id; stick.ox = x; stick.oy = y; stick.dx = 0; stick.dy = 0;
    setStickVisual(x, y, 0, 0, true);
  }
  function stickMove(x, y) {
    var dx = x - stick.ox, dy = y - stick.oy;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len > R) { dx = dx / len * R; dy = dy / len * R; len = R; }
    stick.dx = dx; stick.dy = dy;
    setStickVisual(stick.ox, stick.oy, dx, dy, true);
    var mag = Math.min(1, len / R);
    if (len < 6) { input.vec.x = 0; input.vec.y = 0; }
    else { input.vec.x = dx / R; input.vec.y = dy / R; input.mouseActive = false; }
    void mag;
  }
  function stickEnd() {
    stick.active = false; stick.id = -1;
    input.vec.x = 0; input.vec.y = 0;
    el.stick.style.transform = 'translate(0,0)';
    el.pad.style.left = '';
    el.pad.style.top = '';
    el.pad.style.bottom = '';
    el.pad.style.opacity = '';
  }

  ui.init = function (state) {
    S = state;
    ['layerMenu', 'layerEnd', 'layerLoot', 'layerBag', 'layerBuild', 'layerPause'].forEach(function (id) { el[id] = document.getElementById(id); });
    el.pad = document.getElementById('pad');
    el.stick = document.getElementById('stick');
    el.toasts = document.getElementById('toasts');
    el.mini = document.getElementById('minimap');
    el.miniX = el.mini.getContext('2d');
    el.chips = document.getElementById('chips');
    el.prompt = document.getElementById('prompt');
    el.clock = document.getElementById('clock');
    el.phase = document.getElementById('phase');
    el.alert = document.getElementById('alertTxt');
    el.flash = document.getElementById('dmgFlash');
    el.bars = { hp: document.getElementById('bHp'), food: document.getElementById('bFood'), water: document.getElementById('bWater'), energy: document.getElementById('bEnergy'), sanity: document.getElementById('bSanity') };

    var cv = document.getElementById('cv');

    // 触摸摇杆 + 建造点选
    cv.addEventListener('pointerdown', function (ev) {
      ev.preventDefault();
      DW.sfx.unlock();
      var x = ev.clientX, y = ev.clientY;
      if (S.build.type) { DW.game.buildAt(x, y); return; }
      if (x < global.innerWidth * 0.46) {
        stickStart(x, y, ev.pointerId);
      } else {
        // 右半屏点击 = 朝该点瞄准并攻击
        aimAtScreen(x, y);
        input.attack = true; input.attackTap = true;
      }
      input.mouseActive = false;
    }, { passive: false });
    cv.addEventListener('pointermove', function (ev) {
      if (stick.active && ev.pointerId === stick.id) stickMove(ev.clientX, ev.clientY);
      else if (S.build.type) DW.game.buildGhost(ev.clientX, ev.clientY);
    }, { passive: true });
    function upHandler(ev) {
      if (stick.active && ev.pointerId === stick.id) stickEnd();
      if (input.attackTap) { input.attack = false; input.attackTap = false; }
    }
    cv.addEventListener('pointerup', upHandler);
    cv.addEventListener('pointercancel', upHandler);

    // 按钮
    Array.prototype.forEach.call(document.querySelectorAll('#btns .btn'), function (b) {
      var act = b.dataset.act;
      b.addEventListener('pointerdown', function (ev) {
        ev.preventDefault();
        if (act === 'attack') { input.attack = true; input.attackBtn = true; }
        else if (act === 'sprint') { input.sprint = true; b.classList.add('on'); }
        else if (act === 'use') DW.game.interact();
        else if (act === 'light') {
          S.player.lantern = !S.player.lantern;
          b.classList.toggle('on', S.player.lantern);
          ui.toast(S.player.lantern ? '手电打开：看得远，但夜里更容易被发现' : '手电关闭：省理智，看不见东西');
        }
      });
      b.addEventListener('pointerup', function (ev) {
        ev.preventDefault();
        if (act === 'attack') { input.attack = false; input.attackBtn = false; }
        else if (act === 'sprint') { input.sprint = false; b.classList.remove('on'); }
      });
      b.addEventListener('pointerleave', function () {
        if (act === 'attack') { input.attack = false; input.attackBtn = false; }
        if (act === 'sprint') { input.sprint = false; b.classList.remove('on'); }
      });
      b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    });
    document.querySelector('[data-act="light"]').classList.add('on');

    // 顶栏
    document.getElementById('tbBag').addEventListener('click', function () { ui.openBag(); });
    document.getElementById('tbBuild').addEventListener('click', function () { ui.openBuild(); });
    document.getElementById('tbSound').addEventListener('click', function (ev) {
      DW.sfx.on = !DW.sfx.on;
      ev.currentTarget.textContent = DW.sfx.on ? '音效·开' : '音效·关';
      if (DW.sfx.on) { DW.sfx.unlock(); DW.sfx.pick(); }
    });
    document.getElementById('tbMenu').addEventListener('click', function () {
      if (isOpen('Pause')) { close('Pause'); DW.state = 'play'; }
      else { ui.fillPause(); open('Pause'); DW.state = 'pause'; }
    });
    document.getElementById('btnResume').addEventListener('click', function () { close('Pause'); DW.state = 'play'; DW.game.loopOn(); });
    document.getElementById('btnSave').addEventListener('click', function () { DW.game.save(true); });
    document.getElementById('btnQuit').addEventListener('click', function () { close('Pause'); DW.game.quitToMenu(); });
    document.getElementById('bagClose').addEventListener('click', function () { close('Bag'); });
    document.getElementById('buildClose').addEventListener('click', function () { close('Build'); });
    document.getElementById('lootClose').addEventListener('click', function () { close('Loot'); S.openLoot = null; });
    document.getElementById('lootAll').addEventListener('click', function () { DW.game.takeAll(); });
    document.getElementById('btnNew').addEventListener('click', function () { DW.game.newGame(); });
    document.getElementById('btnCont').addEventListener('click', function () { DW.game.loadGame(); });
    document.getElementById('btnEndNew').addEventListener('click', function () { close('End'); DW.game.newGame(); });
    document.getElementById('btnEndLoad').addEventListener('click', function () { close('End'); DW.game.loadGame(); });

    // 应用内更新入口：只在 Android 壳里出现（原生负责下载+校验+拉起安装，不跳浏览器）
    if (DW.shell) {
      ['btnUpdate', 'btnUpdMenu'].forEach(function (id) {
        var b = document.getElementById(id);
        if (b) { b.style.display = ''; b.addEventListener('click', function () { DW.checkUpdate(); }); }
      });
      var vtxt = '暗林 v' + DW.version() + ' · 存档与地图都在本机 · 只有按下「检查更新」才会联网';
      ['verTag', 'menuVer'].forEach(function (id) {
        var t = document.getElementById(id);
        if (t) { t.style.display = ''; t.textContent = vtxt; }
      });
    }

    // 键盘（桌面调试）
    global.addEventListener('keydown', function (ev) {
      var k = ev.key.toLowerCase();
      if (keys[k]) return;
      keys[k] = true;
      if (k === ' ' || k === 'j') { input.attack = true; }
      if (k === 'shift') input.sprint = true;
      if (k === 'e') DW.game.interact();
      if (k === 'b') ui.openBuild();
      if (k === 'i') ui.openBag();
      if (k === 'f') S.player.lantern = !S.player.lantern;
      if (k === 'escape') { ui.onBack(); }
      if (k === 'tab') { ev.preventDefault(); DW.game.cycleWeapon(); }
      if (k >= '1' && k <= '6') { var n = parseInt(k, 10) - 1; if (n < S.player.weapons.length) { S.player.slot = n; ui.toast('装备 ' + DW.ITEMS[S.player.weapons[n]].name); } }
      applyKeys();
    });
    global.addEventListener('keyup', function (ev) {
      var k = ev.key.toLowerCase();
      keys[k] = false;
      if (k === ' ' || k === 'j') input.attack = false;
      if (k === 'shift') input.sprint = false;
      applyKeys();
    });
    function applyKeys() {
      var x = 0, y = 0;
      if (keys['a'] || keys['arrowleft']) x -= 1;
      if (keys['d'] || keys['arrowright']) x += 1;
      if (keys['w'] || keys['arrowup']) y -= 1;
      if (keys['s'] || keys['arrowdown']) y += 1;
      if (x || y) {
        var l = Math.sqrt(x * x + y * y);
        input.vec.x = x / l; input.vec.y = y / l; input.mouseActive = false;
      } else if (!stick.active) { input.vec.x = 0; input.vec.y = 0; }
    }
    cv.addEventListener('mousemove', function (ev) {
      if (ev.buttons) { if (S.build.type) DW.game.buildAt(ev.clientX, ev.clientY); else { aimAtScreen(ev.clientX, ev.clientY); input.attack = true; } }
      else { S.mouseScreen = { x: ev.clientX, y: ev.clientY }; input.mouseActive = true; }
    });
    cv.addEventListener('mouseup', function () { if (!input.attackBtn) input.attack = false; });
    cv.addEventListener('mouseleave', function () { input.attack = false; });
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    global.addEventListener('touchmove', function (e) { if (e.cancelable) e.preventDefault(); }, { passive: false });
  };

  function aimAtScreen(sx, sy) {
    input.mouseActive = true;
    S.mouseScreen = { x: sx, y: sy };
    S.mouseWorld = DW.game.screenToWorld(sx, sy);
    S.player.aim = Math.atan2(S.mouseWorld.y - S.player.y, S.mouseWorld.x - S.player.x);
  }
  ui.aimAtScreen = aimAtScreen;

  // ---------- toast ----------
  var toastN = 0;
  // 原生返回键 / Escape 共用一套「先关面板，再暂停，最后交给系统」的逻辑。
  // 返回 true 表示这一层被界面吃掉了；返回 false 表示没东西可退（Android 壳据此退出游戏）。
  ui.onBack = function () {
    if (S.build.type) { S.build.type = null; return true; }
    if (isOpen('Loot')) { close('Loot'); S.openLoot = null; return true; }
    if (isOpen('Bag')) { close('Bag'); return true; }
    if (isOpen('Build')) { close('Build'); return true; }
    if (isOpen('Pause')) { close('Pause'); DW.state = 'play'; DW.game.loopOn(); return true; }
    if (isOpen('End')) { close('End'); DW.game.quitToMenu(); return true; }
    if (DW.state === 'play') { ui.fillPause(); open('Pause'); DW.state = 'pause'; return true; }
    return false;
  };

  ui.toast = function (msg, cls) {
    if (!el.toasts) return;
    var d = document.createElement('div');
    d.className = 'toast' + (cls ? ' ' + cls : '');
    d.textContent = msg;
    el.toasts.appendChild(d);
    toastN++;
    while (el.toasts.children.length > 4) el.toasts.removeChild(el.toasts.firstChild);
    setTimeout(function () {
      d.style.transition = 'opacity .4s';
      d.style.opacity = 0;
      setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 420);
    }, 1600);
  };

  // ---------- HUD ----------
  var lastHud = 0;
  ui.update = function (dt) {
    var P = S.player, t = S.time;
    var hh = Math.floor(t.minutes / 60), mm = Math.floor(t.minutes % 60);
    el.clock.textContent = '第' + t.day + '天 ' + pad2(hh) + ':' + pad2(mm);
    var night = DW.isNight(t.minutes);
    el.phase.textContent = t.rescue ? '撤离' : (night ? '夜晚' : '白天');
    el.phase.style.color = night ? '#c8b8e0' : '#9fb070';

    if (S.t - lastHud > 0.1) {
      lastHud = S.t;
      el.bars.hp.style.transform = 'scaleX(' + (P.hp / 100) + ')';
      el.bars.food.style.transform = 'scaleX(' + (P.food / 100) + ')';
      el.bars.water.style.transform = 'scaleX(' + (P.water / 100) + ')';
      el.bars.energy.style.transform = 'scaleX(' + (P.energy / 100) + ')';
      el.bars.sanity.style.transform = 'scaleX(' + (P.sanity / 100) + ')';
      var w = DW.ent.weapon(P);
      var chip = [
        ['木材', P.inv.wood], ['零件', P.inv.metal], ['食物', P.inv.food + P.inv.cooked],
        ['水', P.inv.water], ['弹药', P.ammo.ammo + '/' + P.ammo.shells],
        ['零件★', P.inv.part + '/3'], ['武器', (w ? w.name : '拳头')]
      ];
      var html = '';
      for (var i = 0; i < chip.length; i++) html += '<div class="chip">' + chip[i][0] + ' <b>' + chip[i][1] + '</b></div>';
      el.chips.innerHTML = html;

      // 最高警戒
      var al = 0, near = 1e9;
      for (var j = 0; j < S.enemies.length; j++) {
        var e = S.enemies[j];
        if (e.dead) continue;
        var d = DW.dist(P.x, P.y, e.x, e.y);
        if (d < 420 && e.alert > al) al = e.alert;
        if (d < near) near = d;
      }
      el.alert.textContent = al > 0.75 ? '★ 被锁定' : (al > 0.4 ? '● 可疑' : (al > 0.12 ? '· 风声' : ''));
      el.alert.style.color = al > 0.75 ? '#e05a4a' : '#e8b84a';

      // 互动提示
      var pr = DW.game.interactTarget();
      if (pr) { el.prompt.style.display = 'block'; el.prompt.textContent = pr.label; }
      else el.prompt.style.display = 'none';
    }

    if (S.flashHurt > 0) { el.flash.style.opacity = Math.min(1, S.flashHurt * 3); S.flashHurt -= dt; }
    else el.flash.style.opacity = 0;

    drawMini();
  };
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function drawMini() {
    var x = el.miniX, w = el.mini.width, h = el.mini.height;
    x.fillStyle = '#0a0c09'; x.fillRect(0, 0, w, h);
    var ww = DW.world, sc = w / ww.w;
    var cols = {};
    cols[DW.G.GRASS] = '#2b3622'; cols[DW.G.DIRT] = '#3a3325'; cols[DW.G.WATER] = '#22404a';
    cols[DW.G.ROCK] = '#4b4f49'; cols[DW.G.TREE] = '#1b2a18'; cols[DW.G.BUSH] = '#26331f';
    cols[DW.G.RUIN] = '#565650'; cols[DW.G.FLOOR] = '#4a3c28';
    for (var ty = 0; ty < ww.h; ty++) {
      for (var tx = 0; tx < ww.w; tx++) {
        var k = DW.idx(tx, ty);
        if (!ww.explored[k]) continue;
        x.fillStyle = cols[ww.ground[k]] || '#333';
        x.fillRect(tx * sc, ty * sc, sc + 0.6, sc + 0.6);
      }
    }
    for (var s = 0; s < ww.structures.length; s++) {
      var st = ww.structures[s];
      if (!ww.explored[DW.idx(st.tx, st.ty)]) continue;
      x.fillStyle = st.type === 'wall' ? '#6b5535' : (st.type === 'gate' ? '#8a7038' : (st.type === 'fire' ? '#d08a3a' : '#585e52'));
      x.fillRect(st.tx * sc, st.ty * sc, sc + 0.5, sc + 0.5);
    }
    // 据点
    for (var t2 = 0; t2 < ww.towers.length; t2++) {
      var T = ww.towers[t2];
      x.fillStyle = T.cleared ? '#4a6b4a' : '#b04a3c';
      x.fillRect(T.tx * sc - 2, T.ty * sc - 2, 5, 5);
    }
    // 小屋
    x.fillStyle = '#e0c45a';
    x.fillRect(ww.hut.tx * sc - 2, ww.hut.ty * sc - 2, 5, 5);
    // 玩家
    var P = S.player;
    x.fillStyle = '#f2f0d8';
    x.beginPath(); x.arc(P.x / TS * sc, P.y / TS * sc, 2.6, 0, 7); x.fill();
    x.strokeStyle = 'rgba(240,238,210,.5)';
    x.beginPath();
    x.moveTo(P.x / TS * sc, P.y / TS * sc);
    x.lineTo(P.x / TS * sc + Math.cos(P.aim) * 7, P.y / TS * sc + Math.sin(P.aim) * 7);
    x.stroke();
  }

  // ---------- 背包面板 ----------
  ui.openBag = function () {
    if (isOpen('Bag')) { close('Bag'); return; }
    var P = S.player;
    var html = '';
    var order = ['food', 'cooked', 'rawfood', 'water', 'meds', 'bandage', 'beer', 'wood', 'plank', 'metal', 'cloth', 'ammo', 'shells', 'part'];
    for (var i = 0; i < order.length; i++) {
      var k = order[i], it = DW.ITEMS[k], n = P.inv[k] | 0;
      if (it.kind === 'ammo') n = P.ammo[k] | 0;
      if (!n) continue;
      var usable = !!it.use;
      html += '<div class="cell' + (usable ? '' : ' dis') + '" data-k="' + k + '"><span class="q">' + n + '</span>' +
              '<div class="n">' + it.name + '</div><div class="c">' + (usable ? '点击使用' : it.desc) + '</div></div>';
    }
    for (var w = 0; w < P.weapons.length; w++) {
      var wi = DW.ITEMS[P.weapons[w]];
      html += '<div class="cell' + (w === P.slot ? ' sel' : '') + '" data-w="' + P.weapons[w] + '">' +
              '<div class="n">' + wi.name + (w === P.slot ? ' · 使用中' : '') + '</div>' +
              '<div class="c">伤害 ' + wi.dmg + (wi.ammo ? ' · 需' + DW.ITEMS[wi.ammo].name : ' · 体力 ' + (wi.stam || 0)) + '</div></div>';
    }
    el.bagGrid = el.bagGrid || document.getElementById('bagGrid');
    el.bagGrid.innerHTML = html;
    document.getElementById('bagHint').textContent = '切换武器：点击下面的武器。生肉直接吃会掉理智，最好放到篝火旁边烤。';
    Array.prototype.forEach.call(el.bagGrid.children, function (c) {
      c.addEventListener('click', function () {
        if (c.dataset.k) {
          if (DW.ITEMS[c.dataset.k].use) { DW.ent.use(S, c.dataset.k); ui.openBag(); }
        } else if (c.dataset.w) {
          for (var j = 0; j < S.player.weapons.length; j++) if (S.player.weapons[j] === c.dataset.w) { S.player.slot = j; }
          ui.toast('装备 ' + DW.ITEMS[c.dataset.w].name);
          ui.openBag();
        }
      });
    });
    open('Bag');
  };

  // ---------- 建造面板 ----------
  ui.openBuild = function () {
    if (S.build.type) { S.build.type = null; S.buildTile = null; ui.toast('取消建造'); return; }
    if (isOpen('Build')) { close('Build'); return; }
    var html = '', P = S.player;
    for (var key in DW.BUILD) {
      var b = DW.BUILD[key];
      var costTxt = [];
      var ok = true;
      for (var r in b.cost) {
        var need = b.cost[r];
        var have = (P.inv[r] | 0) + ((DW.ITEMS[r] && DW.ITEMS[r].kind === 'ammo') ? (P.ammo[r] | 0) : 0);
        costTxt.push(DW.ITEMS[r].name + ' ' + have + '/' + need);
        if (have < need) ok = false;
      }
      html += '<div class="cell' + (ok ? '' : ' dis') + '" data-b="' + key + '"><div class="n">' + b.name + '</div>' +
              '<div class="c">' + b.desc + '</div><div class="c" style="color:#a8a07c">' + costTxt.join(' · ') + '</div></div>';
    }
    el.buildGrid = el.buildGrid || document.getElementById('buildGrid');
    el.buildGrid.innerHTML = html;
    Array.prototype.forEach.call(el.buildGrid.children, function (c) {
      c.addEventListener('click', function () {
        if (c.classList.contains('dis')) { ui.toast('材料不够', 'warn'); return; }
        S.build.type = c.dataset.b;
        close('Build');
        ui.toast('选择落点：' + DW.BUILD[S.build.type].name + '（再按建造可取消）', 'good');
      });
    });
    open('Build');
  };

  // ---------- 搜刮面板 ----------
  ui.openLoot = function (c) {
    var html = '';
    el.lootTitle = el.lootTitle || document.getElementById('lootTitle');
    el.lootGrid = el.lootGrid || document.getElementById('lootGrid');
    el.lootTitle.textContent = c.label + (c.hasPart ? '（内含电台零件）' : '');
    if (!c.items.length) html = '<div class="cell dis"><div class="n">空了</div><div class="c">搜刮过了</div></div>';
    for (var i = 0; i < c.items.length; i++) {
      var it = c.items[i], info = DW.ITEMS[it.k];
      html += '<div class="cell" data-i="' + i + '"><span class="q">x' + it.n + '</span><div class="n">' + info.name + '</div>' +
              '<div class="c">' + info.desc + '</div></div>';
    }
    el.lootGrid.innerHTML = html;
    Array.prototype.forEach.call(el.lootGrid.children, function (ch) {
      ch.addEventListener('click', function () {
        if (!ch.dataset.i) return;
        DW.game.takeItem(c, parseInt(ch.dataset.i, 10));
        ui.openLoot(c);
      });
    });
    open('Loot');
  };

  ui.fillPause = function () {
    var P = S.player, t = S.time;
    document.getElementById('pauseStat').innerHTML =
      '第 <b>' + t.day + '</b> 天 · 击杀 <b>' + P.kills + '</b> · 电台零件 <b>' + P.inv.part + '/3</b><br>' +
      '生命 ' + Math.round(P.hp) + ' · 饥饿 ' + Math.round(P.food) + ' · 口渴 ' + Math.round(P.water) +
      ' · 体力 ' + Math.round(P.energy) + ' · 理智 ' + Math.round(P.sanity);
  };

  ui.endScreen = function (win, reason) {
    document.getElementById('endTitle').textContent = win ? '你活下来了' : '你死了';
    document.getElementById('endSub').textContent = win ? 'RESCUED' : 'GAME OVER';
    document.getElementById('endTxt').innerHTML = reason;
    open('End');
  };
})(window);
