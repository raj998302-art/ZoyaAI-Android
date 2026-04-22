// This script runs on all pages to listen for commands from the Zoya Web App
window.addEventListener("message", (event) => {
  // We only accept messages from ourselves
  if (event.source !== window) return;

  if (event.data && event.data.type === "ZOYA_EXTENSION_COMMAND") {
    console.log("Bridge received command from Zoya Web App:", event.data.payload);
    // Forward the command to the extension background script
    chrome.runtime.sendMessage(event.data.payload);
  }
});

// Let the web app know the extension is installed and ready
window.postMessage({ type: "ZOYA_EXTENSION_READY" }, "*");
