import React, { useState } from "react";
import { X, Heart, KeyRound, User, Globe, Mic, SlidersHorizontal, Bell, Brain, Palette, Moon, Sun } from "lucide-react";
import {
  ZoyaSettings,
  AvatarStyle,
  Language,
  ThemeMode,
} from "../services/settingsService";

const AVATARS: { id: AvatarStyle; emoji: string; label: string }[] = [
  { id: "default", emoji: "💖", label: "Default" },
  { id: "traditional", emoji: "🥻", label: "Traditional" },
  { id: "modern", emoji: "👗", label: "Modern" },
  { id: "cute", emoji: "🧸", label: "Cute" },
  { id: "elegant", emoji: "💃", label: "Elegant" },
];

const LANGUAGES: { id: Language; label: string }[] = [
  { id: "hinglish", label: "Hinglish" },
  { id: "hindi", label: "Hindi" },
  { id: "english", label: "English" },
];

interface Props {
  settings: ZoyaSettings;
  onChange: (patch: Partial<ZoyaSettings>) => void;
  onClose: () => void;
  onResetMemory: () => void;
}

/**
 * Full Zoya settings panel. Covers every option in the spec:
 * Gemini API key, names, language, wake-word sensitivity, voice
 * pitch/speed, mood auto-detection toggle, memory toggle,
 * background notifications, avatar and theme.
 */
export default function SettingsPanel({ settings, onChange, onClose, onResetMemory }: Props) {
  const [showKey, setShowKey] = useState(false);

  const Row: React.FC<{ label: string; icon?: React.ReactNode; children: React.ReactNode }> = ({
    label, icon, children,
  }) => (
    <div className="mb-5">
      <label className="flex items-center gap-2 text-sm font-medium mb-2 opacity-80">
        {icon} {label}
      </label>
      {children}
    </div>
  );

  const Toggle: React.FC<{ value: boolean; onChange: (v: boolean) => void }> = ({ value, onChange }) => (
    <button
      type="button"
      aria-pressed={value}
      onClick={() => onChange(!value)}
      className={`w-12 h-7 rounded-full p-1 transition-colors ${value ? "bg-pink-500" : "bg-neutral-600"}`}
    >
      <span className={`block w-5 h-5 bg-white rounded-full transform transition-transform ${value ? "translate-x-5" : ""}`} />
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-neutral-900 text-white rounded-2xl shadow-2xl border border-pink-500/30">
        <div className="sticky top-0 bg-neutral-900 z-10 flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Heart className="w-5 h-5 text-pink-400" />
            Zoya Settings
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5">
          {/* Gemini API Key */}
          <Row label="Gemini API Key" icon={<KeyRound className="w-4 h-4" />}>
            <div className="flex gap-2">
              <input
                type={showKey ? "text" : "password"}
                value={settings.geminiApiKey}
                onChange={(e) => onChange({ geminiApiKey: e.target.value })}
                placeholder="Paste your Gemini API key"
                className="flex-1 bg-neutral-800 px-3 py-2 rounded-lg text-sm outline-none border border-white/10 focus:border-pink-400"
              />
              <button
                className="px-3 py-2 bg-neutral-800 rounded-lg text-xs border border-white/10 hover:border-pink-400"
                onClick={() => setShowKey((v) => !v)}
              >
                {showKey ? "Hide" : "Show"}
              </button>
            </div>
            <p className="text-xs opacity-50 mt-1">
              Get one at aistudio.google.com/app/apikey
            </p>
          </Row>

          {/* Zoya name */}
          <Row label="Zoya's name" icon={<Heart className="w-4 h-4" />}>
            <input
              value={settings.zoyaName}
              onChange={(e) => onChange({ zoyaName: e.target.value })}
              className="w-full bg-neutral-800 px-3 py-2 rounded-lg text-sm outline-none border border-white/10 focus:border-pink-400"
            />
          </Row>

          {/* User name + nickname */}
          <Row label="Your name" icon={<User className="w-4 h-4" />}>
            <input
              value={settings.userName}
              onChange={(e) => onChange({ userName: e.target.value })}
              placeholder="e.g. Raj"
              className="w-full bg-neutral-800 px-3 py-2 rounded-lg text-sm outline-none border border-white/10 focus:border-pink-400"
            />
          </Row>
          <Row label="Your nickname (what Zoya calls you)" icon={<Heart className="w-4 h-4" />}>
            <input
              value={settings.userNickname}
              onChange={(e) => onChange({ userNickname: e.target.value })}
              placeholder="e.g. Jaan"
              className="w-full bg-neutral-800 px-3 py-2 rounded-lg text-sm outline-none border border-white/10 focus:border-pink-400"
            />
          </Row>

          {/* Language */}
          <Row label="Language" icon={<Globe className="w-4 h-4" />}>
            <div className="grid grid-cols-3 gap-2">
              {LANGUAGES.map((l) => (
                <button
                  key={l.id}
                  onClick={() => onChange({ language: l.id })}
                  className={`px-3 py-2 rounded-lg text-sm border ${
                    settings.language === l.id
                      ? "bg-pink-500 border-pink-500"
                      : "bg-neutral-800 border-white/10 hover:border-pink-400"
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </Row>

          {/* Wake word */}
          <Row label="Wake word (‘Hey Zoya’)" icon={<Mic className="w-4 h-4" />}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm">Always-on listening</span>
              <Toggle
                value={settings.wakeWordEnabled}
                onChange={(v) => onChange({ wakeWordEnabled: v })}
              />
            </div>
            <label className="text-xs opacity-60">
              Sensitivity: {Math.round(settings.wakeWordSensitivity * 100)}%
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.wakeWordSensitivity}
              onChange={(e) => onChange({ wakeWordSensitivity: parseFloat(e.target.value) })}
              className="w-full accent-pink-400"
            />
          </Row>

          {/* Voice pitch / speed */}
          <Row label="Voice" icon={<SlidersHorizontal className="w-4 h-4" />}>
            <label className="text-xs opacity-60">Pitch: {settings.voicePitch.toFixed(2)}</label>
            <input type="range" min={0.5} max={2} step={0.05}
              value={settings.voicePitch}
              onChange={(e) => onChange({ voicePitch: parseFloat(e.target.value) })}
              className="w-full accent-pink-400 mb-2" />
            <label className="text-xs opacity-60">Speed: {settings.voiceSpeed.toFixed(2)}</label>
            <input type="range" min={0.5} max={2} step={0.05}
              value={settings.voiceSpeed}
              onChange={(e) => onChange({ voiceSpeed: parseFloat(e.target.value) })}
              className="w-full accent-pink-400" />
          </Row>

          {/* Mood auto-detect */}
          <Row label="Mood auto-detect" icon={<Heart className="w-4 h-4" />}>
            <div className="flex items-center justify-between">
              <span className="text-sm">Zoya changes mood based on your words</span>
              <Toggle
                value={settings.autoDetectMood}
                onChange={(v) => onChange({ autoDetectMood: v })}
              />
            </div>
          </Row>

          {/* Memory */}
          <Row label="Memory" icon={<Brain className="w-4 h-4" />}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm">Remember my details</span>
              <Toggle
                value={settings.memoryEnabled}
                onChange={(v) => onChange({ memoryEnabled: v })}
              />
            </div>
            <button
              onClick={onResetMemory}
              className="text-xs text-pink-400 underline"
            >
              Reset Zoya's memory
            </button>
          </Row>

          {/* Notifications */}
          <Row label="Background notifications" icon={<Bell className="w-4 h-4" />}>
            <div className="flex items-center justify-between">
              <span className="text-sm">‘Miss you’ nudges after 2h</span>
              <Toggle
                value={settings.backgroundNotifications}
                onChange={(v) => onChange({ backgroundNotifications: v })}
              />
            </div>
          </Row>

          {/* Avatar */}
          <Row label="Avatar / photo" icon={<Palette className="w-4 h-4" />}>
            <div className="grid grid-cols-5 gap-2">
              {AVATARS.map((a) => (
                <button
                  key={a.id}
                  onClick={() => onChange({ avatar: a.id })}
                  className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-xs ${
                    settings.avatar === a.id
                      ? "bg-pink-500/30 border-pink-400"
                      : "bg-neutral-800 border-white/10 hover:border-pink-400"
                  }`}
                >
                  <span className="text-2xl">{a.emoji}</span>
                  <span>{a.label}</span>
                </button>
              ))}
            </div>
          </Row>

          {/* Theme */}
          <Row label="Theme" icon={settings.theme === "dark" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}>
            <div className="flex gap-2">
              {(["dark", "light"] as ThemeMode[]).map((t) => (
                <button
                  key={t}
                  onClick={() => onChange({ theme: t })}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm capitalize border ${
                    settings.theme === t
                      ? "bg-pink-500 border-pink-500"
                      : "bg-neutral-800 border-white/10 hover:border-pink-400"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </Row>
        </div>
      </div>
    </div>
  );
}
