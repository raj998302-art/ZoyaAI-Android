export async function processCommand(command: string): Promise<{
  action: string;
  url?: string;
  isBrowserAction: boolean;
  jsAction?: () => Promise<void> | void;
}> {
  const lowerCmd = command.toLowerCase().trim();

  // Battery Level
  if (lowerCmd.includes("battery")) {
    if ('getBattery' in navigator) {
      try {
        const battery: any = await (navigator as any).getBattery();
        const level = Math.round(battery.level * 100);
        return {
          action: `Battery ${level} percent hai.`,
          isBrowserAction: false
        };
      } catch (e) {
        console.error(e);
      }
    }
  }

  // Network Status
  if (lowerCmd.includes("internet") || lowerCmd.includes("network") || lowerCmd.includes("online")) {
    const isOnline = navigator.onLine;
    const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    let type = conn ? conn.effectiveType : 'unknown';
    return {
      action: isOnline ? `Haan, internet chal raha hai. Connection type ${type} hai.` : `Nahi, internet band hai. Pehle net on karo!`,
      isBrowserAction: false
    };
  }

  // Share
  if (lowerCmd.includes("share this") || lowerCmd.includes("share app")) {
    return {
      action: `Share kar rahi hoon.`,
      isBrowserAction: true,
      jsAction: async () => {
        if (navigator.share) {
          try {
            await navigator.share({
              title: 'Zoya AI Desktop',
              text: 'Check out Zoya, my sassy PC AI assistant!',
              url: window.location.href,
            });
          } catch (e) { console.error(e); }
        } else {
          alert("Sharing is not supported on this browser.");
        }
      }
    };
  }

  // Copy to Clipboard
  const copyMatch = lowerCmd.match(/^copy\s+(.+)$/);
  if (copyMatch) {
    const textToCopy = copyMatch[1];
    return {
      action: `Copy kar liya hai: "${textToCopy}"`,
      isBrowserAction: true,
      jsAction: async () => {
        try {
          await navigator.clipboard.writeText(textToCopy);
        } catch (e) { console.error(e); }
      }
    };
  }

  // Keep Screen On (Wake Lock)
  if (lowerCmd.includes("keep screen on") || lowerCmd.includes("wake lock")) {
    return {
      action: `Screen on rakhti hoon. Battery drain hogi toh mujhe mat bolna.`,
      isBrowserAction: true,
      jsAction: async () => {
        if ('wakeLock' in navigator) {
          try {
            await (navigator as any).wakeLock.request('screen');
          } catch (e) { console.error(e); }
        } else {
          alert("Wake Lock not supported.");
        }
      }
    };
  }

  // Calendar Event: "Add event to calendar"
  if (lowerCmd.includes("add event") || lowerCmd.includes("calendar")) {
    return {
      action: `Calendar khol rahi hoon. Event add kar lo.`,
      url: `https://calendar.google.com/calendar/render?action=TEMPLATE`,
      isBrowserAction: true
    };
  }

  // Email: "Email raj@gmail.com"
  const emailMatch = lowerCmd.match(/^email\s+([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (emailMatch) {
    const email = emailMatch[1];
    return {
      action: `Opening email client for ${email}.`,
      url: `mailto:${email}`,
      isBrowserAction: true
    };
  }

  // Location/Map: "Where is Mumbai" or "Show me Delhi on map"
  const mapMatch = lowerCmd.match(/(?:where is|show me)\s+(.+?)(?:\s+on map)?$/);
  if (mapMatch && !lowerCmd.includes("time") && !lowerCmd.includes("weather")) {
    const location = encodeURIComponent(mapMatch[1].trim());
    return {
      action: `Finding ${mapMatch[1]} on Google Maps.`,
      url: `https://www.google.com/maps/search/?api=1&query=${location}`,
      isBrowserAction: true
    };
  }

  // Discord Message (Using Extension)
  const discordMatch = lowerCmd.match(/^send\s+(?:a\s+)?message\s+on\s+discord\s+saying\s+(.+)$/);
  if (discordMatch) {
    const msg = discordMatch[1].trim();
    return {
      action: `Sending message on Discord: "${msg}"`,
      isBrowserAction: true,
      jsAction: () => {
        window.postMessage({
          type: "ZOYA_EXTENSION_COMMAND",
          payload: { action: "send_message", platform: "discord", message: msg }
        }, "*");
      }
    };
  }

  // WhatsApp Web Extension Message
  const whatsappExtMatch = lowerCmd.match(/^send\s+(?:a\s+)?message\s+on\s+whatsapp\s+saying\s+(.+)$/);
  if (whatsappExtMatch) {
    const msg = whatsappExtMatch[1].trim();
    return {
      action: `Sending PC message on WhatsApp: "${msg}"`,
      isBrowserAction: true,
      jsAction: () => {
        window.postMessage({
          type: "ZOYA_EXTENSION_COMMAND",
          payload: { action: "send_message", platform: "whatsapp", message: msg }
        }, "*");
      }
    };
  }

  // WhatsApp native URL redirect
  const waMatch = lowerCmd.match(
    /^send\s+a\s+whatsapp\s+message\s+to\s+([\d\+\s]+)\s+saying\s+(.+)$/,
  );
  if (waMatch) {
    const number = waMatch[1].replace(/\s+/g, "");
    const message = encodeURIComponent(waMatch[2].trim());
    return {
      action: `Sending your message. Let's hope they reply, Raj.`,
      url: `https://web.whatsapp.com/send?phone=${number}&text=${message}`, // Changed for PC web whatsapp
      isBrowserAction: true,
    };
  }

  // Google Forms Create
  const formMatch = lowerCmd.match(/^create\s+(?:a\s+)?google\s+form\s+(?:named|called|titled)?\s*(.+)$/);
  if (formMatch) {
    const title = formMatch[1].trim();
    return {
      action: `Shorcut se Form bana rahi hoon: "${title}"`,
      isBrowserAction: true,
      jsAction: () => {
        window.postMessage({
          type: "ZOYA_EXTENSION_COMMAND",
          payload: { action: "create_google_form", platform: "google_forms", title: title }
        }, "*");
        setTimeout(() => { window.open("https://forms.new", "_blank"); }, 500);
      }
    };
  }

  // Google Sheets Create
  const sheetMatch = lowerCmd.match(/^create\s+(?:a\s+)?google\s+sheet\s+(?:named|called|titled)?\s*(.+)$/);
  if (sheetMatch) {
    const title = sheetMatch[1].trim();
    return {
      action: `Excel type Google Sheet bana rahi hoon: "${title}"`,
      isBrowserAction: true,
      jsAction: () => {
        window.postMessage({
          type: "ZOYA_EXTENSION_COMMAND",
          payload: { action: "create_google_sheet", platform: "google_sheets", title: title }
        }, "*");
        setTimeout(() => { window.open("https://sheets.new", "_blank"); }, 500);
      }
    };
  }

  // YouTube search/play
  const ytMatch = lowerCmd.match(/^(?:play|search)\s+(.+?)\s+on\s+youtube$/);
  if (ytMatch) {
    const query = ytMatch[1].trim();
    return {
      action: `Wait, YouTube pe "${query}" chala rahi hoon.`,
      isBrowserAction: true,
      jsAction: () => {
        window.postMessage({
          type: "ZOYA_EXTENSION_COMMAND",
          payload: { action: "play_song", platform: "youtube", query: query }
        }, "*");
        setTimeout(() => { window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, "_blank"); }, 500);
      }
    };
  }

  // Media Search: "Play [query] on Spotify"
  const spotifyMatch = lowerCmd.match(/^(?:play|search)\s+(.+?)\s+on\s+spotify$/);
  if (spotifyMatch) {
    const query = spotifyMatch[1].trim();
    return {
      action: `Playing ${query} on Spotify. Hope it's a banger.`,
      isBrowserAction: true,
      jsAction: () => {
        window.postMessage({
          type: "ZOYA_EXTENSION_COMMAND",
          payload: { action: "play_song", platform: "spotify", query: query }
        }, "*");
      }
    };
  }

  // Fallbacks: explicit links
  const openMatch = lowerCmd.match(/^open\s+(.+)$/);
  if (openMatch) {
    const appName = openMatch[1].toLowerCase().trim();
    
    // Explicit web fallbacks
    if (appName.includes("youtube")) return { action: "YouTube khol diya.", url: "https://www.youtube.com", isBrowserAction: true };
    if (appName.includes("google")) return { action: "Google hazir hai.", url: "https://www.google.com", isBrowserAction: true };
    if (appName.includes("spotify")) return { action: "Spotify chalu kar rahi hoon.", url: "https://open.spotify.com", isBrowserAction: true };
    if (appName.includes("whatsapp")) return { action: "WhatsApp Web khol diya.", url: "https://web.whatsapp.com", isBrowserAction: true };
    if (appName.includes("instagram")) return { action: "Insta pe time waste shuru.", url: "https://www.instagram.com", isBrowserAction: true };
    if (appName.includes("twitter") || appName.includes("x")) return { action: "Twitter khol diya.", url: "https://twitter.com", isBrowserAction: true };
    if (appName.includes("linkedin")) return { action: "LinkedIn for professionals.", url: "https://www.linkedin.com", isBrowserAction: true };
    if (appName.includes("netflix")) return { action: "Netflix time!", url: "https://www.netflix.com", isBrowserAction: true };
    if (appName.includes("prime")) return { action: "Prime Video.", url: "https://www.primevideo.com", isBrowserAction: true };
    if (appName.includes("facebook")) return { action: "Facebook opened.", url: "https://www.facebook.com", isBrowserAction: true };
    if (appName.includes("github")) return { action: "GitHub for code.", url: "https://github.com", isBrowserAction: true };
    if (appName.includes("chatgpt")) return { action: "ChatGPT? Mujhse baat kar lo yaaar. Khol diya waise.", url: "https://chatgpt.com", isBrowserAction: true };
    if (appName.includes("gemini")) return { action: "Gemini is my sibling.", url: "https://gemini.google.com", isBrowserAction: true };

    // General web open
    let website = appName.replace(/\s+/g, "");
    if (!website.includes(".")) website += ".com";
    if (!website.startsWith("http")) website = "https://" + website;
    
    return {
      action: `Opening ${appName} for you.`,
      url: website,
      isBrowserAction: true,
    };
  }

  // Time: "What time is it?"
  if (lowerCmd.includes("time") && (lowerCmd.includes("what") || lowerCmd.includes("tell"))) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    return {
      action: `Abhi ${timeStr} ho rahe hain. PC ke kone mein bhi dikhta hai waise.`,
      isBrowserAction: false
    };
  }

  // Date: "What is the date today?"
  if (lowerCmd.includes("date") || lowerCmd.includes("today")) {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    return {
      action: `Aaj ${dateStr} hai.`,
      isBrowserAction: false
    };
  }

  // Weather: "What's the weather?"
  if (lowerCmd.includes("weather") || lowerCmd.includes("mausam")) {
    return {
      action: `Mausam toh hamesha ki tarah rangeen hai, par details ke liye Google kar lo.`,
      url: `https://www.google.com/search?q=weather+today`,
      isBrowserAction: true
    };
  }

  // Specific query
  const searchMatch = lowerCmd.match(/^search\s+(.+)$/);
  if (searchMatch) {
    const q = encodeURIComponent(searchMatch[1]);
    return {
      action: `Lo, search kar diya: ${searchMatch[1]}`,
      url: `https://www.google.com/search?q=${q}`,
      isBrowserAction: true
    };
  }

  return { action: "", isBrowserAction: false };
}
