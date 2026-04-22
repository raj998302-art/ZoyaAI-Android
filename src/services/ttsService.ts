import { Mood } from "./moodService";
import { loadSettings } from "./settingsService";

/**
 * Mood-aware TTS. Uses the browser's Web Speech API (SpeechSynthesis), picking
 * the best available Indian female voice and modulating pitch/rate based on
 * Zoya's current mood.
 *
 * Mood → voice profile:
 *   romantic → soft, slow, slightly high pitch
 *   jealous  → sharp, slightly fast, cold pitch
 *   sad      → slow, low pitch, emotional
 *   angry    → fast, firm, mid pitch
 *   happy    → high pitch, fast, bubbly
 */

const PREFERRED_NAMES = [
  "google hindi",
  "google hindi (india)",
  "en-in-female",
  "hi-in-female",
  "microsoft swara",
  "microsoft kalpana",
  "priya", "swara", "kavya", "kiara",
];

const PREFERRED_LANGS = ["hi-IN", "en-IN"];

function pickVoice(langPref: string): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  // 1. Direct name match
  const byName = voices.find((v) =>
    PREFERRED_NAMES.some((n) => v.name.toLowerCase().includes(n)));
  if (byName) return byName;

  // 2. Language preference that matches requested language
  const wantHindi = langPref === "hindi" || langPref === "hinglish";
  const byLang = voices.find((v) =>
    (wantHindi ? v.lang.startsWith("hi") : v.lang.startsWith("en-IN")));
  if (byLang) return byLang;

  // 3. First Indian voice we can find
  const anyIndian = voices.find((v) => PREFERRED_LANGS.includes(v.lang));
  if (anyIndian) return anyIndian;

  // 4. Fallback to any female-ish voice
  const female = voices.find((v) => /female|woman|girl/i.test(v.name));
  return female || voices[0];
}

export interface MoodVoiceProfile {
  pitch: number;
  rate: number;
  volume: number;
}

export function profileForMood(mood: Mood): MoodVoiceProfile {
  switch (mood) {
    case "romantic": return { pitch: 1.2, rate: 0.9, volume: 1.0 };
    case "jealous": return { pitch: 0.95, rate: 1.15, volume: 1.0 };
    case "sad":     return { pitch: 0.85, rate: 0.8, volume: 0.9 };
    case "angry":   return { pitch: 1.0, rate: 1.25, volume: 1.0 };
    case "happy":   return { pitch: 1.35, rate: 1.2, volume: 1.0 };
    default:        return { pitch: 1.1, rate: 1.0, volume: 1.0 };
  }
}

let voicesLoaded = false;
function ensureVoicesLoaded(cb: () => void) {
  if (typeof window === "undefined" || !window.speechSynthesis) { cb(); return; }
  const s = window.speechSynthesis;
  if (s.getVoices().length > 0) { voicesLoaded = true; cb(); return; }
  s.addEventListener("voiceschanged", function handler() {
    voicesLoaded = true;
    s.removeEventListener("voiceschanged", handler);
    cb();
  });
  // Nudge the engine; some browsers require a speak call to populate.
  setTimeout(() => cb(), 1000);
}

export function speak(text: string, mood: Mood, onDone?: () => void): void {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    onDone?.();
    return;
  }
  const settings = loadSettings();
  const profile = profileForMood(mood);

  // Apply user's custom pitch/speed modifiers on top of the mood profile.
  const finalPitch = Math.max(0.5, Math.min(2, profile.pitch * settings.voicePitch));
  const finalRate  = Math.max(0.5, Math.min(2, profile.rate * settings.voiceSpeed));

  const speakNow = () => {
    const u = new SpeechSynthesisUtterance(text);
    const voice = pickVoice(settings.language);
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    } else {
      u.lang = settings.language === "hindi" ? "hi-IN" : "en-IN";
    }
    u.pitch = finalPitch;
    u.rate = finalRate;
    u.volume = profile.volume;
    u.onend = () => onDone?.();
    u.onerror = () => onDone?.();
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  };

  if (voicesLoaded) speakNow(); else ensureVoicesLoaded(speakNow);
}

export function stopSpeaking(): void {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}
