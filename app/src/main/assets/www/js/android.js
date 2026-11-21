/* 暗林 · 幸存夜 — Android 壳桥接（网页版没有 window.Anlin，全部退化为无操作） */
(function (global) {
  'use strict';

  var DW = global.DW = global.DW || {};

  // 原生桥由 MainActivity 以 addJavascriptInterface(..., "Anlin") 注入。
  // @JavascriptInterface 方法跑在 JavaBridge 线程，所以只让它去读字符串或切回主线程（由原生负责）。
  DW.shell = global.Anlin || null;

  /** 版本号：APK 里显示，网页版为空串 */
  DW.version = function () {
    try { return DW.shell && typeof DW.shell.version === 'function' ? DW.shell.version() : ''; }
    catch (e) { return ''; }
  };

  /** 应用内更新：原生弹窗（检查 → 下载进度 → 校验 → 拉起安装）。网页版给一句实话，不跳浏览器。 */
  DW.checkUpdate = function () {
    if (DW.shell && typeof DW.shell.checkUpdate === 'function') {
      try { DW.shell.checkUpdate(); return; } catch (e) { /* 落到下面的提示 */ }
    }
    if (DW.ui && DW.ui.toast) DW.ui.toast('网页版没有应用内更新，请安装 APK 版', 'warn');
  };

  /**
   * 返回键由原生调用：true = 界面自己吃掉了一层（收面板 / 打开暂停），
   * false = 没有可退的一层，交给原生退出。
   */
  global.__anlinBack = function () {
    try { return DW.ui && DW.ui.onBack ? !!DW.ui.onBack() : false; }
    catch (e) { return false; }
  };
})(window);
