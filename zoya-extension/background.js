chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Background received command:", request);
  handleCommand(request);
  return true;
});

async function handleCommand(command) {
  let url = "";
  
  if (command.platform === "whatsapp") url = "https://web.whatsapp.com/";
  else if (command.platform === "discord") url = "https://discord.com/app";
  else if (command.platform === "youtube") url = "https://www.youtube.com/";
  else if (command.platform === "google_forms") url = "https://forms.google.com/";
  else if (command.platform === "google_sheets") url = "https://docs.google.com/spreadsheets/";

  if (!url) return;

  // Find existing tab or create new one
  let tabs = await chrome.tabs.query({ url: url + "*" });
  let tab;
  
  if (tabs.length > 0) {
    tab = tabs[0];
    await chrome.tabs.update(tab.id, { active: true });
  } else {
    tab = await chrome.tabs.create({ url });
  }

  // Wait for the page to load, then inject the content script and send the command
  setTimeout(async () => {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"]
      });
      chrome.tabs.sendMessage(tab.id, command);
    } catch (e) {
      console.error("Failed to inject content script:", e);
    }
  }, 4000); // Give the page a few seconds to load before injecting
}
