package com.zoya.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationManager
import android.app.WallpaperManager
import android.bluetooth.BluetoothAdapter
import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.hardware.camera2.CameraAccessException
import android.hardware.camera2.CameraManager
import android.location.Location
import android.location.LocationManager
import android.media.AudioManager
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.BatteryManager
import android.os.Build
import android.os.Environment
import android.os.StatFs
import android.provider.AlarmClock
import android.provider.CalendarContract
import android.provider.ContactsContract
import android.provider.MediaStore
import android.provider.Settings
import android.text.TextUtils
import android.webkit.JavascriptInterface
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.util.Calendar

/**
 * Full Zoya <-> Android bridge. Each @JavascriptInterface method is callable
 * from the embedded WebView via `window.Android.<method>()`.
 *
 * The JS side injects values by calling `window.Android.markInteraction()`
 * after every user interaction; this is used by IdleNotificationWorker to
 * decide when to fire "miss you" nudges.
 */
class ZoyaInterface(
    private val ctx: AppCompatActivity,
    private val runJs: (String) -> Unit
) {

    private fun prefs() = ctx.getSharedPreferences("zoya_prefs", Context.MODE_PRIVATE)

    // ══════════════════════════════════════════════════════════════════════
    //   Lifecycle / memory sync
    // ══════════════════════════════════════════════════════════════════════

    /** JS calls this after every chat turn so idle-notifier knows we're active. */
    @JavascriptInterface
    fun markInteraction() {
        prefs().edit().putLong("last_interaction_ts", System.currentTimeMillis()).apply()
    }

    /** Persist basic user profile for miss-you notifications and greetings. */
    @JavascriptInterface
    fun setUserProfile(name: String?, nickname: String?) {
        prefs().edit()
            .putString("user_name", name)
            .putString("user_nickname", nickname)
            .apply()
    }

    @JavascriptInterface
    fun getUserProfile(): String {
        val p = prefs()
        val o = JSONObject()
        o.put("name", p.getString("user_name", null))
        o.put("nickname", p.getString("user_nickname", null))
        return o.toString()
    }

    // ══════════════════════════════════════════════════════════════════════
    //   Wake-word settings
    // ══════════════════════════════════════════════════════════════════════

    @JavascriptInterface
    fun setWakeEnabled(enabled: Boolean) {
        prefs().edit().putBoolean("wake_enabled", enabled).apply()
        if (enabled) WakeWordService.start(ctx) else WakeWordService.stop(ctx)
        toast(if (enabled) "Wake word ON" else "Wake word OFF")
    }

    @JavascriptInterface
    fun setWakeSensitivity(value: Float) {
        prefs().edit()
            .putFloat(WakeWordService.PREF_SENSITIVITY, value.coerceIn(0f, 1f))
            .apply()
    }

    @JavascriptInterface
    fun setNotificationsEnabled(enabled: Boolean) {
        prefs().edit().putBoolean("notif_enabled", enabled).apply()
    }

    // ══════════════════════════════════════════════════════════════════════
    //   App / URL / search launchers
    // ══════════════════════════════════════════════════════════════════════

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

    @JavascriptInterface
    fun openUrl(url: String) {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        ctx.startActivity(intent)
    }

    @JavascriptInterface
    fun searchGoogle(query: String) {
        openUrl("https://www.google.com/search?q=${Uri.encode(query)}")
    }

    @JavascriptInterface
    fun playYoutube(query: String) {
        val appIntent = Intent(Intent.ACTION_SEARCH).apply {
            setPackage("com.google.android.youtube")
            putExtra("query", query)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        try { ctx.startActivity(appIntent) }
        catch (e: Exception) {
            openUrl("https://www.youtube.com/results?search_query=${Uri.encode(query)}")
        }
    }

    @JavascriptInterface
    fun openChromeUrl(url: String) {
        try {
            val i = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                setPackage("com.android.chrome")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            ctx.startActivity(i)
        } catch (_: Exception) { openUrl(url) }
    }

    // ══════════════════════════════════════════════════════════════════════
    //   Torch
    // ══════════════════════════════════════════════════════════════════════

    @JavascriptInterface
    fun torchOn() = setTorch(true)

    @JavascriptInterface
    fun torchOff() = setTorch(false)

    private fun setTorch(on: Boolean) {
        try {
            val cm = ctx.getSystemService(Context.CAMERA_SERVICE) as CameraManager
            cm.setTorchMode(cm.cameraIdList[0], on)
            toast(if (on) "\uD83D\uDD26 Torch ON" else "Torch OFF")
        } catch (e: CameraAccessException) { toast("Torch error") }
    }

    // ══════════════════════════════════════════════════════════════════════
    //   Wi-Fi / Bluetooth / Mobile Data / DND
    // ══════════════════════════════════════════════════════════════════════

    @JavascriptInterface
    fun wifiOn() = toggleWifi(true)

    @JavascriptInterface
    fun wifiOff() = toggleWifi(false)

    @Suppress("DEPRECATION")
    private fun toggleWifi(enable: Boolean) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ctx.startActivity(Intent(Settings.Panel.ACTION_WIFI).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            })
        } else {
            (ctx.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager)
                .isWifiEnabled = enable
            toast(if (enable) "\uD83D\uDCF6 Wi-Fi ON" else "Wi-Fi OFF")
        }
    }

    @JavascriptInterface
    fun isWifiEnabled(): Boolean =
        (ctx.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager).isWifiEnabled

    @JavascriptInterface
    fun bluetoothOn() = toggleBluetooth(true)

    @JavascriptInterface
    fun bluetoothOff() = toggleBluetooth(false)

    @SuppressLint("MissingPermission")
    @Suppress("DEPRECATION")
    private fun toggleBluetooth(enable: Boolean) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ctx.startActivity(Intent(Settings.ACTION_BLUETOOTH_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            })
        } else {
            if (enable) BluetoothAdapter.getDefaultAdapter()?.enable()
            else BluetoothAdapter.getDefaultAdapter()?.disable()
            toast(if (enable) "\uD83D\uDD35 Bluetooth ON" else "Bluetooth OFF")
        }
    }

    /** Mobile data cannot be toggled programmatically on modern Android; open panel. */
    @JavascriptInterface
    fun toggleMobileData() {
        ctx.startActivity(Intent(Settings.ACTION_DATA_ROAMING_SETTINGS).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        })
    }

    @JavascriptInterface
    fun setDoNotDisturb(on: Boolean) {
        try {
            val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                if (!nm.isNotificationPolicyAccessGranted) {
                    ctx.startActivity(
                        Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS)
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    )
                    toast("Allow DND access for Zoya")
                    return
                }
                nm.setInterruptionFilter(
                    if (on) NotificationManager.INTERRUPTION_FILTER_NONE
                    else NotificationManager.INTERRUPTION_FILTER_ALL
                )
                toast(if (on) "DND ON" else "DND OFF")
            }
        } catch (e: Exception) { toast("DND error") }
    }

    // ══════════════════════════════════════════════════════════════════════
    //   Volume / brightness / ringtone
    // ══════════════════════════════════════════════════════════════════════

    @JavascriptInterface
    fun setVolume(percent: Int) {
        val am = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        val v = (percent.coerceIn(0, 100) * max) / 100
        am.setStreamVolume(AudioManager.STREAM_MUSIC, v, 0)
    }

    @JavascriptInterface
    fun volumeUp() {
        val am = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        am.adjustStreamVolume(AudioManager.STREAM_MUSIC,
            AudioManager.ADJUST_RAISE, AudioManager.FLAG_SHOW_UI)
    }

    @JavascriptInterface
    fun volumeDown() {
        val am = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        am.adjustStreamVolume(AudioManager.STREAM_MUSIC,
            AudioManager.ADJUST_LOWER, AudioManager.FLAG_SHOW_UI)
    }

    @JavascriptInterface
    fun mute() {
        val am = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        am.adjustStreamVolume(AudioManager.STREAM_MUSIC,
            AudioManager.ADJUST_MUTE, AudioManager.FLAG_SHOW_UI)
    }

    @JavascriptInterface
    fun setBrightness(value: Int) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && Settings.System.canWrite(ctx)) {
            Settings.System.putInt(ctx.contentResolver,
                Settings.System.SCREEN_BRIGHTNESS, value.coerceIn(0, 255))
            toast("\u2600\uFE0F Brightness: $value")
        } else {
            toast("Give write-settings permission")
        }
    }

    /** Open the system ringtone picker. */
    @JavascriptInterface
    fun changeRingtone() {
        ctx.startActivity(Intent(Settings.ACTION_SOUND_SETTINGS).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        })
    }

    // ══════════════════════════════════════════════════════════════════════
    //   Calls / SMS / WhatsApp / Email
    // ══════════════════════════════════════════════════════════════════════

    @JavascriptInterface
    fun makeCall(number: String) {
        val perm = Manifest.permission.CALL_PHONE
        val action = if (ContextCompat.checkSelfPermission(ctx, perm) == PackageManager.PERMISSION_GRANTED)
            Intent.ACTION_CALL else Intent.ACTION_DIAL
        ctx.startActivity(Intent(action, Uri.parse("tel:$number")).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        })
    }

    /** Call by contact name — resolves first matching phone number. */
    @JavascriptInterface
    fun callContact(name: String) {
        val number = findContactNumber(name)
        if (number == null) { toast("Contact not found: $name"); return }
        makeCall(number)
    }

    @JavascriptInterface
    fun sendSms(number: String, body: String) {
        ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("sms:$number")).apply {
            putExtra("sms_body", body)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        })
    }

    @JavascriptInterface
    fun smsContact(name: String, body: String) {
        val number = findContactNumber(name) ?: run { toast("Contact not found"); return }
        sendSms(number, body)
    }

    /** Send WhatsApp via api.whatsapp.com — works even for non-saved numbers. */
    @JavascriptInterface
    fun sendWhatsApp(number: String, message: String) {
        val digits = number.filter { it.isDigit() || it == '+' }.trimStart('+')
        val url = "https://api.whatsapp.com/send?phone=$digits&text=${Uri.encode(message)}"
        val i = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
            setPackage("com.whatsapp")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        try { ctx.startActivity(i) } catch (_: Exception) { openUrl(url) }
    }

    @JavascriptInterface
    fun whatsappContact(name: String, message: String) {
        val number = findContactNumber(name) ?: run { toast("Contact not found"); return }
        sendWhatsApp(number, message)
    }

    @JavascriptInterface
    fun sendEmail(to: String, subject: String, body: String) {
        val i = Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:$to")).apply {
            putExtra(Intent.EXTRA_SUBJECT, subject)
            putExtra(Intent.EXTRA_TEXT, body)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        ctx.startActivity(Intent.createChooser(i, "Send email")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    private fun findContactNumber(name: String): String? {
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.READ_CONTACTS)
            != PackageManager.PERMISSION_GRANTED) return null
        val uri = ContactsContract.CommonDataKinds.Phone.CONTENT_URI
        val projection = arrayOf(
            ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
            ContactsContract.CommonDataKinds.Phone.NUMBER
        )
        ctx.contentResolver.query(uri, projection,
            "${ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME} LIKE ?",
            arrayOf("%$name%"), null)?.use { c ->
            if (c.moveToFirst()) return c.getString(1)
        }
        return null
    }

    // ══════════════════════════════════════════════════════════════════════
    //   Files / folders / image→PDF
    // ══════════════════════════════════════════════════════════════════════

    @JavascriptInterface
    fun createFile(name: String, content: String): String {
        return try {
            val dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            dir.mkdirs()
            FileOutputStream(File(dir, name)).use { it.write(content.toByteArray()) }
            toast("\u2705 Saved: $name")
            "ok"
        } catch (e: Exception) { "error:${e.message}" }
    }

    @JavascriptInterface
    fun createFolder(parent: String, name: String): String {
        return try {
            val base = File(parent.ifBlank {
                Environment.getExternalStoragePublicDirectory(
                    Environment.DIRECTORY_DOCUMENTS).absolutePath
            })
            val f = File(base, name)
            if (f.exists() || f.mkdirs()) "ok" else "error:failed"
        } catch (e: Exception) { "error:${e.message}" }
    }

    @JavascriptInterface
    fun deleteFile(path: String): String {
        val f = File(path)
        return if (f.exists() && f.deleteRecursively()) "ok" else "error:not_deleted"
    }

    @JavascriptInterface
    fun renameFile(from: String, to: String): String {
        return if (File(from).renameTo(File(to))) "ok" else "error:rename_failed"
    }

    @JavascriptInterface
    fun moveFile(from: String, toDir: String): String {
        val src = File(from); val dst = File(toDir, src.name)
        return if (src.renameTo(dst)) "ok" else "error:move_failed"
    }

    @JavascriptInterface
    fun searchFiles(name: String, root: String?): String {
        val base = File(root.takeUnless { it.isNullOrBlank() }
            ?: Environment.getExternalStorageDirectory().absolutePath)
        val arr = JSONArray()
        val needle = name.lowercase()
        try {
            base.walkTopDown().maxDepth(6).forEach {
                if (it.name.lowercase().contains(needle)) arr.put(it.absolutePath)
                if (arr.length() >= 100) return@forEach
            }
        } catch (_: Exception) {}
        return arr.toString()
    }

    /** Convert a list of image paths to a single PDF saved under Documents/Zoya. */
    @JavascriptInterface
    fun imagesToPdf(imagePathsJson: String, outputName: String): String {
        return try {
            val arr = JSONArray(imagePathsJson)
            val pdf = android.graphics.pdf.PdfDocument()
            for (i in 0 until arr.length()) {
                val bmp = BitmapFactory.decodeFile(arr.getString(i)) ?: continue
                val info = android.graphics.pdf.PdfDocument.PageInfo.Builder(
                    bmp.width, bmp.height, i + 1).create()
                val page = pdf.startPage(info)
                page.canvas.drawBitmap(bmp, 0f, 0f, null)
                pdf.finishPage(page)
            }
            val outDir = File(Environment.getExternalStoragePublicDirectory(
                Environment.DIRECTORY_DOCUMENTS), "Zoya").apply { mkdirs() }
            val outFile = File(outDir, outputName.ifBlank { "zoya.pdf" })
            FileOutputStream(outFile).use { pdf.writeTo(it) }
            pdf.close()
            toast("\uD83D\uDCC4 PDF saved: ${outFile.name}")
            outFile.absolutePath
        } catch (e: Exception) { "error:${e.message}" }
    }

    // ══════════════════════════════════════════════════════════════════════
    //   Wallpaper / Maps / Camera / Gallery
    // ══════════════════════════════════════════════════════════════════════

    @JavascriptInterface
    fun setWallpaperFromPath(path: String): String {
        return try {
            val bmp = BitmapFactory.decodeFile(path) ?: return "error:decode_failed"
            WallpaperManager.getInstance(ctx).setBitmap(bmp)
            toast("\uD83C\uDF04 Wallpaper updated")
            "ok"
        } catch (e: Exception) { "error:${e.message}" }
    }

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

    @JavascriptInterface
    fun openCamera() {
        ctx.startActivity(Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        })
    }

    @JavascriptInterface
    fun openGallery() {
        ctx.startActivity(Intent(Intent.ACTION_VIEW).apply {
            type = "image/*"
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        })
    }

    @JavascriptInterface
    fun openSettings() {
        ctx.startActivity(Intent(Settings.ACTION_SETTINGS).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        })
    }

    // ══════════════════════════════════════════════════════════════════════
    //   Misc system
    // ══════════════════════════════════════════════════════════════════════

    @JavascriptInterface
    fun shareText(text: String) {
        ctx.startActivity(Intent.createChooser(
            Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_TEXT, text)
            }, "Share"
        ).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) })
    }

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
            @Suppress("DEPRECATION") v.vibrate(300)
        }
    }

    @JavascriptInterface
    fun getDeviceInfo(): String {
        val o = JSONObject()
        o.put("brand", Build.BRAND)
        o.put("model", Build.MODEL)
        o.put("android", Build.VERSION.RELEASE)
        o.put("sdk", Build.VERSION.SDK_INT)
        return o.toString()
    }

    @JavascriptInterface
    fun getBatteryLevel(): Int {
        val bm = ctx.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        return bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
    }

    @JavascriptInterface
    fun getFreeStorageBytes(): Long {
        val stat = StatFs(Environment.getDataDirectory().path)
        return stat.availableBlocksLong * stat.blockSizeLong
    }

    @JavascriptInterface
    fun getTotalStorageBytes(): Long {
        val stat = StatFs(Environment.getDataDirectory().path)
        return stat.blockCountLong * stat.blockSizeLong
    }

    @SuppressLint("MissingPermission")
    @JavascriptInterface
    fun getLocation(): String {
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION)
            != PackageManager.PERMISSION_GRANTED) return "{\"error\":\"permission\"}"
        val lm = ctx.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        val providers = lm.getProviders(true)
        var best: Location? = null
        for (p in providers) {
            val l = try { lm.getLastKnownLocation(p) } catch (_: Exception) { null }
            if (l != null && (best == null || l.accuracy < best.accuracy)) best = l
        }
        val o = JSONObject()
        if (best == null) { o.put("error", "no_fix"); return o.toString() }
        o.put("lat", best.latitude)
        o.put("lon", best.longitude)
        o.put("accuracy", best.accuracy)
        o.put("provider", best.provider)
        return o.toString()
    }

    // ══════════════════════════════════════════════════════════════════════
    //   Alarms / timers / calendar / notes
    // ══════════════════════════════════════════════════════════════════════

    @JavascriptInterface
    fun setAlarm(hour: Int, minute: Int, label: String) {
        val i = Intent(AlarmClock.ACTION_SET_ALARM).apply {
            putExtra(AlarmClock.EXTRA_HOUR, hour.coerceIn(0, 23))
            putExtra(AlarmClock.EXTRA_MINUTES, minute.coerceIn(0, 59))
            putExtra(AlarmClock.EXTRA_MESSAGE, label)
            putExtra(AlarmClock.EXTRA_SKIP_UI, true)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        try { ctx.startActivity(i); toast("\u23F0 Alarm set $hour:$minute") }
        catch (e: Exception) { toast("Alarm failed") }
    }

    @JavascriptInterface
    fun setTimer(seconds: Int, label: String) {
        val i = Intent(AlarmClock.ACTION_SET_TIMER).apply {
            putExtra(AlarmClock.EXTRA_LENGTH, seconds.coerceAtLeast(1))
            putExtra(AlarmClock.EXTRA_MESSAGE, label)
            putExtra(AlarmClock.EXTRA_SKIP_UI, true)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        try { ctx.startActivity(i); toast("\u23F3 Timer $seconds s") }
        catch (e: Exception) { toast("Timer failed") }
    }

    @JavascriptInterface
    fun scheduleReminder(id: Int, triggerAtMs: Long, title: String, message: String) {
        ReminderScheduler.ensureChannel(ctx)
        ReminderScheduler.scheduleAt(ctx, id, triggerAtMs, title, message, "reminder")
        toast("Reminder set")
    }

    /** Schedule a yearly event (birthday / anniversary). */
    @JavascriptInterface
    fun scheduleYearly(id: Int, month: Int, day: Int, hour: Int, minute: Int,
                       title: String, message: String, type: String) {
        ReminderScheduler.ensureChannel(ctx)
        ReminderScheduler.scheduleYearly(ctx, id, month, day, hour, minute, title, message, type)
        toast("$type saved")
    }

    @JavascriptInterface
    fun cancelReminder(id: Int) = ReminderScheduler.cancel(ctx, id)

    @JavascriptInterface
    fun addCalendarEvent(title: String, description: String, startMs: Long, endMs: Long): String {
        return try {
            val values = ContentValues().apply {
                put(CalendarContract.Events.DTSTART, startMs)
                put(CalendarContract.Events.DTEND, endMs)
                put(CalendarContract.Events.TITLE, title)
                put(CalendarContract.Events.DESCRIPTION, description)
                put(CalendarContract.Events.CALENDAR_ID, 1)
                put(CalendarContract.Events.EVENT_TIMEZONE, Calendar.getInstance().timeZone.id)
            }
            val uri = ctx.contentResolver.insert(CalendarContract.Events.CONTENT_URI, values)
            uri?.lastPathSegment ?: "error:no_uri"
        } catch (e: Exception) { "error:${e.message}" }
    }

    @JavascriptInterface
    fun createNote(title: String, content: String): String {
        val dir = File(Environment.getExternalStoragePublicDirectory(
            Environment.DIRECTORY_DOCUMENTS), "Zoya/Notes").apply { mkdirs() }
        val safe = title.replace(Regex("[^A-Za-z0-9_ -]"), "_").take(60).ifBlank { "note" }
        val f = File(dir, "$safe-${System.currentTimeMillis()}.txt")
        return try {
            f.writeText("# $title\n\n$content")
            f.absolutePath
        } catch (e: Exception) { "error:${e.message}" }
    }

    // ══════════════════════════════════════════════════════════════════════
    //   Accessibility helpers (via ZoyaAccessibilityService)
    // ══════════════════════════════════════════════════════════════════════

    @JavascriptInterface
    fun accessibilityEnabled(): Boolean {
        val enabled = try {
            Settings.Secure.getInt(ctx.contentResolver, Settings.Secure.ACCESSIBILITY_ENABLED)
        } catch (_: Settings.SettingNotFoundException) { 0 }
        if (enabled != 1) return false
        val services = Settings.Secure.getString(ctx.contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return false
        return services.contains("${ctx.packageName}/.ZoyaAccessibilityService")
    }

    @JavascriptInterface
    fun openAccessibilitySettings() {
        ctx.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    @JavascriptInterface
    fun autofillForm(fieldsJson: String) {
        if (!accessibilityEnabled()) {
            toast("Enable Zoya accessibility first")
            openAccessibilitySettings()
            return
        }
        val i = Intent(ZoyaAccessibilityService.ACTION_COMMAND).apply {
            putExtra(ZoyaAccessibilityService.EXTRA_OP, "autofill")
            putExtra(ZoyaAccessibilityService.EXTRA_FIELDS, fieldsJson)
        }
        LocalBroadcastManager.getInstance(ctx).sendBroadcast(i)
    }

    @JavascriptInterface
    fun globalAction(op: String) {
        if (!accessibilityEnabled()) { openAccessibilitySettings(); return }
        val i = Intent(ZoyaAccessibilityService.ACTION_COMMAND)
            .putExtra(ZoyaAccessibilityService.EXTRA_OP, op)
        LocalBroadcastManager.getInstance(ctx).sendBroadcast(i)
    }

    // ══════════════════════════════════════════════════════════════════════
    //   Screenshot / screen-record (best-effort on unrooted devices)
    // ══════════════════════════════════════════════════════════════════════

    /**
     * On an unrooted device, a true global screenshot needs MediaProjection or
     * accessibility on Android 11+. We expose the simplest path — open the
     * screenshot via a dispatched global action if accessibility is granted.
     */
    @JavascriptInterface
    fun takeScreenshot() {
        if (accessibilityEnabled() &&
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            try {
                ZoyaAccessibilityService.instance?.performGlobalAction(
                    android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_TAKE_SCREENSHOT
                )
                toast("\uD83D\uDCF7 Screenshot")
                return
            } catch (_: Exception) {}
        }
        toast("Screenshot needs accessibility + Android 11+")
        openAccessibilitySettings()
    }

    /** Open the system screen recorder (Q+). */
    @JavascriptInterface
    fun startScreenRecord() {
        try {
            ctx.startActivity(Intent("com.android.settings.panel.action.SCREEN_RECORD")
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (_: Exception) { toast("Screen record not supported") }
    }

    // ══════════════════════════════════════════════════════════════════════
    //   App list / misc
    // ══════════════════════════════════════════════════════════════════════

    @JavascriptInterface
    fun getInstalledApps(): String {
        val pm = ctx.packageManager
        val arr = JSONArray()
        pm.getInstalledApplications(PackageManager.GET_META_DATA)
            .map { pm.getApplicationLabel(it).toString() }
            .sorted().forEach { arr.put(it) }
        return arr.toString()
    }

    @JavascriptInterface
    fun toast(msg: String) = ctx.runOnUiThread {
        Toast.makeText(ctx, msg, Toast.LENGTH_SHORT).show()
    }
}
