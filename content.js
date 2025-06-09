// ==UserScript==
// @name         ChatGPT TOC Panel with Full Resize
// @description 右侧问答目录面板，支持拖动 + 八方向缩放 + 动画展开收起
// ==/UserScript==
let panel;
const questions = new Map();
let observer;
let intervalId;
const STORAGE_KEY = "chatgpt_toc_note";

function createTOCPanel() {
  if (document.getElementById("chatgpt-toc-panel")) return;

  panel = document.createElement("div");
  panel.id = "chatgpt-toc-panel";
  panel.setAttribute("data-plugin", "chatgpt-toc");
  fetch(chrome.runtime.getURL("panel.html"))
    .then((res) => res.text()) // ✅ 解析 HTML 内容
    .then((html) => {
      panel.innerHTML = html;
      setupPanelStyle();
      document.body.appendChild(panel);
      setupPanelEvents();
      updateTOC();

      // ✅ 注入 resize 样式（这段原来写在外面，要挪进来）
      if (!document.getElementById("chatgpt-toc-resize-style")) {
        const style = document.createElement("style");
        style.id = "chatgpt-toc-resize-style";
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
      }
    });
}

function setupPanelStyle() {
  const tocList = panel.querySelector("#toc-list");
  const noteEditor = panel.querySelector("#note-editor");
  const noteArea = panel.querySelector("#note-area");
  const dropzone = panel.querySelector("#notebook-dropzone");
  const btnBack = panel.querySelector("#btn-back");
  new DragInsertManager(noteArea, STORAGE_KEY);

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
    display: "block",
    overflow: "hidden",
    height: "70vh",
    minHeight: "150px",
    maxHeight: "95vh",
    flexShrink: "0",
  });

  Object.assign(tocList.style, {
    flex: "1",
    overflowY: "auto",
    overflowX: "hidden",
    maxHeight: "100%",
  });
  // 添加样式：让 noteEditor 绝对定位在主区域
  Object.assign(noteEditor.style, {
    position: "absolute",
    top: "36px", // 留出顶部 dragbar 高度
    left: "0",
    right: "0",
    bottom: "0",
    background: "#fff",
    padding: "10px",
    overflow: "auto",
    display: "none",
    zIndex: "1",
  });

  // 拖拽进入文本时切换到编辑模式
  dropzone.addEventListener("dragover", (e) => e.preventDefault());
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();

    const text = e.dataTransfer.getData("text/plain").trim();
    if (!text) return;

    tocList.style.display = "none";
    noteEditor.style.display = "block";
    noteArea.focus();

    // 判断当前是否为空
    const isEmpty = noteArea.innerText.trim().length === 0;

    const newNode = document.createTextNode(text + "\n\n");

    if (isEmpty) {
      // 插入到最前
      noteArea.innerText = ""; // 清空所有默认文本（包括空白提示）
      noteArea.appendChild(newNode);
    } else {
      // 插入到末尾
      const range = document.createRange();
      range.selectNodeContents(noteArea);
      range.collapse(false); // 移动到末尾

      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      range.insertNode(newNode);
    }

    // 更新本地存储
    localStorage.setItem(STORAGE_KEY, noteArea.innerText);
  });

  // 返回按钮切换回目录
  btnBack.addEventListener("click", () => {
    noteEditor.style.display = "none";
    tocList.style.display = "block";
  });

  dropzone.addEventListener("click", () => {
    tocList.style.display = "none";
    noteEditor.style.display = "block";
    const savedNote = localStorage.getItem(STORAGE_KEY);
    noteArea.innerText = savedNote || "(空白笔记，点击拖拽或输入)";
  });

  // 加载已有笔记（如果有）
  const savedNote = localStorage.getItem(STORAGE_KEY);
  if (savedNote) {
    noteArea.innerText = savedNote;
  }

  // 每次编辑就保存到 localStorage
  noteArea.addEventListener("input", () => {
    localStorage.setItem(STORAGE_KEY, noteArea.innerText);
  });
}

class DragInsertManager {
  constructor(editableEl, storageKey) {
    this.el = editableEl;
    this.key = storageKey;
    this.fakeCaret = null;
    this.lastCaretOffset = null;
    this.isHovering = false;
    this.dragCounter = 0;

    this.ensureStyle();
    this.bindEvents();
  }

  ensureStyle() {
    if (!document.getElementById("fake-caret-style")) {
      const style = document.createElement("style");
      style.id = "fake-caret-style";
      style.textContent = `
        .fake-caret {
          display: inline-block;
          width: 1px;
          height: 1em;
          background: #1a73e8;
          animation: blink 1s steps(2, start) infinite;
        }
        @keyframes blink {
          to { visibility: hidden; }
        }
      `;
      document.head.appendChild(style);
    }
  }

  bindEvents() {
    this.el.addEventListener("dragstart", (e) => this.onDragStart(e));
    this.el.addEventListener("dragenter", (e) => this.onDragEnter(e));
    this.el.addEventListener("dragleave", (e) => this.onDragLeave(e));
    this.el.addEventListener("dragover", (e) => this.onDragOver(e));
    this.el.addEventListener("drop", (e) => this.onDrop(e));
    this.el.addEventListener("mousedown", () => {
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) {
        this.el.setAttribute("draggable", "true");
      } else {
        this.el.removeAttribute("draggable");
      }
    });
  }

  onDragStart(e) {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      this.draggedRange = selection.getRangeAt(0).cloneRange();
    }
  }

  onDragEnter(e) {
    this.dragCounter += 1;
    if (this.dragCounter === 1) {
      this.el.style.background = "#f9f9f9";
    }
  }

  onDragLeave(e) {
    this.dragCounter -= 1;
    if (this.dragCounter === 0) {
      this.el.style.background = "white";
    }
    console.log(this.dragCounter);
  }

  onDragOver(e) {
    e.preventDefault();
    const pos = document.caretPositionFromPoint(e.clientX, e.clientY);
    if (!pos) return;

    const range = document.createRange();
    range.setStart(pos.offsetNode, pos.offset);
    range.collapse(true);

    const offsetKey = `${range.startContainer}_${range.startOffset}`;
    if (offsetKey === this.lastCaretOffset) return;
    this.lastCaretOffset = offsetKey;

    if (this.fakeCaret && this.fakeCaret.parentNode) this.fakeCaret.remove();

    this.fakeCaret = document.createElement("span");
    this.fakeCaret.className = "fake-caret";
    range.insertNode(this.fakeCaret);
  }

  onDrop(e) {
    e.preventDefault();

    const text = e.dataTransfer.getData("text/plain");
    if (!text) return;

    const range = document.caretRangeFromPoint(e.clientX, e.clientY);
    if (!range) return;

    // 💡 删除原位置的内容（内部拖动才执行）
    if (
      this.draggedRange &&
      this.el.contains(this.draggedRange.startContainer)
    ) {
      this.draggedRange.deleteContents();
      this.draggedRange = null;
    }

    if (this.fakeCaret && this.fakeCaret.parentNode) this.fakeCaret.remove();
    this.dragCounter = 0;
    this.lastCaretOffset = null;
    this.isHovering = false;
    this.el.style.background = "white";

    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    range.deleteContents();
    range.insertNode(document.createTextNode(text + "\n"));

    range.collapse(false);
    this.el.focus();

    localStorage.setItem(this.key, this.el.innerText);
  }
}

function setupPanelEvents() {
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
  document.addEventListener("mouseup", () => {
    isDragging = false;
    document.body.style.userSelect = "auto";
  });

  // ✅ 防止拖动出现提示框
  dragbar.addEventListener("dragstart", (e) => e.preventDefault());
  dragbar.setAttribute("draggable", "false");

  // ✅ 禁止选择文本（彻底）
  dragbar.addEventListener("selectstart", (e) => e.preventDefault());
  dragbar.style.userSelect = "none";
  panel.querySelectorAll("#chatgpt-toc-dragbar *").forEach((el) => {
    el.style.userSelect = "none";
    el.setAttribute("draggable", "false");
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

  // 展开/收起
  const toggleBtn = panel.querySelector("#btn-toggle");
  let isMinimized = false;
  toggleBtn.addEventListener("click", () => {
    const ul = panel.querySelector("#toc-list");
    if (isMinimized) {
      ul.style.display = "block";
      panel.style.height = panel.dataset.originalHeight || "100px"; // 可自定义默认高度
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

      const minWidth = 200;
      const minHeight = 150;

      function onMove(e) {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        let newWidth = startWidth;
        let newHeight = startHeight;
        let newTop = startTop;
        let newLeft = startLeft;

        if (dir.includes("right")) {
          newWidth = Math.max(minWidth, startWidth + dx);
          if (newLeft + newWidth > window.innerWidth) {
            newWidth = window.innerWidth - newLeft;
          }
          panel.style.width = `${newWidth}px`;
        }

        if (dir.includes("bottom")) {
          newHeight = Math.max(minHeight, startHeight + dy);
          if (newTop + newHeight > window.innerHeight) {
            newHeight = window.innerHeight - newTop;
          }
          panel.style.height = `${newHeight}px`;
        }

        if (dir.includes("left")) {
          newWidth = Math.max(minWidth, startWidth - dx);
          newLeft = startLeft + (startWidth - newWidth);
          if (newLeft < 0) {
            newLeft = 0;
            newWidth = startLeft + startWidth;
          }
          panel.style.width = `${newWidth}px`;
          panel.style.left = `${newLeft}px`;
        }

        if (dir.includes("top")) {
          newHeight = Math.max(minHeight, startHeight - dy);
          newTop = startTop + (startHeight - newHeight);
          if (newTop < 0) {
            newTop = 0;
            newHeight = startTop + startHeight;
          }
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

  const closeBtn = panel.querySelector("#btn-close");
  closeBtn.addEventListener("click", () => {
    isManuallyClosed = true;
    cleanup();
    panel.style.display = "none"; // ✅ 隐藏而不是移除 DOM
    injectReopenButton(); // ✅ 添加恢复按钮
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
    a.setAttribute("draggable", "false"); // ✅ 禁止链接拖拽
    a.addEventListener("dragstart", (e) => e.preventDefault()); // ✅ 防止拖拽提示框
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

// ✅ 正确设置全局 observer
function setupMutationObserver() {
  observer?.disconnect(); // 防止重复监听
  observer = new MutationObserver(() => {
    const chatItems = document.querySelectorAll(".text-base:not([data-toc])");
    chatItems.forEach((el) => {
      const text = el.innerText.trim();
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

  function startMonitor() {
    intervalId = setInterval(() => {
      if (location.pathname !== lastPath) {
        clearInterval(intervalId); // 先清掉当前这个 interval，避免重复
        lastPath = location.pathname;
        cleanup();
        setTimeout(() => {
          setupMutationObserver();
          startMonitor(); // ✅ 重新启动监听
        }, 300);
      }
    }, 1000);
  }

  startMonitor(); // 初次调用
}

function cleanup() {
  observer?.disconnect();
  observer = null;
  clearInterval(intervalId);
  questions.clear();
  document.querySelectorAll("[data-toc]").forEach((el) => {
    el.removeAttribute("data-toc");
  });
  updateTOC();
}

// ✅ 初始化入口
function init() {
  createTOCPanel();
  setupMutationObserver();
  monitorChatSwitch();
  window.addEventListener("beforeunload", cleanup);
  setInterval(() => {
    if (!document.getElementById("chatgpt-toc-panel")) createTOCPanel();
  }, 1000);

  window.reopenTOCPanel = function () {
    const existing = document.getElementById("chatgpt-toc-panel");
    if (existing) {
      existing.style.display = "block"; // ✅ 恢复显示
      isManuallyClosed = false;
      setupMutationObserver();
      monitorChatSwitch();
      updateTOC();

      // ✅ 恢复时移除按钮
      const reopenBtn = document.getElementById("chatgpt-reopen-btn");
      if (reopenBtn) reopenBtn.remove();
    } else {
      isManuallyClosed = false;
      createTOCPanel();
    }
  };
}

function injectReopenButton() {
  // 如果已存在，不重复创建
  if (document.getElementById("chatgpt-reopen-btn")) return;

  const btn = document.createElement("div");
  btn.id = "chatgpt-reopen-btn";
  btn.innerText = "📌";

  Object.assign(btn.style, {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    width: "36px",
    height: "36px",
    lineHeight: "36px",
    textAlign: "center",
    background: "#28c840",
    color: "#fff",
    fontSize: "20px",
    borderRadius: "50%",
    cursor: "pointer",
    zIndex: "10000",
    boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
    userSelect: "none",
  });

  btn.title = "点击恢复 TOC 面板";
  btn.addEventListener("click", () => {
    if (typeof window.reopenTOCPanel === "function") {
      window.reopenTOCPanel();
    }
  });

  document.body.appendChild(btn);
}

function safeInitByToggle() {
  chrome.storage.sync.get(["pluginEnabled"], (res) => {
    if (res.pluginEnabled) {
      init();
    } else {
      console.log("[ChatGPT TOC] 插件未启用，未执行 init()");
    }
  });
}

// 入口改成带开关判断
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", safeInitByToggle);
  console.log("[TOC] content.js running");
} else {
  safeInitByToggle();
}
