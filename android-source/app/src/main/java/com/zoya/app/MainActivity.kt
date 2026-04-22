package com.zoya.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.Dialog
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.camera2.CameraManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Message
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.AlarmClock
import android.provider.MediaStore
import android.provider.Settings
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        webView = WebView(this)
        setContentView(webView)

        // Request basic permissions on startup
        val permissions = arrayOf(
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.CAMERA,
            Manifest.permission.ACCESS_FINE_LOCATION
        )
        ActivityCompat.requestPermissions(this, permissions, 1)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = true
            allowContentAccess = true
            setSupportMultipleWindows(true) // CRITICAL for Google Sign-In Popup
            javaScriptCanOpenWindowsAutomatically = true
            // CRITICAL: This allows Google Sign-In to work inside the WebView
            userAgentString = userAgentString.replace("; wv", "")
        }

        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val url = request?.url?.toString() ?: return false
                
                // Let WebView load normal web pages
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    // If it's a WhatsApp web link, convert it to app link
                    if (url.contains("web.whatsapp.com/send")) {
                        try {
                            val newUrl = url.replace("https://web.whatsapp.com/send", "whatsapp://send")
                            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(newUrl))
                            startActivity(intent)
                            return true
                        } catch (e: Exception) {
                            Toast.makeText(this@MainActivity, "WhatsApp is not installed", Toast.LENGTH_SHORT).show()
                            return false
                        }
                    }
                    return false
                }
                
                // Handle deep links like whatsapp://, tel://, intent:// etc.
                try {
                    val intent = if (url.startsWith("intent:")) {
                        Intent.parseUri(url, Intent.URI_INTENT_SCHEME)
                    } else {
                        Intent(Intent.ACTION_VIEW, Uri.parse(url))
                    }
                    startActivity(intent)
                    return true
                } catch (e: Exception) {
                    Toast.makeText(this@MainActivity, "App not installed for this action", Toast.LENGTH_SHORT).show()
                    return true
                }
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                // Explicitly grant audio and video capture permissions
                runOnUiThread {
                    request.grant(arrayOf(
                        PermissionRequest.RESOURCE_AUDIO_CAPTURE,
                        PermissionRequest.RESOURCE_VIDEO_CAPTURE
                    ))
                }
            }

            // Handle Google Sign-In Popup
            override fun onCreateWindow(
                view: WebView?,
                isDialog: Boolean,
                isUserGesture: Boolean,
                resultMsg: Message?
            ): Boolean {
                val newWebView = WebView(this@MainActivity)
                newWebView.settings.apply {
                    javaScriptEnabled = true
                    userAgentString = view?.settings?.userAgentString
                }

                val dialog = Dialog(this@MainActivity)
                dialog.setContentView(newWebView)
                dialog.window?.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
                dialog.show()

                newWebView.webChromeClient = object : WebChromeClient() {
                    override fun onCloseWindow(window: WebView?) {
                        dialog.dismiss()
                    }
                }
                newWebView.webViewClient = WebViewClient()

                val transport = resultMsg?.obj as WebView.WebViewTransport
                transport.webView = newWebView
                resultMsg.sendToTarget()
                return true
            }
        }
        
        webView.addJavascriptInterface(WebAppInterface(this), "Android")
        
        // Load the live hosted URL so Google Sign-In works perfectly
        webView.loadUrl("https://ais-dev-kj5b6yrv73utzbjhek6rqd-75073874065.asia-east1.run.app")
    }
}

class WebAppInterface(private val context: AppCompatActivity) {
    @JavascriptInterface
    fun openApp(appName: String) {
        val pm: PackageManager = context.packageManager
        val packages = pm.getInstalledApplications(PackageManager.GET_META_DATA)
        
        for (packageInfo in packages) {
            val name = pm.getApplicationLabel(packageInfo).toString().lowercase()
            if (name.contains(appName.lowercase())) {
                val intent = pm.getLaunchIntentForPackage(packageInfo.packageName)
                if (intent != null) {
                    context.startActivity(intent)
                    return
                }
            }
        }
        Toast.makeText(context, "App not found: $appName", Toast.LENGTH_SHORT).show()
    }

    @JavascriptInterface
    fun toggleFlashlight(status: Boolean) {
        try {
            val cameraManager = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
            val cameraId = cameraManager.cameraIdList[0]
            cameraManager.setTorchMode(cameraId, status)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    @JavascriptInterface
    fun vibrate(duration: Long) {
        val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val vibratorManager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
            vibratorManager.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createOneShot(duration, VibrationEffect.DEFAULT_AMPLITUDE))
        } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(duration)
        }
    }

    @JavascriptInterface
    fun openCamera() {
        try {
            val intent = Intent(MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA)
            context.startActivity(intent)
        } catch (e: Exception) {
            Toast.makeText(context, "Camera not found", Toast.LENGTH_SHORT).show()
        }
    }

    @JavascriptInterface
    fun openSettings() {
        try {
            val intent = Intent(Settings.ACTION_SETTINGS)
            context.startActivity(intent)
        } catch (e: Exception) {
            Toast.makeText(context, "Settings not found", Toast.LENGTH_SHORT).show()
        }
    }

    @JavascriptInterface
    fun setAlarm(hour: Int, minute: Int, message: String) {
        try {
            val intent = Intent(AlarmClock.ACTION_SET_ALARM).apply {
                putExtra(AlarmClock.EXTRA_HOUR, hour)
                putExtra(AlarmClock.EXTRA_MINUTES, minute)
                putExtra(AlarmClock.EXTRA_MESSAGE, message)
                putExtra(AlarmClock.EXTRA_SKIP_UI, true)
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            Toast.makeText(context, "Alarm app not found", Toast.LENGTH_SHORT).show()
        }
    }

    @JavascriptInterface
    fun getBatteryLevel(): Int {
        val batteryManager = context.getSystemService(Context.BATTERY_SERVICE) as android.os.BatteryManager
        return batteryManager.getIntProperty(android.os.BatteryManager.BATTERY_PROPERTY_CAPACITY)
    }
}
