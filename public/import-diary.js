/*
 * 导入旧日记 · 浮层（Web 与桌宠共享）
 *
 * 行为：
 *  - 提供「📥 导入旧日记」入口：用户把以前在别处写过的日记贴进来（一行一篇），
 *    可选在每行开头加日期 `2024-05-01 今天...`，系统自动按日期还原时间线。
 *  - 调用 POST /api/journal/import?autoInfer=true，导入完成后立刻用这些历史日记
 *    聚合推断四气质画像（FR-10 / FR-11 的落地闭环）。
 *  - 成功后展示恭喜词并解锁聊天输入；失败/不足则给出明确提示。
 *
 * 设计为「独立共享脚本」而非放进 onboarding.js：桌宠页用的是 `.input`（非 `.input-area`），
 * onboarding.js 在桌宠里会因查不到 .input-area 而整体 return，故导入逻辑必须自包含。
 *
 * 暴露 window.TriuneImport.open(opts)，opts.onEntered 在「进入聊天」时回调（用于解锁 onboarding 的 resolve）。
 *
 * 设计语言：米白卡纸 · 大量留白 · 弱化信息密度 · 暖色阴影
 */

(function () {
  "use strict";

  var DEFAULT_USER = "default";

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  /** 注入浮层样式（仅一次） */
  function injectImportStyles() {
    if (document.getElementById("import-overlay-styles")) return;
    var s = document.createElement("style");
    s.id = "import-overlay-styles";
    s.textContent = [
      // ========= 背景遮罩：暖白渐变 =========
      "#import-overlay{position:fixed;inset:0;overflow-y:auto;padding:48px 16px;z-index:1100;",
      "font-family:system-ui,-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;color:#3d342a;",
      "background:",
      "  radial-gradient(ellipse 70% 50% at 50% 0%,rgba(232,210,170,.35) 0%,rgba(248,243,232,0) 60%),",
      "  radial-gradient(ellipse 60% 60% at 50% 100%,rgba(210,180,140,.22) 0%,rgba(248,243,232,0) 60%),",
      "  #f6f1e4;",
      "animation:importFadeIn .3s ease-out}",
      "@keyframes importFadeIn{from{opacity:0}to{opacity:1}}",

      // ========= 卡片：米白卡纸 + 暖色柔阴影 =========
      "#import-overlay .imp-card{max-width:680px;margin:6vh auto 0;",
      "background:linear-gradient(180deg,#fbf8f0 0%,#f5efe1 100%);",
      "border:1px solid rgba(180,155,115,.22);border-radius:22px;",
      "padding:48px 52px 40px;",
      "box-shadow:0 20px 60px rgba(120,90,50,.12),0 4px 14px rgba(120,90,50,.06),inset 0 1px 0 rgba(255,255,255,.6);",
      "animation:impSlideUp .4s cubic-bezier(.16,1,.3,1)}",
      "@keyframes impSlideUp{from{opacity:0;transform:translateY(24px) scale(.99)}to{opacity:1;transform:none}}",

      // ========= 头部 =========
      "#import-overlay .imp-head{display:flex;align-items:flex-start;gap:18px;margin-bottom:32px}",
      "#import-overlay .imp-head-l{display:flex;gap:16px;align-items:center;flex:1;min-width:0}",
      "#import-overlay .imp-logo{width:52px;height:52px;border-radius:14px;flex-shrink:0;",
      "box-shadow:0 6px 18px rgba(120,90,50,.18),0 0 0 1px rgba(255,255,255,.6)}",
      "#import-overlay .imp-title{color:#2a2218;font-size:22px;font-weight:700;margin:0 0 4px;",
      "letter-spacing:-.01em;line-height:1.3}",
      "#import-overlay .imp-sub{color:#9b8a72;font-size:13px;line-height:1.5;font-weight:400}",
      "#import-overlay .imp-close{width:36px;height:36px;border-radius:12px;background:transparent;",
      "border:1px solid rgba(155,138,114,.25);color:#9b8a72;cursor:pointer;",
      "display:flex;align-items:center;justify-content:center;transition:all .2s;flex-shrink:0;padding:0}",
      "#import-overlay .imp-close:hover{background:rgba(180,80,60,.08);border-color:rgba(180,80,60,.35);color:#a84a3a;transform:rotate(90deg)}",

      // ========= 正文段落 =========
      "#import-overlay .imp-intro{color:#5a4d3c;font-size:14.5px;line-height:1.95;margin:0 0 28px;letter-spacing:.005em}",
      "#import-overlay .imp-intro b{color:#2a2218;font-weight:600}",

      // ========= 信息条：宽松小卡片 =========
      "#import-overlay .imp-tip{display:flex;gap:14px;align-items:flex-start;",
      "background:linear-gradient(135deg,#f3ead4 0%,#ebe0c4 100%);",
      "border:1px solid rgba(180,155,115,.25);border-radius:14px;padding:16px 18px;margin-bottom:32px}",
      "#import-overlay .imp-tip-ico{width:30px;height:30px;border-radius:10px;flex-shrink:0;",
      "background:linear-gradient(135deg,#b8884a,#8a5e2a);color:#fff7e6;",
      "display:flex;align-items:center;justify-content:center;",
      "box-shadow:0 4px 10px rgba(140,90,30,.25)}",
      "#import-overlay .imp-tip-txt{color:#5a4d3c;font-size:13px;line-height:1.75;padding-top:3px}",
      "#import-overlay .imp-tip-txt b{color:#3d2e18;font-weight:600;margin-right:4px}",
      "#import-overlay .imp-tip-txt code{background:rgba(255,255,255,.55);",
      "border:1px solid rgba(180,155,115,.35);padding:2px 8px;border-radius:5px;",
      "color:#7a5a2a;font-size:12.5px;font-family:ui-monospace,Consolas,monospace;font-weight:500}",

      // ========= 输入区：白底 + 暖色边 =========
      "#import-overlay .imp-ta-wrap{position:relative;",
      "background:#fffdf7;",
      "border:1px solid rgba(180,155,115,.35);border-radius:16px;",
      "transition:border-color .2s,box-shadow .2s;overflow:hidden}",
      "#import-overlay .imp-ta-wrap:focus-within{border-color:rgba(127,119,221,.55);",
      "box-shadow:0 0 0 4px rgba(127,119,221,.08),0 0 24px rgba(127,119,221,.06)}",
      "#import-overlay #import-text{width:100%;min-height:220px;max-height:46vh;resize:vertical;",
      "padding:20px 22px;background:transparent;color:#2a2218;border:0;outline:0;",
      "font-size:14.5px;line-height:1.85;font-family:inherit;display:block;border-radius:16px}",
      "#import-overlay #import-text::placeholder{color:#b5a78d;white-space:pre-wrap;line-height:1.85}",

      // ========= 计数器：宽松 =========
      "#import-overlay .imp-counter{display:flex;justify-content:space-between;align-items:center;",
      "margin-top:14px;color:#9b8a72;font-size:12.5px;font-variant-numeric:tabular-nums;",
      "font-family:ui-monospace,Consolas,monospace;padding:0 4px}",
      "#import-overlay .imp-counter-r b,#import-overlay .imp-counter-r span{color:#5a4d3c;font-weight:600}",
      "#import-overlay .imp-counter-l{display:flex;align-items:center;gap:8px;color:#9b8a72}",
      "#import-overlay .imp-counter-dot{width:7px;height:7px;border-radius:50%;background:#5a9a5a;",
      "box-shadow:0 0 8px rgba(90,154,90,.45);transition:background .2s,box-shadow .2s}",
      "#import-overlay .imp-counter-dot.empty{background:#c0b29a;box-shadow:none}",
      "#import-overlay .imp-counter-dot.warn{background:#c89030;box-shadow:0 0 8px rgba(200,144,48,.45)}",

      // ========= 消息 =========
      "#import-overlay .imp-msg{font-size:13px;margin-top:18px;min-height:20px;text-align:center;",
      "padding:11px 16px;border-radius:12px;transition:all .2s}",
      "#import-overlay .imp-msg:empty{display:none}",
      "#import-overlay .imp-msg.err{color:#a84a3a;background:rgba(180,80,60,.08);border:1px solid rgba(180,80,60,.18)}",
      "#import-overlay .imp-msg.warn{color:#a86a20;background:rgba(200,144,48,.10);border:1px solid rgba(200,144,48,.22)}",
      "#import-overlay .imp-msg.ok{color:#3a7a3a;background:rgba(90,154,90,.10);border:1px solid rgba(90,154,90,.22)}",

      // ========= 操作栏 =========
      "#import-overlay .imp-actions{display:flex;gap:14px;margin-top:28px;align-items:center}",
      "#import-overlay .imp-actions .imp-primary{flex:1;justify-content:center;",
      "padding:14px 24px !important;font-size:14.5px;font-weight:600;",
      "box-shadow:0 10px 28px rgba(55,138,221,.30),inset 0 1px 0 rgba(255,255,255,.18)}",
      "#import-overlay .imp-actions .imp-ghost{padding:14px 28px !important;font-size:14.5px;font-weight:500}",
      "#import-overlay .imp-actions .imp-primary:disabled{opacity:.55;cursor:not-allowed;",
      "box-shadow:none !important;transform:none !important}",

      // ========= 响应式 =========
      "@media (max-width:600px){#import-overlay .imp-card{padding:32px 26px 28px;margin:3vh auto 0}",
      "#import-overlay .imp-logo{width:44px;height:44px;border-radius:12px}",
      "#import-overlay .imp-title{font-size:19px}",
      "#import-overlay .imp-intro{font-size:14px;line-height:1.85}",
      "#import-overlay .imp-actions{flex-direction:column-reverse;gap:10px}",
      "#import-overlay .imp-actions .imp-primary,#import-overlay .imp-actions .imp-ghost{width:100%}}"
    ].join("");
    document.head.appendChild(s);
  }

  /** 把粘贴的文本拆成条目：每行一篇；行首 `YYYY-MM-DD ` 解析为日期 */
  function parseEntries(raw) {
    var lines = String(raw || "").split(/\r?\n/);
    var entries = [];
    var dateRe = /^(\d{4}[-/]\d{1,2}[-/]\d{1,2})\s*[：: ]?\s*([\s\S]+)$/;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      var m = line.match(dateRe);
      if (m && m[2].trim()) {
        entries.push({ text: m[2].trim(), date: m[1].replace(/\//g, "-") });
      } else {
        entries.push({ text: line });
      }
    }
    return entries;
  }

  /** 解锁聊天输入：兼容 Web(.input-area) 与桌宠(.input) 两种布局 */
  function unlockChat() {
    var ob = document.getElementById("onboarding-overlay");
    if (ob) ob.remove();
    var ia = document.querySelector(".input-area");
    if (ia) ia.style.display = "flex";
    var wInput = document.querySelector(".input");
    if (wInput) wInput.style.display = "flex";
    var ta = document.getElementById("input");
    if (ta) {
      ta.disabled = false;
      ta.focus();
    }
    var btn = document.getElementById("btn");
    if (btn) btn.disabled = false;
  }

  /** 在聊天区贴出恭喜词（超我气泡） */
  function showCongratsBubble(congrats) {
    var chat = document.getElementById("chat");
    if (!chat) return;
    chat.innerHTML = "";
    var d = document.createElement("div");
    d.className = "msg msg-superego";
    d.innerHTML =
      '<div class="msg-sender">超我</div>' + esc(congrats || "你的气质画像已生成！").replace(/\n/g, "<br>");
    chat.appendChild(d);
  }

  function open(opts) {
    opts = opts || {};
    // 避免重复打开
    var existing = document.getElementById("import-overlay");
    if (existing) existing.remove();

    injectImportStyles();

    var overlay = document.createElement("div");
    overlay.id = "import-overlay";

    var placeholder =
      "2024-05-01 今天又被领导当众点名了，气死我！\n" +
      "2024-05-10 和朋友出去玩太爽了，哈哈\n" +
      "2024-06-02 最近总是有点低落，想太多睡不着";

    overlay.innerHTML =
      '<div class="imp-card">' +
        // 头部
        '<div class="imp-head">' +
          '<div class="imp-head-l">' +
            '<img class="imp-logo" src="assets/laoji-logo.png" alt="老己">' +
            '<div>' +
              '<h2 class="imp-title">把旧日记交给老己</h2>' +
              '<div class="imp-sub">一行一篇 · 老己会越读越像你</div>' +
            '</div>' +
          '</div>' +
          '<button class="imp-close" id="import-close" type="button" aria-label="关闭">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
              '<path d="M6 6l12 12M6 18L18 6"/>' +
            '</svg>' +
          '</button>' +
        '</div>' +
        // 正文
        '<p class="imp-intro">把以前在别处写过的日记贴进来，<b>一行一篇</b>。老己会越读越像你——不用重新答题，也不用把旧日记重抄一遍。</p>' +
        // 信息条
        '<div class="imp-tip">' +
          '<div class="imp-tip-ico">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
              '<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.4 1 1 1 1.7V18h6v-1.6c0-.7.4-1.3 1-1.7A7 7 0 0 0 12 2z"/>' +
            '</svg>' +
          '</div>' +
          '<div class="imp-tip-txt"><b>可选：</b>在每行开头加 <code>YYYY-MM-DD</code>，系统会按时间线还原你的过去。</div>' +
        '</div>' +
        // 输入区
        '<div class="imp-ta-wrap">' +
          '<textarea id="import-text" placeholder="' + esc(placeholder) + '"></textarea>' +
        '</div>' +
        // 计数器
        '<div class="imp-counter">' +
          '<div class="imp-counter-l">' +
            '<span class="imp-counter-dot empty" id="import-dot"></span>' +
            '<span id="import-status">等待粘贴</span>' +
          '</div>' +
          '<div class="imp-counter-r">' +
            '<b id="import-count-entries">0</b> 条 · ' +
            '<span id="import-count-chars">0</span> 字' +
          '</div>' +
        '</div>' +
        // 消息
        '<div id="import-msg" class="imp-msg"></div>' +
        // 操作
        '<div class="imp-actions">' +
          '<button id="import-cancel" type="button" class="btn-bubble ghost imp-ghost">取消</button>' +
          '<button id="import-go" type="button" class="btn-bubble primary imp-primary">' +
            '<svg class="bubble-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
              '<path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
            '</svg>' +
            '<span>开始导入并生成画像</span>' +
          '</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);
    var ta = document.getElementById("import-text");
    var msg = document.getElementById("import-msg");
    var go = document.getElementById("import-go");
    var cancel = document.getElementById("import-cancel");
    var close = document.getElementById("import-close");
    var countEntries = document.getElementById("import-count-entries");
    var countChars = document.getElementById("import-count-chars");
    var status = document.getElementById("import-status");
    var dot = document.getElementById("import-dot");

    if (ta) ta.focus();

    /** 实时更新计数器与状态 */
    function updateCount() {
      var entries = parseEntries(ta.value);
      var chars = ta.value.length;
      countEntries.textContent = entries.length;
      countChars.textContent = chars;
      dot.className = "imp-counter-dot" + (entries.length === 0 ? " empty" : entries.length < 3 ? " warn" : "");
      if (entries.length === 0) {
        status.textContent = "等待粘贴";
      } else if (entries.length < 3) {
        status.textContent = "再贴几条，气质会更准";
      } else {
        status.textContent = "准备就绪";
      }
    }
    ta.addEventListener("input", updateCount);
    updateCount();

    function closeModal() { overlay.remove(); }
    cancel.addEventListener("click", closeModal);
    close.addEventListener("click", closeModal);
    overlay.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeModal();
    });

    function setMsg(text, kind) {
      msg.className = "imp-msg" + (kind ? " " + kind : "");
      msg.textContent = text || "";
    }

    go.addEventListener("click", async function () {
      var entries = parseEntries(ta.value);
      if (entries.length === 0) {
        setMsg("请先粘贴至少一段日记内容。", "err");
        ta.focus();
        return;
      }
      go.disabled = true;
      cancel.disabled = true;
      close.disabled = true;
      setMsg("正在导入并推断你的气质…", "");

      try {
        var r = await fetch("/api/journal/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: DEFAULT_USER, entries: entries, autoInfer: true }),
        });
        var data = await r.json();

        if (!data.success) {
          setMsg((data.error || "导入失败") + "", "err");
          go.disabled = false;
          cancel.disabled = false;
          close.disabled = false;
          return;
        }

        var inf = data.infer;
        if (!inf) {
          setMsg(
            "已导入 " + (data.saved || 0) + " 篇（跳过 " + (data.skipped || 0) + " 篇），" +
            "但文本不足以生成画像，请多贴一些有效的日记内容。",
            "warn"
          );
          go.disabled = false;
          cancel.disabled = false;
          close.disabled = false;
          return;
        }

        // 成功：短暂展示成功提示，关闭浮层、解锁聊天、展示恭喜词
        setMsg("导入成功，老己正在生成你的气质画像…", "ok");
        setTimeout(function () {
          closeModal();
          unlockChat();
          var infData = inf.data || {};
          var congrats = infData.congrats || (infData.profile && infData.profile.congrats) || null;
          showCongratsBubble(congrats);
          if (typeof opts.onEntered === "function") opts.onEntered();
        }, 700);
      } catch (e) {
        setMsg("导入失败，请确认后端服务已启动后重试。", "err");
        go.disabled = false;
        cancel.disabled = false;
        close.disabled = false;
      }
    });
  }

  window.TriuneImport = { open: open };
})();
