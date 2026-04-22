/**
 * User-configurable settings for Zoya. Stored in localStorage so they survive
 * app restarts, and mirrored to the Android side (wake sensitivity, notifications,
 * user profile) where relevant.
 */

export type Language = "hinglish" | "hindi" | "english";
export type ThemeMode = "dark" | "light";
export type AvatarStyle =
  | "default"
  | "traditional"
  | "modern"
  | "cute"
  | "elegant";

export interface ZoyaSettings {
  geminiApiKey: string;
  zoyaName: string;
  userName: string;
  userNickname: string;
  language: Language;
  wakeWordEnabled: boolean;
  wakeWordSensitivity: number; // 0 - 1
  voicePitch: number;          // 0.5 - 2.0
  voiceSpeed: number;          // 0.5 - 2.0
  autoDetectMood: boolean;
  memoryEnabled: boolean;
  backgroundNotifications: boolean;
  avatar: AvatarStyle;
  theme: ThemeMode;
}

const KEY = "zoya.settings.v1";

export const DEFAULT_SETTINGS: ZoyaSettings = {
  geminiApiKey: "",
  zoyaName: "Zoya",
  userName: "",
  userNickname: "",
  language: "hinglish",
  wakeWordEnabled: true,
  wakeWordSensitivity: 0.6,
  voicePitch: 1.15,
  voiceSpeed: 1.0,
  autoDetectMood: true,
  memoryEnabled: true,
  backgroundNotifications: true,
  avatar: "default",
  theme: "dark",
};

export function loadSettings(): ZoyaSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<ZoyaSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: ZoyaSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
  // Mirror to Android native layer where the setting has a native effect.
  const w = window as any;
  try {
    w?.Android?.setWakeEnabled?.(s.wakeWordEnabled);
    w?.Android?.setWakeSensitivity?.(s.wakeWordSensitivity);
    w?.Android?.setNotificationsEnabled?.(s.backgroundNotifications);
    w?.Android?.setUserProfile?.(s.userName || "", s.userNickname || "");
  } catch {}
}

export function updateSettings(patch: Partial<ZoyaSettings>): ZoyaSettings {
  const next = { ...loadSettings(), ...patch };
  saveSettings(next);
  return next;
}

/** Resolve API key — settings take priority, falls back to build-time env. */
export function resolveGeminiKey(): string {
  const s = loadSettings();
  if (s.geminiApiKey && s.geminiApiKey.trim()) return s.geminiApiKey.trim();
  // Vite env var injected at build time
  const envKey = (typeof process !== "undefined" && (process as any).env?.GEMINI_API_KEY)
    || (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_GEMINI_API_KEY);
  return envKey || "";
}
