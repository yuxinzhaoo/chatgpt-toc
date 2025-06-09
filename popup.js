document.addEventListener("DOMContentLoaded", () => {
  const cb = document.getElementById("enablePlugin");
  chrome.storage.sync.get(["pluginEnabled"], (res) => {
    cb.checked = !!res.pluginEnabled;
  });

  cb.addEventListener("change", () => {
    chrome.storage.sync.set({ pluginEnabled: cb.checked });
  });
});
