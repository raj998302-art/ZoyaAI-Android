package com.zoya.app

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.camera2.CameraAccessException
import android.hardware.camera2.CameraManager
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.Settings
import android.webkit.*
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import java.io.File
import java.io.FileOutputStream

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    private val RUNTIME_PERMISSIONS = buildList {
        add(Manifest.permission.RECORD_AUDIO)
        add(Manifest.permission.CAMERA)
        add(Manifest.permission.ACCESS_FINE_LOCATION)
        add(Manifest.permission.ACCESS_COARSE_LOCATION)
        add(Manifest.permission.READ_CONTACTS)
        add(Manifest.permission.WRITE_CONTACTS)
        add(Manifest.permission.CALL_PHONE)
        add(Manifest.permission.READ_PHONE_STATE)
        add(Manifest.permission.SEND_SMS)
        add(Manifest.permission.RECEIVE_SMS)
        add(Manifest.permission.READ_SMS)
        add(Manifest.permission.READ_CALENDAR)
        add(Manifest.permission.WRITE_CALENDAR)
        add(Manifest.permission.VIBRATE)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            add(Manifest.permission.POST_NOTIFICATIONS)
            add(Manifest.permission.READ_MEDIA_IMAGES)
            add(Manifest.permission.READ_MEDIA_VIDEO)
            add(Manifest.permission.READ_MEDIA_AUDIO)
        } else {
            add(Manifest.permission.READ_EXTERNAL_STORAGE)
            @Suppress("DEPRECATION")
            add(Manifest.permission.WRITE_EXTERNAL_STORAGE)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            add(Manifest.permission.BLUETOOTH_CONNECT)
            add(Manifest.permission.BLUETOOTH_SCAN)
        }
    }.toTypedArray()

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this)
        setContentView(webView)

        // Request all runtime permissions
        val notGranted = RUNTIME_PERMISSIONS.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }.toTypedArray()
        if (notGranted.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, notGranted, 100)
        }

        // Request MANAGE_EXTERNAL_STORAGE for Android 11+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R &&
            !Environment.isExternalStorageManager()) {
            try {
                startActivity(Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION))
            } catch (e: Exception) { /* ignore */ }
        }

        // Request WRITE_SETTINGS
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
            !Settings.System.canWrite(this)) {
            try {
                startActivity(
                    Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS,
                        Uri.parse("package:$packageName"))
                )
            } catch (e: Exception) { /* ignore */ }
        }

        // Configure WebView
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = true
            allowContentAccess = true
            loadWithOverviewMode = true
            useWideViewPort = true
            setSupportZoom(false)
            builtInZoomControls = false
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            cacheMode = WebSettings.LOAD_DEFAULT
            userAgentString = "ZoyaAI-Android/1.0 " + userAgentString
        }

        // Auto-grant WebView permissions (mic, camera, etc.)
        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                request.grant(request.resources)
            }
        }

        // Handle page errors — fall back to local assets
        webView.webViewClient = object : WebViewClient() {
            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                if (request?.isForMainFrame == true) {
                    webView.loadUrl("file:///android_asset/index.html")
                }
            }
        }

        // Register all JS bridge interfaces
        webView.addJavascriptInterface(ZoyaInterface(this), "Android")

        // Load the app
        webView.loadUrl("https://ais-dev-kj5b6yrv73utzbjhek6rqd-75073874065.asia-east1.run.app")
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack()
        else super.onBackPressed()
    }
}

// ══════════════════════════════════════════════════════════════════
//   ZoyaInterface — All JavaScript Bridges (call via window.Android)
// ══════════════════════════════════════════════════════════════════
class ZoyaInterface(private val ctx: AppCompatActivity) {

    // ── Open any installed app by name ─────────────────────────
    @JavascriptInterface
    fun openApp(appName: String) {
        val pm = ctx.packageManager
        val apps = pm.getInstalledApplications(PackageManager.GET_META_DATA)
        for (app in apps) {
            if (pm.getApplicationLabel(app).toString().lowercase().contains(appName.lowercase())) {
                val intent = pm.getLaunchIntentForPackage(app.packageName)
                if (intent != null) {
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    ctx.startActivity(intent)
                    return
                }
            }
        }
        toast("App not found: $appName")
    }

    // ── Open URL in browser ─────────────────────────────────────
    @JavascriptInterface
    fun openUrl(url: String) {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        ctx.startActivity(intent)
    }

    // ── Google Search ───────────────────────────────────────────
    @JavascriptInterface
    fun searchGoogle(query: String) {
        openUrl("https://www.google.com/search?q=${Uri.encode(query)}")
    }

    // ── YouTube ─────────────────────────────────────────────────
    @JavascriptInterface
    fun playYoutube(query: String) {
        val appIntent = Intent(Intent.ACTION_SEARCH).apply {
            setPackage("com.google.android.youtube")
            putExtra("query", query)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        try {
            ctx.startActivity(appIntent)
        } catch (e: Exception) {
            openUrl("https://www.youtube.com/results?search_query=${Uri.encode(query)}")
        }
    }

    // ── Torch ON ────────────────────────────────────────────────
    @JavascriptInterface
    fun torchOn() {
        try {
            val cm = ctx.getSystemService(Context.CAMERA_SERVICE) as CameraManager
            cm.setTorchMode(cm.cameraIdList[0], true)
            toast("🔦 Torch ON")
        } catch (e: CameraAccessException) { toast("Torch error") }
    }

    // ── Torch OFF ───────────────────────────────────────────────
    @JavascriptInterface
    fun torchOff() {
        try {
            val cm = ctx.getSystemService(Context.CAMERA_SERVICE) as CameraManager
            cm.setTorchMode(cm.cameraIdList[0], false)
            toast("Torch OFF")
        } catch (e: CameraAccessException) { toast("Torch error") }
    }

    // ── Wi-Fi ON ────────────────────────────────────────────────
    @JavascriptInterface
    fun wifiOn() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ctx.startActivity(Intent(Settings.Panel.ACTION_WIFI).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            })
        } else {
            @Suppress("DEPRECATION")
            (ctx.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager)
                .isWifiEnabled = true
            toast("📶 Wi-Fi ON")
        }
    }

    // ── Wi-Fi OFF ───────────────────────────────────────────────
    @JavascriptInterface
    fun wifiOff() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ctx.startActivity(Intent(Settings.Panel.ACTION_WIFI).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            })
        } else {
            @Suppress("DEPRECATION")
            (ctx.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager)
                .isWifiEnabled = false
            toast("Wi-Fi OFF")
        }
    }

    // ── Wi-Fi status ────────────────────────────────────────────
    @JavascriptInterface
    fun isWifiEnabled(): Boolean =
        (ctx.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager).isWifiEnabled

    // ── Bluetooth ON ────────────────────────────────────────────
    @JavascriptInterface
    fun bluetoothOn() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ctx.startActivity(Intent(Settings.ACTION_BLUETOOTH_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            })
        } else {
            @Suppress("DEPRECATION", "MissingPermission")
            BluetoothAdapter.getDefaultAdapter()?.enable()
            toast("🔵 Bluetooth ON")
        }
    }

    // ── Bluetooth OFF ───────────────────────────────────────────
    @JavascriptInterface
    fun bluetoothOff() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ctx.startActivity(Intent(Settings.ACTION_BLUETOOTH_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            })
        } else {
            @Suppress("DEPRECATION", "MissingPermission")
            BluetoothAdapter.getDefaultAdapter()?.disable()
            toast("Bluetooth OFF")
        }
    }

    // ── Make phone call ─────────────────────────────────────────
    @JavascriptInterface
    fun makeCall(number: String) {
        val perm = Manifest.permission.CALL_PHONE
        val action = if (ContextCompat.checkSelfPermission(ctx, perm) == PackageManager.PERMISSION_GRANTED)
            Intent.ACTION_CALL else Intent.ACTION_DIAL
        ctx.startActivity(Intent(action, Uri.parse("tel:$number")).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        })
    }

    // ── Send SMS ────────────────────────────────────────────────
    @JavascriptInterface
    fun sendSms(number: String, body: String) {
        ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("sms:$number")).apply {
            putExtra("sms_body", body)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        })
    }

    // ── Create file in Downloads ────────────────────────────────
    @JavascriptInterface
    fun createFile(name: String, content: String): String {
        return try {
            val dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            dir.mkdirs()
            FileOutputStream(File(dir, name)).use { it.write(content.toByteArray()) }
            toast("✅ Saved: $name")
            "ok"
        } catch (e: Exception) { "error:${e.message}" }
    }

    // ── Open Google Maps ────────────────────────────────────────
    @JavascriptInterface
    fun openMaps(query: String) {
        try {
            ctx.startActivity(Intent(Intent.ACTION_VIEW,
                Uri.parse("geo:0,0?q=${Uri.encode(query)}")).apply {
                setPackage("com.google.android.apps.maps")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            })
        } catch (e: Exception) {
            openUrl("https://maps.google.com/?q=${Uri.encode(query)}")
        }
    }

    // ── Set brightness ──────────────────────────────────────────
    @JavascriptInterface
    fun setBrightness(value: Int) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && Settings.System.canWrite(ctx)) {
            Settings.System.putInt(ctx.contentResolver,
                Settings.System.SCREEN_BRIGHTNESS, value.coerceIn(0, 255))
            toast("☀️ Brightness: $value")
        }
    }

    // ── Share text ──────────────────────────────────────────────
    @JavascriptInterface
    fun shareText(text: String) {
        ctx.startActivity(Intent.createChooser(
            Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_TEXT, text)
            }, "Share"
        ).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) })
    }

    // ── Vibrate ─────────────────────────────────────────────────
    @JavascriptInterface
    fun vibrate() {
        val v = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (ctx.getSystemService(android.os.VibratorManager::class.java)).defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            ctx.getSystemService(Context.VIBRATOR_SERVICE) as android.os.Vibrator
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            v.vibrate(android.os.VibrationEffect.createOneShot(300,
                android.os.VibrationEffect.DEFAULT_AMPLITUDE))
        } else {
            @Suppress("DEPRECATION")
            v.vibrate(300)
        }
    }

    // ── Device info ─────────────────────────────────────────────
    @JavascriptInterface
    fun getDeviceInfo(): String =
        """{"brand":"${Build.BRAND}","model":"${Build.MODEL}","android":"${Build.VERSION.RELEASE}","sdk":${Build.VERSION.SDK_INT}}"""

    // ── Open camera ─────────────────────────────────────────────
    @JavascriptInterface
    fun openCamera() {
        ctx.startActivity(Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        })
    }

    // ── Open gallery ────────────────────────────────────────────
    @JavascriptInterface
    fun openGallery() {
        ctx.startActivity(Intent(Intent.ACTION_VIEW).apply {
            type = "image/*"
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        })
    }

    // ── Open Settings ───────────────────────────────────────────
    @JavascriptInterface
    fun openSettings() {
        ctx.startActivity(Intent(Settings.ACTION_SETTINGS).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        })
    }

    // ── Get installed apps list ─────────────────────────────────
    @JavascriptInterface
    fun getInstalledApps(): String {
        val pm = ctx.packageManager
        val list = pm.getInstalledApplications(PackageManager.GET_META_DATA)
            .map { "\"${pm.getApplicationLabel(it)}\"" }
            .sorted().joinToString(",")
        return "[$list]"
    }

    // ── Show Toast ──────────────────────────────────────────────
    @JavascriptInterface
    fun toast(msg: String) = ctx.runOnUiThread {
        Toast.makeText(ctx, msg, Toast.LENGTH_SHORT).show()
    }
}
