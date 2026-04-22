// Prevent multiple injections
if (!window.zoyaContentInjected) {
  window.zoyaContentInjected = true;

  // --- REUSABLE FUNCTIONS ---

  async function waitForElement(selector, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);

      const interval = setInterval(() => {
        const el = document.querySelector(selector);
        if (el) {
          clearInterval(interval);
          resolve(el);
        }
      }, 400);

      setTimeout(() => {
        clearInterval(interval);
        reject("Element not found: " + selector);
      }, timeout);
    });
  }

  async function typeText(selector, text) {
    const el = await waitForElement(selector);
    el.focus();

    el.innerText = text;
    el.value = text;

    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function clickElement(selector) {
    const el = await waitForElement(selector);
    el.click();
  }

  const delay = (ms) => new Promise(res => setTimeout(res, ms));

  // --- COMMAND LISTENER ---

  chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    console.log("Zoya Content Script received command:", request);
    
    try {
      // 1. DISCORD WEB
      if (request.action === "send_message" && request.platform === "discord") {
        const box = await waitForElement("[contenteditable='true']");
        box.focus();
        document.execCommand("insertText", false, request.message);
        await delay(500);
        box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, keyCode: 13 }));
      }
      
      // 2. WHATSAPP WEB
      else if (request.action === "send_message" && request.platform === "whatsapp") {
        // Find the chat input box (usually has title="Type a message" or contenteditable)
        const box = await waitForElement("div[contenteditable='true'][data-tab='10'], div[title='Type a message']");
        box.focus();
        document.execCommand("insertText", false, request.message);
        await delay(500);
        box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, keyCode: 13 }));
      }
      
      // 3. YOUTUBE
      else if (request.action === "play_song" && request.platform === "youtube") {
        const searchBox = await waitForElement("input#search");
        searchBox.focus();
        searchBox.value = request.query;
        searchBox.dispatchEvent(new Event('input', { bubbles: true }));
        
        await delay(500);
        const searchBtn = await waitForElement("button#search-icon-legacy");
        searchBtn.click();
        
        await delay(3000); // Wait for search results
        const firstVideo = await waitForElement("ytd-video-renderer a#video-title");
        firstVideo.click();
      }
      
      // 4. GOOGLE FORMS
      else if (request.action === "create_google_form") {
        // Click Blank Form
        const blankBtn = await waitForElement(".docs-homescreen-templates-templateview-preview");
        blankBtn.click();
        
        await delay(3000); // Wait for editor to load
        // Try to find the title input (aria-label="Form title" or similar)
        const titleInput = await waitForElement("input[aria-label='Form title'], .freebirdFormeditorViewHeaderTitleInput");
        titleInput.focus();
        document.execCommand("insertText", false, request.title);
      }
      
      // 5. GOOGLE SHEETS
      else if (request.action === "create_google_sheet") {
        // Click Blank Sheet
        const blankBtn = await waitForElement(".docs-homescreen-templates-templateview-preview");
        blankBtn.click();
        
        await delay(4000); // Wait for grid to load
        // Type into first cell (usually requires clicking the canvas or cell first)
        const cellInput = await waitForElement(".cell-input, #t-name-box");
        cellInput.focus();
        document.execCommand("insertText", false, request.title);
        cellInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, keyCode: 13 }));
      }

    } catch (e) {
      console.error("Zoya Extension Error:", e);
    }
  });
}
