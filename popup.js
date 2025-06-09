document.addEventListener("DOMContentLoaded", () => {
  const cb = document.getElementById("enablePlugin");

  // 初始化状态（从存储中读取）
  chrome.storage.sync.get(["pluginEnabled"], (res) => {
    cb.checked = !!res.pluginEnabled;
  });

  // 监听勾选变化
  cb.addEventListener("change", () => {
    const enabled = cb.checked;
    chrome.storage.sync.set({ pluginEnabled: enabled });

    // ✅ 通知当前页面的 content.js 来执行插件开关逻辑
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: "togglePlugin",
        value: enabled,
      });
    });
  });
});
