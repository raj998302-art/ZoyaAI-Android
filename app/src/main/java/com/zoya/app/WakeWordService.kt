package com.zoya.app

import android.app.*
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.localbroadcastmanager.content.LocalBroadcastManager

/**
 * Foreground service that continuously listens for the wake phrase "Hey Zoya"
 * using Android's on-device SpeechRecognizer. When the phrase is detected the
 * service sends a local broadcast so MainActivity can bring the app to the
 * foreground and hand off to the conversation flow.
 *
 * Sensitivity is controlled via [SharedPrefs] key [PREF_SENSITIVITY] (0.0–1.0).
 * Lower values = more permissive matching.
 */
class WakeWordService : Service() {

    companion object {
        const val ACTION_WAKE_DETECTED = "com.zoya.app.WAKE_DETECTED"
        const val EXTRA_TRANSCRIPT = "transcript"
        const val CHANNEL_ID = "zoya_wake_channel"
        const val NOTIFICATION_ID = 4201
        const val PREF_SENSITIVITY = "wake_sensitivity" // 0.0 strict, 1.0 loose
        private const val TAG = "ZoyaWake"

        // Variants we accept as "Hey Zoya". Kept generous because on-device
        // Hindi/English STT often confuses the Z sound.
        private val WAKE_PATTERNS = listOf(
            "hey zoya", "hi zoya", "hey joya", "hey zoeya", "hey jiya",
            "he zoya", "hey soya", "hey zoya", "hey zoyaa", "hey zoy",
            "ay zoya", "a zoya", "hey joy ya", "hey joy", "zoya"
        )

        fun start(ctx: Context) {
            val intent = Intent(ctx, WakeWordService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ctx.startForegroundService(intent)
            } else {
                ctx.startService(intent)
            }
        }

        fun stop(ctx: Context) {
            ctx.stopService(Intent(ctx, WakeWordService::class.java))
        }
    }

    private var recognizer: SpeechRecognizer? = null
    private val mainHandler = Handler(Looper.getMainLooper())
    private var stopped = false
    private var restartScheduled = false

    override fun onBind(intent: Intent?) = null

    override fun onCreate() {
        super.onCreate()
        ensureChannel()
        startForeground(NOTIFICATION_ID, buildNotification())
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            Log.w(TAG, "Speech recognition not available on device")
            stopSelf()
            return START_NOT_STICKY
        }
        initRecognizer()
        startListening()
        return START_STICKY
    }

    override fun onDestroy() {
        stopped = true
        try { recognizer?.destroy() } catch (_: Exception) {}
        recognizer = null
        super.onDestroy()
    }

    private fun initRecognizer() {
        if (recognizer != null) return
        recognizer = SpeechRecognizer.createSpeechRecognizer(this).apply {
            setRecognitionListener(listener)
        }
    }

    private fun startListening() {
        if (stopped) return
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            // Prefer English-India + Hindi so Hinglish wake word works.
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-IN")
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "en-IN")
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5)
            putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, packageName)
            putExtra("android.speech.extra.DICTATION_MODE", true)
        }
        try {
            recognizer?.startListening(intent)
        } catch (e: Exception) {
            Log.e(TAG, "startListening failed", e)
            scheduleRestart(1500)
        }
    }

    private fun scheduleRestart(delayMs: Long) {
        if (stopped || restartScheduled) return
        restartScheduled = true
        mainHandler.postDelayed({
            restartScheduled = false
            try { recognizer?.cancel() } catch (_: Exception) {}
            startListening()
        }, delayMs)
    }

    private val listener = object : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) {}
        override fun onBeginningOfSpeech() {}
        override fun onRmsChanged(rmsdB: Float) {}
        override fun onBufferReceived(buffer: ByteArray?) {}
        override fun onEndOfSpeech() {}
        override fun onEvent(eventType: Int, params: Bundle?) {}

        override fun onPartialResults(partialResults: Bundle?) {
            val hits = partialResults
                ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION).orEmpty()
            if (matches(hits)) {
                broadcastWake(hits.firstOrNull().orEmpty())
                // Stop current session; onResults/onError will restart.
                try { recognizer?.stopListening() } catch (_: Exception) {}
            }
        }

        override fun onResults(results: Bundle?) {
            val hits = results
                ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION).orEmpty()
            if (matches(hits)) {
                broadcastWake(hits.firstOrNull().orEmpty())
            }
            scheduleRestart(250)
        }

        override fun onError(error: Int) {
            // Common errors during idle listening: NO_MATCH, SPEECH_TIMEOUT,
            // ERROR_BUSY. Always restart after a short back-off.
            val backoff = when (error) {
                SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> 1500L
                SpeechRecognizer.ERROR_NETWORK,
                SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> 3000L
                SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> 30000L
                else -> 600L
            }
            scheduleRestart(backoff)
        }
    }

    private fun matches(candidates: List<String>): Boolean {
        if (candidates.isEmpty()) return false
        val sensitivity = getSharedPreferences("zoya_prefs", Context.MODE_PRIVATE)
            .getFloat(PREF_SENSITIVITY, 0.6f).coerceIn(0f, 1f)
        for (raw in candidates) {
            val c = raw.lowercase().trim()
            if (c.isEmpty()) continue
            // Direct substring match against any accepted variant.
            if (WAKE_PATTERNS.any { c.contains(it) }) return true
            // Fuzzy: at higher sensitivity (>= 0.7), allow short tokens that
            // contain "zoya" even without a preceding "hey".
            if (sensitivity >= 0.7f && (c.contains("zoya") || c.contains("joya"))) {
                return true
            }
        }
        return false
    }

    private fun broadcastWake(transcript: String) {
        val intent = Intent(ACTION_WAKE_DETECTED).apply {
            putExtra(EXTRA_TRANSCRIPT, transcript)
        }
        LocalBroadcastManager.getInstance(this).sendBroadcast(intent)

        // Also bring the app to the foreground if it is not already there.
        val launch = Intent(this, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_SINGLE_TOP or
                Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
            putExtra(MainActivity.EXTRA_WAKE_LAUNCH, true)
            putExtra(EXTRA_TRANSCRIPT, transcript)
        }
        try { startActivity(launch) } catch (_: Exception) {}
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return
        val ch = NotificationChannel(
            CHANNEL_ID, "Zoya wake word",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Background listening for \"Hey Zoya\""
            setShowBadge(false)
        }
        nm.createNotificationChannel(ch)
    }

    private fun buildNotification(): Notification {
        val contentIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Zoya is listening")
            .setContentText("Say \"Hey Zoya\" anytime \uD83D\uDC95")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setOngoing(true)
            .setContentIntent(contentIntent)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }
}
