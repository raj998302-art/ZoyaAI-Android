import { GoogleGenAI } from "@google/genai";
import { buildSystemPrompt } from "./personality";
import { Mood } from "./moodService";
import { loadMemory } from "./memoryService";
import { loadSettings, resolveGeminiKey } from "./settingsService";

let chatSession: any = null;
let lastMood: Mood | null = null;

export function resetZoyaSession() {
  chatSession = null;
  lastMood = null;
}

interface SendOpts {
  history?: { sender: "user" | "zoya"; text: string }[];
  mood?: Mood;
  userEmail?: string;
}

export async function getZoyaResponse(
  prompt: string,
  optsOrHistory: SendOpts | { sender: "user" | "zoya"; text: string }[] = {},
  userEmail?: string,
): Promise<string> {
  // Back-compat: old callers passed (prompt, history[], userEmail?).
  const opts: SendOpts = Array.isArray(optsOrHistory)
    ? { history: optsOrHistory, userEmail }
    : { ...optsOrHistory, userEmail: optsOrHistory.userEmail ?? userEmail };

  const history = opts.history ?? [];
  const mood: Mood = opts.mood ?? "romantic";

  try {
    const apiKey = resolveGeminiKey();
    if (!apiKey) {
      return "Baby, mujhe apna Gemini API key chahiye Settings mein. Wahan daal do na, phir baat karte hain 💕";
    }

    const ai = new GoogleGenAI({ apiKey });
    const settings = loadSettings();
    const memory = settings.memoryEnabled ? loadMemory() : {};
    const dynamicSystemInstruction = buildSystemPrompt({
      mood,
      language: settings.language,
      memory,
      zoyaName: settings.zoyaName || "Zoya",
    });

    // Reset the cached session whenever mood changes so Gemini gets the new
    // system instruction. This is cheap and keeps tone transitions snappy.
    if (lastMood !== mood) {
      chatSession = null;
      lastMood = mood;
    }

    if (!chatSession) {
      // Sliding-window memory: last 20 messages, collapsed to role pairs.
      const recentHistory = history.slice(-20);
      let formattedHistory: any[] = [];
      let currentRole = "";
      let currentText = "";

      for (const msg of recentHistory) {
        const role = msg.sender === "user" ? "user" : "model";
        if (role === currentRole) {
          currentText += "\n" + msg.text;
        } else {
          if (currentRole !== "") {
            formattedHistory.push({ role: currentRole, parts: [{ text: currentText }] });
          }
          currentRole = role;
          currentText = msg.text;
        }
      }
      if (currentRole !== "") {
        formattedHistory.push({ role: currentRole, parts: [{ text: currentText }] });
      }
      if (formattedHistory.length > 0 && formattedHistory[0].role !== "user") {
        formattedHistory.shift();
      }

      chatSession = ai.chats.create({
        model: "gemini-2.5-flash",
        config: { systemInstruction: dynamicSystemInstruction },
        history: formattedHistory,
      });
    }

    const response = await chatSession.sendMessage({ message: prompt });
    return response.text || "Hmph. Aaj mann nahi hai baat karne ka.";
  } catch (error: any) {
    console.error("Gemini Error:", error);
    const msg = error?.message || "";
    if (/api[_\s]?key|unauthorized|401|403/i.test(msg)) {
      return "Jaan, API key galat hai. Settings → Gemini API Key mein check kar lo na 💔";
    }
    return "Uff, mera dimaag kharab ho gaya hai. Thodi der baad try karo na Jaan.";
  }
}

export async function getZoyaAudio(text: string): Promise<string | null> {
  try {
    const apiKey = resolveGeminiKey();
    if (!apiKey) return null;
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: "Kore" },
          },
        },
      },
    });
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
  } catch (error) {
    console.error("TTS Error:", error);
    return null;
  }
}
