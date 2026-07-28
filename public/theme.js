/* =====================================================================
 * Triune · 主题管理
 * 模式：'light' | 'dark' | 'system'（跟随系统）
 * 存储：localStorage['tj_theme']
 * 由 <head> 内的内联 bootstrap 预先设定 data-theme 以避免闪烁（FOUC），
 * 本脚本负责：控件联动、点击切换、系统主题实时跟随。
 * ===================================================================== */
(function () {
  "use strict";
  var KEY = "tj_theme";
  var root = document.documentElement;

  function systemPref() {
    if (!window.matchMedia) return "dark";
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  function resolve(mode) {
    return mode === "system" ? systemPref() : mode;
  }
  function apply(mode) {
    root.dataset.theme = resolve(mode);
  }
  function syncControls(mode) {
    var btns = document.querySelectorAll("[data-theme-opt]");
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      b.classList.toggle("active", b.getAttribute("data-theme-opt") === mode);
    }
  }
  function setTheme(mode) {
    try { localStorage.setItem(KEY, mode); } catch (e) {}
    apply(mode);
    syncControls(mode);
  }

  function init() {
    var mode = "system";
    try { mode = localStorage.getItem(KEY) || "system"; } catch (e) {}
    apply(mode);
    syncControls(mode);

    // 处于「跟随系统」时，系统主题变化立即反映
    if (window.matchMedia) {
      var mq = window.matchMedia("(prefers-color-scheme: light)");
      var onChange = function () {
        var m = "system";
        try { m = localStorage.getItem(KEY) || "system"; } catch (e) {}
        if (m === "system") { apply("system"); }
      };
      if (mq.addEventListener) mq.addEventListener("change", onChange);
      else if (mq.addListener) mq.addListener(onChange); // 兼容旧浏览器
    }
  }

  // 暴露给内联 onclick
  window.TriuneTheme = { set: setTheme, init: init };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
