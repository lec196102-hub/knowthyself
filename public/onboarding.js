/*
 * 气质测试 Onboarding 门禁（共享脚本，每日 10 题版）
 *
 * 行为：
 *  - 页面加载时拉取今日状态 GET /api/temperament/today
 *  - 已完成（6 天答满）：直接进入聊天，在聊天里贴出恭喜词
 *  - 今日有题：弹出「今日 10 题」浮层（首次强制、无关闭；之后可「稍后再说」）
 *  - 今日已答完但未完成：提示「今日已完成」，可进入聊天，明天再来
 *  - 提交 POST /api/temperament/answer 累积进度；答满 60 题弹出恭喜词
 *
 * 同时被 public/index.html（Web）与 public/widget.html（桌宠）引入。
 */

(function () {
  "use strict";
  var DEFAULT_USER = "default";
  var TOTAL = 60;
  var PER_DAY = 10;
  var TOTAL_DAYS = Math.ceil(TOTAL / PER_DAY); // 6

  var chat = document.getElementById("chat");
  var inputArea = document.querySelector(".input-area");
  if (!chat || !inputArea) return;

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function fmtProfile(profile) {
    if (!profile) return "";
    var typeLabel = { choleric: "胆汁质", sanguine: "多血质", phlegmatic: "粘液质", melancholic: "抑郁质" };
    var primary = typeLabel[profile.primary] || profile.primary;
    var secondary = profile.secondary ? " + " + (typeLabel[profile.secondary] || profile.secondary) : "";
    return "你的气质：" + primary + secondary + "。";
  }

  async function fetchToday() {
    var r = await fetch("/api/temperament/today?userId=" + DEFAULT_USER);
    var data = await r.json();
    return data.success ? data.data : null;
  }

  function enterChat(congrats, profile) {
    var overlay = document.getElementById("onboarding-overlay");
    if (overlay) overlay.remove();
    inputArea.style.display = "flex";
    chat.innerHTML = "";
    if (congrats) {
      chat.insertAdjacentHTML(
        "beforeend",
        '<div class="msg msg-superego"><div class="msg-sender">超我</div>' +
          esc(congrats).replace(/\n/g, "<br>") + "</div>"
      );
    } else if (profile) {
      chat.insertAdjacentHTML(
        "beforeend",
        '<div class="msg msg-superego"><div class="msg-sender">超我</div>' +
          "气质测试完成。" + esc(fmtProfile(profile)) + "<br>现在，把今天的事说给我们听吧。</div>"
      );
    }
  }

  function progressLine(t) {
    return (
      "第 " + (t.day || 1) + " / " + TOTAL_DAYS + " 天 · 已答 " +
      (t.answered || 0) + " / " + (t.total || TOTAL)
    );
  }

  function showQuestionnaire(t) {
    return new Promise(function (resolve) {
      inputArea.style.display = "none";
      chat.innerHTML = '<div class="empty">每天 10 题，6 天认识自己 🌱</div>';

      var overlay = document.createElement("div");
      overlay.id = "onboarding-overlay";
      overlay.style.cssText =
        "position:fixed;inset:0;background:linear-gradient(135deg,#0d1117 0%,#13182a 60%,#0d1117 100%);" +
        "color:#c9d1d9;overflow-y:auto;" +
        "padding:32px 16px 100px;z-index:1000;font-family:system-ui,-apple-system,sans-serif;";

      var opts = [
        [1, "很符合"],
        [2, "比较符合"],
        [3, "中间"],
        [4, "比较不符"],
        [5, "完全不符"],
      ];

      var html = '<div style="max-width:720px;margin:0 auto;">';
      html +=
        '<div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;">' +
          '<img src="assets/laoji-logo.png" width="38" height="38" alt="老己">' +
          '<div>' +
            '<h2 style="color:#e6edf3;font-size:20px;margin:0 0 4px;font-weight:700;">气质测试 · 今日 10 题</h2>' +
            '<div style="color:#8b949e;font-size:12.5px;">' + progressLine(t) + '</div>' +
          '</div>' +
        '</div>';
      html +=
        '<p style="color:#8b949e;font-size:13px;margin-bottom:18px;line-height:1.6;">' +
        "凭第一感觉作答，每天只需 10 题，6 天答完以后老己会更贴合你。</p>";
      html += '<div id="q-list">';

      (t.todayQuestions || []).forEach(function (q) {
        html +=
          '<div class="q-item" style="margin-bottom:14px;padding:12px 14px;' +
          'background:#161b22;border:1px solid #30363d;border-radius:10px;">';
        html +=
          '<div style="font-size:14px;margin-bottom:8px;">' + q.id + ". " + esc(q.text) + "</div>";
        html += '<div class="opts" style="display:flex;flex-wrap:wrap;gap:10px;">';
        opts.forEach(function (o) {
          html +=
            '<label style="font-size:12px;cursor:pointer;display:flex;align-items:center;gap:4px;">' +
            '<input type="radio" name="q' + q.id + '" value="' + o[0] + '"> ' + o[1] +
            "</label>";
        });
        html += "</div></div>";
      });

      html += "</div>";
      html +=
        '<div style="position:fixed;left:0;right:0;bottom:0;background:#0d1117;' +
        'padding:14px 0;text-align:center;border-top:1px solid #30363d;">' +
        '<button id="submit-test" class="btn-bubble primary" style="padding:11px 26px;font-size:14px;">' +
        '<svg class="bubble-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
          '<path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
        '</svg>提交今日答题</button>' +
        '<div id="form-msg" style="color:#8b949e;font-size:12px;margin-top:8px;"></div>' +
        '<div style="margin-top:10px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">' +
        '<button id="later-btn" class="btn-bubble ghost" style="padding:7px 16px;font-size:12px;">' +
        (t.onboarded ? "稍后再说，先去聊天" : "先随便聊聊，稍后再测 🌱") + '</button>' +
        '<button id="import-alt-btn" class="btn-bubble" style="padding:7px 16px;font-size:12px;">' +
        '<svg class="bubble-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
          '<rect x="1.5" y="2.5" width="13" height="11" rx="3" fill="rgba(255,255,255,.18)" stroke="currentColor" stroke-width="1.6"/>' +
          '<path d="M5.5 13.5 L5.5 16.5 L8.5 13.5" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" fill="rgba(255,255,255,.18)"/>' +
          '<rect x="9" y="10" width="13" height="11" rx="3" fill="rgba(255,255,255,.18)" stroke="currentColor" stroke-width="1.6"/>' +
          '<path d="M15.5 21 L15.5 24 L18.5 21" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" fill="rgba(255,255,255,.18)"/>' +
        '</svg>导入旧日记测气质</button></div>' +
        "</div></div>";

      overlay.innerHTML = html;
      document.body.appendChild(overlay);

      var laterBtn = document.getElementById("later-btn");
      if (laterBtn) {
        laterBtn.addEventListener("click", function () {
          // 首启摩擦优化：始终允许跳过测试，先写一条、默认语气；气质测试作为轻引导
          enterChat(null, t.onboarded ? t.profile : null);
          resolve(true);
        });
      }

      // 「导入旧日记测气质」——问卷的替代构建路径（FR-11）：贴旧日记 → 自动聚合推断画像
      var importAlt = document.getElementById("import-alt-btn");
      if (importAlt) {
        importAlt.addEventListener("click", function () {
          if (window.TriuneImport) {
            window.TriuneImport.open({ onEntered: function () { resolve(true); } });
          }
        });
      }

      document.getElementById("submit-test").addEventListener("click", async function () {
        var msg = document.getElementById("form-msg");
        var answers = {};
        var missing = 0;
        (t.todayQuestions || []).forEach(function (q) {
          var sel = overlay.querySelector('input[name="q' + q.id + '"]:checked');
          if (sel) answers[q.id] = parseInt(sel.value, 10);
          else missing++;
        });
        if (missing > 0) {
          msg.style.color = "#f85149";
          msg.textContent = "还有 " + missing + " 题未作答";
          return;
        }
        msg.style.color = "#8b949e";
        msg.textContent = "提交中...";
        try {
          var r = await fetch("/api/temperament/answer", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ answers: answers, userId: DEFAULT_USER }),
          });
          var data = await r.json();
          if (!data.success) {
            msg.style.color = "#f85149";
            msg.textContent = (data.error || "提交失败") + "";
            return;
          }
          var d = data.data || {};
          if (d.completed) {
            // 6 天答满：恭喜词浮层
            showCongrats(d.congrats, d.profile);
          } else {
            // 今日完成，明天再来
            var remain = (d.total || TOTAL) - (d.answered || 0);
            msg.style.color = "#7ee787";
            msg.textContent = "今日已完成 🎉 还差 " + remain + " 题，明天再来～";
            var enter = document.createElement("button");
            enter.className = "btn-bubble primary";
            enter.style.cssText = "margin-top:10px;padding:8px 22px;font-size:13px;";
            enter.innerHTML =
              '<svg class="bubble-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<path d="M5 12h12M13 6l6 6-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
              '</svg>去聊天';
            enter.onclick = function () {
              enterChat(null, d.profile);
              resolve(true);
            };
            msg.parentNode.appendChild(enter);
          }
        } catch (e) {
          msg.style.color = "#f85149";
          msg.textContent = "提交失败，请重试";
        }
      });
    });
  }

  function showCongrats(congrats, profile) {
    var overlay = document.getElementById("onboarding-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "onboarding-overlay";
      overlay.style.cssText =
        "position:fixed;inset:0;background:linear-gradient(135deg,#0d1117 0%,#13182a 60%,#0d1117 100%);" +
        "color:#c9d1d9;overflow-y:auto;" +
        "padding:40px 16px;z-index:1000;font-family:system-ui,-apple-system,sans-serif;";
      document.body.appendChild(overlay);
    }
    overlay.innerHTML =
      '<div style="max-width:640px;margin:8vh auto 0;background:#161b22;border:1px solid rgba(55,138,221,.4);' +
      'border-radius:18px;padding:30px;text-align:center;white-space:pre-wrap;line-height:1.8;' +
      'box-shadow:0 24px 80px rgba(0,0,0,.45),0 0 0 1px rgba(55,138,221,.1);">' +
      '<img src="assets/laoji-logo.png" width="56" height="56" alt="老己" style="margin:0 auto 14px;display:block;">' +
      '<div style="font-size:15px;color:#e6edf3;">' +
      esc(congrats || "恭喜你完成气质探索！").replace(/\n/g, "<br>") + "</div>" +
      '<button id="enter-chat" class="btn-bubble primary" style="margin-top:22px;padding:11px 26px;font-size:14px;">' +
      '<svg class="bubble-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M5 12h12M13 6l6 6-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>进入聊天</button>' +
      "</div>";
    document.getElementById("enter-chat").addEventListener("click", function () {
      enterChat(congrats, profile);
    });
  }

  function showDailyDoneBanner(t) {
    // 今日已答完但未完成：允许聊天，提示明天继续
    inputArea.style.display = "none";
    chat.innerHTML =
      '<div class="empty">今日气质测试已完成 🎉<br>还差 ' +
      ((t.total || TOTAL) - (t.answered || 0)) + " 题，明天再来～<br>先去和老己聊聊吧。</div>";
    var overlay = document.createElement("div");
    overlay.id = "onboarding-overlay";
    overlay.style.cssText =
      "position:fixed;inset:0;background:linear-gradient(135deg,rgba(13,17,23,.96) 0%,rgba(19,24,42,.96) 60%,rgba(13,17,23,.96) 100%);" +
      "color:#c9d1d9;z-index:1000;" +
      "display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,sans-serif;";
    overlay.innerHTML =
      '<div style="background:#161b22;border:1px solid rgba(55,138,221,.4);border-radius:18px;padding:26px 30px;text-align:center;' +
      'box-shadow:0 24px 80px rgba(0,0,0,.45),0 0 0 1px rgba(55,138,221,.1);">' +
      '<img src="assets/laoji-logo.png" width="48" height="48" alt="老己" style="margin:0 auto 12px;display:block;">' +
      '<div style="font-size:14px;color:#c9d1d9;margin-bottom:18px;">今日已答完，明天继续补全气质画像</div>' +
      '<button id="enter-chat" class="btn-bubble primary" style="padding:11px 26px;font-size:14px;">' +
      '<svg class="bubble-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M5 12h12M13 6l6 6-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>去聊天</button></div>';
    document.body.appendChild(overlay);
    document.getElementById("enter-chat").addEventListener("click", function () {
      enterChat(null, t.profile);
    });
  }

  async function init() {
    try {
      var t = await fetchToday();
      if (!t) {
        chat.innerHTML = '<div class="empty">加载气质测试失败，请刷新页面重试。</div>';
        return;
      }
      if (t.completed) {
        enterChat(t.congrats, t.profile);
        return;
      }
      if (t.todayQuestions && t.todayQuestions.length > 0) {
        await showQuestionnaire(t);
        return;
      }
      // 今日已答完但未完成
      showDailyDoneBanner(t);
    } catch (e) {
      chat.innerHTML = '<div class="empty">初始化气质测试失败，请刷新页面重试。</div>';
    }
  }

  init();
})();
