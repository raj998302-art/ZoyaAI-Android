# Zoya AI - Android App

A full-featured WebView Android wrapper for the Zoya AI assistant with 25+ native device controls.

---

## Build Instructions

### Option A: Termux (on your Android phone)

```bash
# 1. Install required packages
pkg update && pkg upgrade -y
pkg install openjdk-17 wget unzip -y

# 2. Set JAVA_HOME
export JAVA_HOME=$PREFIX/opt/openjdk-17
export PATH=$JAVA_HOME/bin:$PATH

# 3. Set your SDK path in local.properties
#    Download Android SDK cmdline-tools from:
#    https://developer.android.com/studio#command-line-tools-only
#    Then edit local.properties:
echo "sdk.dir=$HOME/Android/Sdk" > local.properties

# 4. Make gradlew executable
chmod +x gradlew

# 5. Build debug APK
./gradlew assembleDebug

# 6. Your APK will be at:
# app/build/outputs/apk/debug/app-debug.apk
```

### Option B: Android Studio (PC)

1. Open Android Studio → File → Open → select this folder
2. Wait for Gradle sync to complete
3. Build → Build Bundle(s)/APK(s) → Build APK(s)
4. APK will be in `app/build/outputs/apk/debug/`

---

## JavaScript API (use in your WebView app)

```javascript
// Torch
Android.torchOn();
Android.torchOff();

// Wi-Fi
Android.wifiOn();
Android.wifiOff();
Android.isWifiEnabled(); // returns boolean

// Bluetooth
Android.bluetoothOn();
Android.bluetoothOff();

// Apps
Android.openApp("youtube");
Android.openUrl("https://google.com");
Android.playYoutube("lofi music");
Android.openMaps("Karachi");

// Phone
Android.makeCall("03001234567");
Android.sendSms("03001234567", "Hello!");

// Files
Android.createFile("note.txt", "Hello World");

// Device
Android.vibrate();
Android.setBrightness(200);   // 0-255
Android.openCamera();
Android.openGallery();
Android.openSettings();
Android.shareText("Share this text");
Android.getDeviceInfo();       // returns JSON string
Android.getInstalledApps();    // returns JSON array
Android.toast("Hello!");
```

---

## Package Info

- Package: `com.zoya.app`
- Min SDK: 24 (Android 7.0)
- Target SDK: 34 (Android 14)
- Kotlin: 1.9.0
- AGP: 8.1.1
- Gradle: 8.1.1
