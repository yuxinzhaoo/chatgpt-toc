// ==UserScript==
// @name         ChatGPT TOC Panel with Full Resize
// @description 右侧问答目录面板，支持拖动 + 八方向缩放 + 动画展开收起
// ==/UserScript==
let panel;
const questions = new Map();
let observer;
let intervalId;

function createTOCPanel() {
  if (document.getElementById("chatgpt-toc-panel")) return;

  panel = document.createElement("div");
  panel.id = "chatgpt-toc-panel";
  panel.setAttribute("data-plugin", "chatgpt-toc");
  panel.innerHTML = `
    <div id="chatgpt-toc-dragbar" style="
      height: 36px;
      background: linear-gradient(to bottom, #f9f9f9, #ececec);
      border-bottom: 1px solid #ddd;
      border-top-left-radius: 12px;
      border-top-right-radius: 12px;
      cursor: move;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 10px;
      font-weight: 600;
      font-size: 14px;
      font-family: 'Segoe UI', sans-serif;
      position: sticky;
      top: 0;
      z-index: 10;
    ">
      <div style="display: flex; align-items: center;">
        <div id="btn-toggle" style="
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: #ffbd2e;
          cursor: pointer;
          transition: background 0.2s;
        "></div>
      </div>
      <div style="flex: 1; text-align: center;">My Prompts</div>
      <div style="width: 12px;"></div>
    </div>
    <ul id="toc-list" style="
      margin: 0;
      padding: 8px 0;
      height: 100%;
      overflow-y: auto;
      transition: max-height 0.3s ease, opacity 0.3s ease;
      opacity: 1;
    "></ul>
    <div class="resize-handle resize-top"></div>
    <div class="resize-handle resize-right"></div>
    <div class="resize-handle resize-bottom"></div>
    <div class="resize-handle resize-left"></div>
    <div class="resize-handle resize-top-left"></div>
    <div class="resize-handle resize-top-right"></div>
    <div class="resize-handle resize-bottom-left"></div>
    <div class="resize-handle resize-bottom-right"></div>
  `;

  Object.assign(panel.style, {
    position: "fixed",
    top: "100px",
    left: `${window.innerWidth - 320}px`,
    width: "280px",
    background: "#fff",
    border: "1px solid #ddd",
    padding: "0 0 12px 0",
    zIndex: "9999",
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
    borderRadius: "12px",
    fontSize: "14px",
    fontFamily: "'Segoe UI', sans-serif",
    overflow: "hidden",
  });

  document.body.appendChild(panel);
  updateTOC();

  const style = document.createElement("style");
  style.textContent = `
    .resize-handle {
      position: absolute;
      background: transparent;
      z-index: 9999;
    }
    .resize-top { top: -2px; left: 0; right: 0; height: 6px; cursor: n-resize; }
    .resize-right { top: 0; right: -2px; bottom: 0; width: 6px; cursor: e-resize; }
    .resize-bottom { bottom: -2px; left: 0; right: 0; height: 6px; cursor: s-resize; }
    .resize-left { top: 0; left: -2px; bottom: 0; width: 6px; cursor: w-resize; }
    .resize-top-left { top: -2px; left: -2px; width: 10px; height: 10px; cursor: nw-resize; }
    .resize-top-right { top: -2px; right: -2px; width: 10px; height: 10px; cursor: ne-resize; }
    .resize-bottom-left { bottom: -2px; left: -2px; width: 10px; height: 10px; cursor: sw-resize; }
    .resize-bottom-right { bottom: -2px; right: -2px; width: 10px; height: 10px; cursor: se-resize; }
  `;
  document.head.appendChild(style);

  // 拖动逻辑
  const dragbar = panel.querySelector("#chatgpt-toc-dragbar");
  let isDragging = false,
    offsetX,
    offsetY;
  dragbar.addEventListener("mousedown", (e) => {
    isDragging = true;
    offsetX = e.clientX - panel.offsetLeft;
    offsetY = e.clientY - panel.offsetTop;
    document.body.style.userSelect = "none";
  });
  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;

    const newLeft = e.clientX - offsetX;
    const newTop = e.clientY - offsetY;

    // 限制边界（避免移出窗口）
    const minX = 0;
    const minY = 0;
    const maxX = window.innerWidth - panel.offsetWidth;
    const maxY = window.innerHeight - panel.offsetHeight;

    panel.style.left = `${Math.min(Math.max(newLeft, minX), maxX)}px`;
    panel.style.top = `${Math.min(Math.max(newTop, minY), maxY)}px`;
  });

  document.addEventListener("mouseup", () => {
    isDragging = false;
    document.body.style.userSelect = "auto";
  });

  // 展开/收起
  const toggleBtn = panel.querySelector("#btn-toggle");
  let isMinimized = false;
  toggleBtn.addEventListener("click", () => {
    const ul = panel.querySelector("#toc-list");
    if (isMinimized) {
      ul.style.display = "block";
      panel.style.height = panel.dataset.originalHeight || "400px"; // 可自定义默认高度
      toggleBtn.style.background = "#ffbd2e";
    } else {
      panel.dataset.originalHeight = panel.offsetHeight + "px"; // 保存当前高度用于还原
      ul.style.display = "none";
      panel.style.height = "36px"; // 只显示顶部拖动条高度
      toggleBtn.style.background = "#28c840";
    }
    isMinimized = !isMinimized;
  });

  // 八方向 resize 逻辑
  [
    "top",
    "right",
    "bottom",
    "left",
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right",
  ].forEach((dir) => {
    const handle = panel.querySelector(`.resize-${dir}`);
    if (!handle) return;
    handle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const startWidth = panel.offsetWidth;
      const startHeight = panel.offsetHeight;
      const startTop = panel.offsetTop;
      const startLeft = panel.offsetLeft;
      function onMove(e) {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        const minWidth = 200;
        const minHeight = 150;

        if (dir.includes("right")) {
          panel.style.width = `${Math.max(minWidth, startWidth + dx)}px`;
        }

        if (dir.includes("bottom")) {
          panel.style.height = `${Math.max(minHeight, startHeight + dy)}px`;
        }

        if (dir.includes("left")) {
          const newWidth = Math.max(minWidth, startWidth - dx);
          const newLeft = startLeft + (startWidth - newWidth);
          panel.style.width = `${newWidth}px`;
          panel.style.left = `${newLeft}px`;
        }

        if (dir.includes("top")) {
          const newHeight = Math.max(minHeight, startHeight - dy);
          const newTop = startTop + (startHeight - newHeight);
          panel.style.height = `${newHeight}px`;
          panel.style.top = `${newTop}px`;
        }
      }

      function onUp() {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.userSelect = "auto";
      }
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  });
}

function updateTOC() {
  if (!panel) return;
  const ul = panel.querySelector("#toc-list");
  if (!ul) return;

  ul.style.scrollbarWidth = "thin";
  ul.style.msOverflowStyle = "none";
  ul.style.overflowY = "auto";

  const styleId = "custom-scroll-style";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.innerHTML = `
      #toc-list::-webkit-scrollbar { width: 6px; }
      #toc-list::-webkit-scrollbar-thumb { background-color: rgba(0,0,0,0.2); border-radius: 4px; }
    `;
    document.head.appendChild(style);
  }

  ul.innerHTML = "";
  let index = 1;
  questions.forEach((node, text) => {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = "#";
    a.textContent = `${index++}. ${text.slice(0, 50)}`;
    Object.assign(a.style, {
      display: "block",
      padding: "6px 10px",
      borderRadius: "6px",
      color: "#1a73e8",
      textDecoration: "none",
      transition: "background 0.2s",
      fontSize: "13px",
      lineHeight: "1.4",
    });
    a.addEventListener("mouseenter", () => (a.style.background = "#f1f3f4"));
    a.addEventListener(
      "mouseleave",
      () => (a.style.background = "transparent")
    );
    a.onclick = (e) => {
      e.preventDefault();
      node.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    li.appendChild(a);
    ul.appendChild(li);
  });
}

function setupMutationObserver() {
  const observer = new MutationObserver(() => {
    const chatItems = document.querySelectorAll(".text-base:not([data-toc])");
    chatItems.forEach((el) => {
      const text = el.innerText;
      const parent = el.closest('[data-testid*="conversation-turn"]');
      if (
        parent?.querySelector(".whitespace-pre-wrap") &&
        parent?.querySelector(".items-end")
      ) {
        if (!questions.has(text)) {
          questions.set(text, el);
          el.setAttribute("data-toc", "1");
          updateTOC();
        }
      }
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function monitorChatSwitch() {
  let lastPath = location.pathname;
  intervalId = setInterval(() => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      cleanup(); // 自动清理旧数据和观察器
      questions.clear();
      updateTOC();
      setupMutationObserver(); // 重新设置观察器
    }
  }, 1000);
}

function init() {
  createTOCPanel();
  setupMutationObserver();
  monitorChatSwitch();
  window.addEventListener("beforeunload", cleanup);
  setInterval(() => {
    if (!document.getElementById("chatgpt-toc-panel")) createTOCPanel();
  }, 1000);
}

// ✅ 这里插入 cleanup 函数
function cleanup() {
  observer?.disconnect();
  clearInterval(intervalId);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
