let panel;
const questions = new Map();

console.log("💡 插件 content.js 注入成功");

function createTOCPanel() {
  if (document.getElementById("chatgpt-toc-panel")) return;

  panel = document.createElement("div");
  panel.id = "chatgpt-toc-panel";
  panel.setAttribute("data-plugin", "chatgpt-toc");
  panel.innerHTML = `<h3 style="margin-top: 0;">问答目录</h3><ul></ul>`;
  panel.style.position = "fixed";
  panel.style.top = "100px";
  panel.style.right = "20px";
  panel.style.width = "280px";
  panel.style.background = "white";
  panel.style.border = "1px solid #ccc";
  panel.style.padding = "12px";
  panel.style.zIndex = "9999";
  panel.style.boxShadow = "0 2px 6px rgba(0,0,0,0.1)";
  panel.style.borderRadius = "8px";
  panel.style.maxHeight = "70vh";
  panel.style.overflowY = "auto";
  panel.style.fontSize = "14px";
  document.body.appendChild(panel);

  console.log("✅ TOC 面板已插入");
  updateTOC(); // 插入时刷新一次内容
}

function updateTOC() {
  if (!panel) return;

  panel.innerHTML = `<h3 style="margin-top: 0;">问答目录</h3><ul style="padding-left: 16px;"></ul>`;
  const ul = panel.querySelector("ul");

  let index = 1;
  questions.forEach((node, text) => {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = "#";
    a.textContent = `${index++}. ${text.slice(0, 50)}`;
    a.style.color = "#1a73e8";
    a.style.textDecoration = "none";
    a.style.display = "block";
    a.style.marginBottom = "6px";
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

// 插件初始化入口
function init() {
  createTOCPanel();
  setupMutationObserver();

  // 防止被页面删除，定时重新插入
  setInterval(() => {
    if (!document.getElementById("chatgpt-toc-panel")) {
      console.log("🛠️ 面板被移除，重新插入...");
      createTOCPanel();
    }
  }, 1000);
}

// 等待页面加载完成后启动插件
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
