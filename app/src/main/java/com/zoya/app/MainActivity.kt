package com.zoya.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.WallpaperManager
import android.bluetooth.BluetoothAdapter
import android.content.BroadcastReceiver
import android.content.ContentResolver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.hardware.camera2.CameraAccessException
import android.hardware.camera2.CameraManager
import android.media.AudioManager
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.BatteryManager
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.AlarmClock
import android.provider.Settings
import android.webkit.*
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import java.io.File
import java.io.FileOutputStream

class MainActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_WAKE_LAUNCH = "wake_launch"
        const val EXTRA_REMINDER_MESSAGE = "reminder_message"
        const val EXTRA_REMINDER_TYPE = "reminder_type"
    }

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

    private val wakeReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val transcript = intent.getStringExtra(WakeWordService.EXTRA_TRANSCRIPT).orEmpty()
            notifyWebView("onWakeWord", transcript)
        }
    }

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

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                // Deliver any pending wake / reminder intent extras to the page.
                handleIncomingIntent(intent)
            }
        }

        // Register JS bridge
        webView.addJavascriptInterface(ZoyaInterface(this) { script ->
            runOnUiThread { webView.evaluateJavascript(script, null) }
        }, "Android")

        // Kick off background services
        val prefs = getSharedPreferences("zoya_prefs", MODE_PRIVATE)
        if (prefs.getBoolean("wake_enabled", true)) {
            try { WakeWordService.start(this) } catch (_: Exception) {}
        }
        IdleNotificationWorker.schedule(this)

        // Load the app
        webView.loadUrl("https://ais-dev-kj5b6yrv73utzbjhek6rqd-75073874065.asia-east1.run.app")
    }

    override fun onResume() {
        super.onResume()
        LocalBroadcastManager.getInstance(this).registerReceiver(
            wakeReceiver, IntentFilter(WakeWordService.ACTION_WAKE_DETECTED)
        )
    }

    override fun onPause() {
        super.onPause()
        try {
            LocalBroadcastManager.getInstance(this).unregisterReceiver(wakeReceiver)
        } catch (_: Exception) {}
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIncomingIntent(intent)
    }

    private fun handleIncomingIntent(intent: Intent?) {
        if (intent == null) return
        if (intent.getBooleanExtra(EXTRA_WAKE_LAUNCH, false)) {
            val transcript = intent.getStringExtra(WakeWordService.EXTRA_TRANSCRIPT).orEmpty()
            notifyWebView("onWakeWord", transcript)
        }
        val reminderMsg = intent.getStringExtra(EXTRA_REMINDER_MESSAGE)
        if (!reminderMsg.isNullOrBlank()) {
            val type = intent.getStringExtra(EXTRA_REMINDER_TYPE) ?: "reminder"
            notifyWebView("onReminder", "$type|$reminderMsg")
        }
    }

    private fun notifyWebView(event: String, data: String) {
        val safe = data.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n")
        val js = "window.ZoyaNative && window.ZoyaNative.$event && " +
                 "window.ZoyaNative.$event('$safe');"
        runOnUiThread { webView.evaluateJavascript(js, null) }
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack()
        else super.onBackPressed()
    }
}
