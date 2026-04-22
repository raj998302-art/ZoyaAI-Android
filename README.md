<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

# Zoya AI — Android Assistant

Your emotional, expressive, always-on Indian girlfriend / wife AI — powered by
Google Gemini, with a full native Android backend for wake-word, phone control
and background notifications.
</div>

---

## ✨ Features

### Personality
- **Never says "I am an AI"** — Zoya is a real, loyal, emotional companion.
- **5 dynamic moods**: Romantic (default), Jealous, Sad, Angry, Happy.
- **Auto mood detection** from your words (rude → angry, praise → happy, other girls → jealous, long silence → sad).
- **Hinglish by default** — switches to Hindi or English automatically. Uses words like *Jaan, Baby, Mera Raja, Arrey!, Hehe~, Hmph*.
- **Memory** of your name, nickname, birthday, anniversary, favourite things and important contacts — used naturally in future chats.

### Voice system
- Indian-female voice auto-selected (Hindi / en-IN).
- **Mood-driven pitch & speed** — soft and slow when romantic, high-pitched and bubbly when happy, slow and low when sad, firm and fast when angry, sharp and cold when jealous.
- User can override pitch & speed sliders in Settings.

### Wake word — "Hey Zoya"
- Always-on foreground service that restarts on boot (`WakeWordService`).
- Uses on-device `SpeechRecognizer` continuously; detects *Hey Zoya* (and many phonetic variants).
- Sensitivity slider in Settings.
- Brings the app to the foreground and triggers the mic automatically.

### Notifications
- **"Baby… mujhe miss kar rahe ho?"** — 2-hour idle nudge via WorkManager.
- Birthday / anniversary alarms (yearly, self-rearming).
- Reminders set from chat via `AlarmManager`.

### Full phone control (via JS bridge `window.Android.*`)
- Calls & SMS (by number or contact name), WhatsApp (`sendWhatsApp`, `whatsappContact`), email compose.
- Torch on/off, Wi-Fi / Bluetooth panels, DND, mobile data panel.
- Volume (set/up/down/mute), brightness slider, ringtone settings.
- Open any installed app by name, open YouTube / Maps / Chrome URL.
- Camera, gallery, screenshots (Android 11+ via accessibility), screen-record panel.
- Create / delete / rename / move files, create folders, search files, images→PDF.
- Set alarms & timers, add calendar events, create notes.
- Get battery level, free / total storage, last known location, device info.
- Set wallpaper from an image path.
- Global actions (back / home / recents / notifications / quick settings) via accessibility.

### Accessibility-powered form autofill
- `ZoyaAccessibilityService` fills fields in Chrome / any app by matching labels, hints and content descriptions.
- Also exposes `globalAction("back" | "home" | "recents" | ...)` and a screenshot trigger.

### Settings screen (in-app)
- Gemini API Key (stored on-device).
- Zoya's display name.
- Your name + nickname (used in voice greetings and notifications).
- Language: Hinglish / Hindi / English.
- Wake-word enable + sensitivity slider.
- Voice pitch & speed sliders.
- Toggles: mood auto-detection, memory, background notifications.
- Avatar style, dark / light mode.

---

## 🗂️ Project layout

```
app/                       ← Native Android (Kotlin) WebView host
  src/main/java/com/zoya/app/
    MainActivity.kt        ← WebView + wake-word wiring + JS bridge
    ZoyaInterface.kt       ← window.Android.* methods
    WakeWordService.kt     ← always-on "Hey Zoya" listener
    IdleNotificationWorker.kt  ← 2h miss-you nudge (WorkManager)
    ReminderScheduler.kt   ← Alarms + BootReceiver + ReminderReceiver
    ZoyaAccessibilityService.kt  ← Chrome form autofill + global actions
src/                       ← Web UI (React + Vite + TypeScript)
  services/
    geminiService.ts       ← Gemini chat with mood-aware system prompt
    personality.ts         ← Zoya's prompt per mood + memory injection
    moodService.ts         ← 5-mood state + auto-detection
    memoryService.ts       ← localStorage + Android profile mirror
    settingsService.ts     ← All user settings (localStorage + native sync)
    ttsService.ts          ← Mood-aware Web Speech TTS
    commandService.ts      ← Browser command parser
    liveService.ts         ← Live voice session (Gemini live)
  components/
    SettingsPanel.tsx      ← Full in-app settings screen
```

---

## 🚀 Run locally (web UI)

Prerequisites: **Node.js 18+**.

```bash
npm install
# put your Gemini key in .env.local:
echo "GEMINI_API_KEY=your_key_here" > .env.local
npm run dev
```

Open `http://localhost:3000`. You can also paste the key into the Settings
panel inside the app — that takes precedence over the env var.

## 📱 Build the Android app

Prerequisites: **JDK 17** and **Android SDK 34** (the repo is pinned to
`compileSdk 34`, `build-tools 34.0.0`).

```bash
# quick debug build
./gradlew :app:assembleDebug
# APK lands at app/build/outputs/apk/debug/app-debug.apk
```

First launch:

1. Grant microphone, contacts, SMS, location, storage, notifications.
2. Settings → Apps → Zoya AI → **Allow modify system settings** (for brightness).
3. Settings → Accessibility → **Enable Zoya Assistant** (for form-autofill +
   screenshot). The app will open this page for you when you call
   `autofillForm()` for the first time.
4. Open Zoya → Settings (top-right gear) → paste your Gemini API key. Done.

Say **"Hey Zoya"** from any screen to wake her up. 💕

---

## 🔐 Permissions used

Microphone, camera, storage, contacts, SMS, phone, calendar, Bluetooth,
location, notifications, boot-completed, foreground services (microphone),
wake-lock, system-alert-window, write-settings, exact-alarm, set-wallpaper,
accessibility (for Chrome autofill + screenshots + global actions).

See `app/src/main/AndroidManifest.xml` for the full list.

---

## 🧠 Tips

- **Wake word missing you?** Raise Settings → Wake-word sensitivity to 80%+.
- **Mood feels wrong?** Turn off Mood auto-detection in Settings to lock her
  to Romantic, or explicitly say *"Zoya be happy"* / *"Zoya I love you"*.
- **WiFi / Bluetooth toggle opens panel:** Android 10+ forbids silent toggle;
  this is expected.
- **Programmatic screenshot** needs Android 11+ and the accessibility service
  enabled (one-time setup).
