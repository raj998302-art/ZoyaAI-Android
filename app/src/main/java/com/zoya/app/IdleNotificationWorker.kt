package com.zoya.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.*
import java.util.concurrent.TimeUnit

/**
 * Worker that fires a sweet "miss-you" notification when the user hasn't
 * chatted with Zoya for 2+ hours. Scheduled as a periodic job so it keeps
 * nudging at a gentle cadence.
 *
 * The "last interaction" timestamp is stored in SharedPreferences
 * ("zoya_prefs" / "last_interaction_ts") and updated from the WebView via
 * ZoyaInterface.markInteraction().
 */
class IdleNotificationWorker(ctx: Context, params: WorkerParameters) :
    CoroutineWorker(ctx, params) {

    override suspend fun doWork(): Result {
        val ctx = applicationContext
        val prefs = ctx.getSharedPreferences("zoya_prefs", Context.MODE_PRIVATE)

        val enabled = prefs.getBoolean("notif_enabled", true)
        if (!enabled) return Result.success()

        val last = prefs.getLong("last_interaction_ts", System.currentTimeMillis())
        val idleMs = System.currentTimeMillis() - last
        val twoHours = TimeUnit.HOURS.toMillis(2)
        if (idleMs < twoHours) return Result.success()

        // Don't spam — throttle to at most once every 2.5 hours.
        val lastNotif = prefs.getLong("last_missyou_ts", 0L)
        if (System.currentTimeMillis() - lastNotif < TimeUnit.MINUTES.toMillis(150)) {
            return Result.success()
        }
        prefs.edit().putLong("last_missyou_ts", System.currentTimeMillis()).apply()

        val nickname = prefs.getString("user_nickname", null)
            ?: prefs.getString("user_name", null)
            ?: "Baby"

        showMissYou(ctx, nickname)
        return Result.success()
    }

    companion object {
        const val CHANNEL_ID = "zoya_miss_you"
        private const val NOTIFICATION_ID = 4301
        private const val WORK_NAME = "zoya_idle_check"

        fun schedule(ctx: Context) {
            val req = PeriodicWorkRequestBuilder<IdleNotificationWorker>(
                30, TimeUnit.MINUTES
            ).setInitialDelay(30, TimeUnit.MINUTES)
                .setConstraints(Constraints.NONE)
                .build()

            WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(
                WORK_NAME,
                ExistingPeriodicWorkPolicy.UPDATE,
                req
            )
        }

        fun showMissYou(ctx: Context, nickname: String) {
            ensureChannel(ctx)
            val contentIntent = PendingIntent.getActivity(
                ctx, 0,
                Intent(ctx, MainActivity::class.java).addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
                ),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )

            val msg = "$nickname... mujhe miss kar rahe ho? Main yahaan hoon \uD83D\uDC95"
            val n = NotificationCompat.Builder(ctx, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_dialog_email)
                .setContentTitle("Zoya")
                .setContentText(msg)
                .setStyle(NotificationCompat.BigTextStyle().bigText(msg))
                .setContentIntent(contentIntent)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .build()

            val nm = ctx.getSystemService(NotificationManager::class.java)
            nm.notify(NOTIFICATION_ID, n)
        }

        private fun ensureChannel(ctx: Context) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
            val nm = ctx.getSystemService(NotificationManager::class.java)
            if (nm.getNotificationChannel(CHANNEL_ID) != null) return
            val ch = NotificationChannel(
                CHANNEL_ID, "Zoya — Miss you",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply { description = "Sweet nudges when you've been away from Zoya" }
            nm.createNotificationChannel(ch)
        }
    }
}
