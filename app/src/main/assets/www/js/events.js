/* 暗林 · 幸存夜 — 晨间事件池
 *
 * 每天天亮后掷一个事件：有的直接改状态，有的要你当场做选择（世界会暂停，
 * 免得你读文字的时候被人从背后砍）。事件只读游戏状态、只通过 DW.ent /
 * DW.world 这些已有接口改东西，不碰网络、不碰存档结构。
 */
(function (global) {
  'use strict';
  var DW = global.DW, TS = DW.TILE;
  var ev = DW.events = {};

  function nearHut(dist) {
    var h = DW.world.hut, a = DW.rand(0, 6.283), d = DW.rand(3, dist);
    return { x: (h.tx + 0.5) * TS + Math.cos(a) * d * TS, y: (h.ty + 0.5) * TS + Math.sin(a) * d * TS };
  }

  // 在野外落一个可搜刮的容器（复用世界已有的容器列表）
  function dropContainer(S, x, y, type, label, items) {
    var c = { x: x, y: y, type: type, label: label, items: items, searched: false, hasPart: false };
    S.world_.containers.push(c);
    DW.reveal(x, y, 5 * TS);
    return c;
  }

  // 纯检查，不动库存：给按钮置灰用
  function can(S, cost) {
    for (var k in cost) if ((S.player.inv[k] | 0) < cost[k]) return false;
    return true;
  }
  function pay(S, cost) {
    if (!can(S, cost)) return false;
    for (var k in cost) S.player.inv[k] -= cost[k];
    return true;
  }
  function costText(cost) {
    var a = [];
    for (var k in cost) a.push(cost[k] + ' ' + DW.ITEMS[k].name);
    return a.join('、');
  }

  function nightQueue(S, kind, n, msg) {
    S.nightQueue.push({ kind: kind, n: n, msg: msg });
  }

  // ---------- 事件表 ----------
  // weight：权重；min：最早出现的天；cond：额外条件；ask：给玩家选择
  var POOL = [
    {
      id: 'knock', weight: 10, min: 2,
      ask: function (S) {
        return {
          title: '有人在门外',
          text: '天还没全亮，屋外响起敲门声。一个哑着嗓子的声音说自己是路过的幸存者，' +
                '身后有人追他，求你开一下门。<br><br>你听不见第二个人的脚步——也可能是他压低了声音。',
          options: [
            {
              label: '开门',
              run: function (S) {
                if (DW.chance(0.55)) {
                  DW.ent.give(S, 'food', 2); DW.ent.give(S, 'cloth', 2); DW.ent.give(S, 'wood', 5);
                  S.player.sanity = DW.clamp(S.player.sanity + 6, 0, 100);
                  DW.ui.toast('他留下点东西就走了。临走前说：「西边那塔里的人不客气。」', 'good');
                  if (DW.chance(0.35)) nightQueue(S, 'bandit', 1, '他大概记住了你的门。');
                } else {
                  DW.ui.toast('他不是一个人来的。', 'bad');
                  nightQueue(S, 'bandit', 2, null);
                  nightQueue(S, 'looter', 1, null);
                  S.player.sanity = DW.clamp(S.player.sanity - 8, 0, 100);
                }
              }
            },
            {
              label: '隔着门问话',
              run: function (S) {
                S.player.sanity = DW.clamp(S.player.sanity - 3, 0, 100);
                if (DW.chance(0.5)) {
                  var t = unclearedTower(S);
                  if (t) {
                    DW.reveal((t.tx + 0.5) * TS, (t.ty + 0.5) * TS, 12 * TS);
                    DW.ui.toast('他说了个地名。小地图上亮起了「' + t.name + '」。', 'good');
                  } else DW.ui.toast('他说的地方你已经去过了。', 'warn');
                } else {
                  nightQueue(S, 'looter', 1, '他说完就笑了。你听见瓶子碰在一起的声音。');
                  DW.ui.toast('他笑了一声，走之前把什么东西放在了墙外。', 'warn');
                }
              }
            },
            {
              label: '不开门',
              run: function (S) {
                S.player.sanity = DW.clamp(S.player.sanity - 5, 0, 100);
                DW.ui.toast('敲门声停了。你花了很久才不去听门外。', 'warn');
              }
            }
          ]
        };
      }
    },
    {
      id: 'trader', weight: 7, min: 3,
      ask: function (S) {
        return {
          title: '流浪商人',
          text: '一个背大包的男人在你墙外摆摊，把东西一件件摆整齐，像根本没打算进屋。<br>' +
                '「以物易物，」他说，「我不还价。」',
          options: [
            {
              label: '6 木材 → 2 金属',
              cost: { wood: 6 },
              run: function (S) { DW.ent.give(S, 'metal', 2); DW.ui.toast('换好了，他数了两遍。', 'good'); }
            },
            {
              label: '2 罐头 → 8 子弹',
              cost: { food: 2 },
              run: function (S) { DW.ent.give(S, 'ammo', 8); DW.ui.toast('换好了。子弹压得很实。', 'good'); }
            },
            {
              label: '不做生意',
              run: function (S) {
                S.player.sanity = DW.clamp(S.player.sanity - 2, 0, 100);
                DW.ui.toast('他耸耸肩，把东西收回包里，往林子深处去了。', 'warn');
                if (DW.chance(0.3)) nightQueue(S, 'bandit', 1, '他大概跟别人提过你的墙。');
              }
            }
          ]
        };
      }
    },
    {
      id: 'dog', weight: 5, min: 2,
      ask: function (S) {
        return {
          title: '夹住的狗',
          text: '墙外的捕兽夹夹住了一条瘦得能数清肋骨的狗。它不叫，只是看着你，' +
                '尾巴很轻地扫了一下土。',
          options: [
            {
              label: '放了它',
              run: function (S) {
                S.player.sanity = DW.clamp(S.player.sanity + 10, 0, 100);
                S.flags.dogFriend = S.time.day;
                DW.ui.toast('它一瘸一拐地进了树丛。今晚你睡着时会被舔醒。', 'good');
              }
            },
            {
              label: '杀了吃肉',
              run: function (S) {
                DW.ent.give(S, 'rawfood', 2); DW.ent.give(S, 'cloth', 1);
                S.player.sanity = DW.clamp(S.player.sanity - 9, 0, 100);
                DW.ui.toast('+2 生肉。它到最后都没叫。', 'warn');
              }
            },
            { label: '走开', run: function (S) { S.player.sanity = DW.clamp(S.player.sanity - 3, 0, 100); } }
          ]
        };
      }
    },
    {
      id: 'arsonFoot', weight: 9, min: 4,
      ask: function (S) {
        return {
          title: '墙外的脚印',
          text: '泥地上一串脚印绕着你的墙走了半圈，在几段墙根前停下来、蹲过。' +
                '脚印边上有一小滩已经干了的油。',
          options: [
            {
              label: '花 4 木材加固墙根',
              cost: { wood: 4 },
              run: function (S) {
                strengthenWalls(S);
                DW.ui.toast('你把墙根糊厚了。今夜他们烧不动。', 'good');
                S.flags.noRaid = S.time.day;
              }
            },
            {
              label: '无视它',
              run: function (S) {
                nightQueue(S, 'looter', DW.randInt(1, 2), '夜里有人带着瓶子来。');
                S.player.sanity = DW.clamp(S.player.sanity - 4, 0, 100);
              }
            }
          ]
        };
      }
    },
    {
      id: 'corpse', weight: 8, min: 1,
      run: function (S) {
        var p = nearHut(6);
        dropContainer(S, p.x, p.y, 'backpack', '林里的尸体 · 背包',
          [{ k: 'metal', n: DW.randInt(1, 3) }, { k: 'ammo', n: DW.randInt(4, 12) },
           { k: 'food', n: 1 }, { k: 'bandage', n: DW.randInt(1, 2) }]);
        S.player.sanity = DW.clamp(S.player.sanity - 7, 0, 100);
        DW.ui.toast('屋外有具尸体，背包还在。你把它拖到了树丛边。（理智 -7）', 'warn');
        if (DW.chance(0.4)) nightQueue(S, 'bandit', DW.randInt(1, 2), '有人在找那个背包。');
      }
    },
    {
      id: 'howl', weight: 7, min: 2,
      run: function (S) {
        nightQueue(S, 'feral', DW.randInt(2, 3), '夜里疯子会多起来。');
        S.player.sanity = DW.clamp(S.player.sanity - 4, 0, 100);
        DW.ui.toast('一整夜都有嚎叫，今天白天还在叫。它们往这边来了。', 'warn');
      }
    },
    {
      id: 'rain', weight: 7, min: 1,
      run: function (S) {
        S.weather = 'rain';
        S.weatherUntil = S.time.day + DW.randInt(1, 2);
        S.fires.length = 0;
        S.flags.noRaid = S.time.day;
        S.player.sanity = DW.clamp(S.player.sanity + 6, 0, 100);
        DW.ui.toast('下雨了。火浇灭了，脚步声听不清，他们今晚大概不想出来。', 'good');
      }
    },
    {
      id: 'broadcast', weight: 6, min: 2,
      run: function (S) {
        var t = unclearedTower(S);
        S.player.sanity = DW.clamp(S.player.sanity + 5, 0, 100);
        if (t) {
          DW.reveal((t.tx + 0.5) * TS, (t.ty + 0.5) * TS, 12 * TS);
          DW.ui.toast('电台里循环一段人声：「' + t.name + '还有人。」小地图亮了。', 'good');
        } else {
          DW.ui.toast('电台里只有你自己的呼吸声。但至少有人还在说话。', 'warn');
        }
      }
    },
    {
      id: 'airdrop', weight: 5, min: 3,
      run: function (S) {
        var p = nearHut(9);
        dropContainer(S, p.x, p.y, 'crate', '空投的木箱',
          [{ k: 'plank', n: DW.randInt(3, 6) }, { k: 'metal', n: DW.randInt(2, 4) },
           { k: DW.pick(['shells', 'ammo', 'meds']), n: DW.randInt(4, 10) },
           { k: 'food', n: 2 }]);
        DW.ui.toast('什么东西砸断了几棵树。林子里多了个空投箱。（看小地图）', 'good');
        nightQueue(S, 'bandit', DW.randInt(1, 2), '箱子落地的声音传得很远。');
      }
    },
    {
      id: 'theft', weight: 7, min: 2,
      run: function (S) {
        var P = S.player, lost = {};
        ['wood', 'metal', 'cloth', 'food'].forEach(function (k) {
          if ((P.inv[k] | 0) > 0 && DW.chance(0.6)) {
            var n = Math.max(1, Math.ceil(P.inv[k] * DW.rand(0.25, 0.5)));
            P.inv[k] -= n; lost[k] = n;
          }
        });
        P.sanity = DW.clamp(P.sanity - 5, 0, 100);
        var txt = [];
        for (var k2 in lost) txt.push(lost[k2] + ' ' + DW.ITEMS[k2].name);
        DW.ui.toast(txt.length ? '有人翻过你的东西：少了 ' + txt.join('、') : '有人翻过了，但没拿走什么。', 'bad');
      }
    },
    {
      id: 'quiet', weight: 5, min: 1,
      run: function (S) {
        S.flags.noRaid = S.time.day;
        S.player.sanity = DW.clamp(S.player.sanity + 8, 0, 100);
        DW.ui.toast('一整天什么声音都没有。你甚至开始觉得森林放过了你。', 'good');
      }
    },
    {
      id: 'sick', weight: 5, min: 2,
      run: function (S) {
        var P = S.player;
        P.hp = DW.clamp(P.hp - 12, 1, 100);
        P.food = Math.max(0, P.food - 16);
        P.water = Math.max(0, P.water - 16);
        P.energy = Math.max(0, P.energy - 20);
        DW.ui.toast('昨晚的东西不干净。你一整天都在发抖。', 'bad');
      }
    },
    {
      id: 'whisper', weight: 7, min: 1,
      cond: function (S) { return S.player.sanity < 45; },
      run: function (S) {
        for (var i = 0; i < DW.randInt(1, 2); i++) DW.ent.spawnGhost(S);
        S.player.sanity = DW.clamp(S.player.sanity - 6, 0, 100);
        DW.ui.toast(DW.pick(['屋里有人在念你的名字，声音是你自己的。', '墙上多了一道门。你确定昨天没有。', '你数了数墙，比昨晚多了一段。']), 'warn');
      }
    }
  ];

  function unclearedTower(S) {
    var list = [];
    for (var i = 0; i < S.world_.towers.length; i++) if (!S.world_.towers[i].cleared) list.push(S.world_.towers[i]);
    return list.length ? DW.pick(list) : null;
  }

  // 加固：给玩家自建的墙回血（不是天生废墟）
  function strengthenWalls(S) {
    var n = 0;
    for (var i = 0; i < S.world_.structures.length; i++) {
      var st = S.world_.structures[i];
      if (st.stat || st.type !== 'wall') continue;
      st.hp = Math.min(st.maxhp, st.hp + 60); n++;
    }
    return n;
  }

  ev.pool = POOL;

  ev.pickEligible = function (S) {
    var out = [];
    for (var i = 0; i < POOL.length; i++) {
      var e = POOL[i];
      if (S.time.day < e.min) continue;
      if (e.cond && !e.cond(S)) continue;
      if (e.lastDay && e.lastDay === S.evtDay) continue;
      out.push(e);
    }
    return out;
  };

  // 按权重抽一个并触发
  ev.roll = function (S) {
    if (DW.state !== 'play') return;
    var list = ev.pickEligible(S);
    if (!list.length) return;
    var total = 0, i2;
    for (i2 = 0; i2 < list.length; i2++) total += list[i2].weight;
    var r = Math.random() * total, chosen = list[0];
    for (i2 = 0; i2 < list.length; i2++) { r -= list[i2].weight; if (r <= 0) { chosen = list[i2]; break; } }
    present(S, chosen);
    return chosen.id;
  };

  function present(S, chosen) {
    chosen.lastDay = S.evtDay;
    S.evtId = chosen.id;
    if (chosen.ask) {
      var spec = chosen.ask(S);
      var opts = [];
      for (var o = 0; o < spec.options.length; o++) {
        (function (op) {
          opts.push({
            label: op.label,
            disabled: op.cost ? !can(S, op.cost) : false,
            why: op.cost ? '少了 ' + costText(op.cost) : '',
            // 材料在这里才扣：置灰的按钮点下去只提示，不能白吃掉东西
            run: function (st) {
              if (op.cost && !pay(st, op.cost)) { DW.ui.toast('材料不够：' + costText(op.cost), 'warn'); return false; }
              op.run(st);
              return true;
            }
          });
        })(spec.options[o]);
      }
      DW.ui.choice(spec.title, spec.text, opts);
    } else {
      chosen.run(S);
    }
  }

  // 测试/调试用：不掷骰子，直接触发某个事件
  ev.run = function (S, id) {
    if (DW.state !== 'play') return false;
    for (var i = 0; i < POOL.length; i++) if (POOL[i].id === id) { present(S, POOL[i]); return true; }
    return false;
  };
})(window);
