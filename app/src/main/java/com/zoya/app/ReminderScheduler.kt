package com.zoya.app

import android.app.*
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import java.util.Calendar

/**
 * Schedules one-shot alarms for user reminders and recurring yearly alarms for
 * birthdays / anniversaries. The WebView can register these via
 * ZoyaInterface.scheduleReminder / scheduleYearly.
 */
object ReminderScheduler {

    const val CHANNEL_ID = "zoya_reminders"
    const val EXTRA_TITLE = "title"
    const val EXTRA_MESSAGE = "message"
    const val EXTRA_TYPE = "type"      // reminder | birthday | anniversary
    const val EXTRA_ID = "reminder_id"

    fun scheduleAt(ctx: Context, id: Int, triggerAtMs: Long, title: String, message: String, type: String = "reminder") {
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val pi = buildPendingIntent(ctx, id, title, message, type)
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !am.canScheduleExactAlarms()) {
                am.set(AlarmManager.RTC_WAKEUP, triggerAtMs, pi)
            } else {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMs, pi)
            }
        } catch (_: SecurityException) {
            am.set(AlarmManager.RTC_WAKEUP, triggerAtMs, pi)
        }
    }

    /** Schedule a yearly recurring alarm (next occurrence). Re-scheduled after fire. */
    fun scheduleYearly(ctx: Context, id: Int, month: Int, day: Int, hour: Int, minute: Int,
                       title: String, message: String, type: String) {
        val now = Calendar.getInstance()
        val target = Calendar.getInstance().apply {
            set(Calendar.MONTH, month)
            set(Calendar.DAY_OF_MONTH, day)
            set(Calendar.HOUR_OF_DAY, hour)
            set(Calendar.MINUTE, minute)
            set(Calendar.SECOND, 0)
            if (timeInMillis <= now.timeInMillis) add(Calendar.YEAR, 1)
        }
        scheduleAt(ctx, id, target.timeInMillis, title, message, type)
    }

    fun cancel(ctx: Context, id: Int) {
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        am.cancel(buildPendingIntent(ctx, id, "", "", ""))
    }

    private fun buildPendingIntent(ctx: Context, id: Int, title: String, message: String, type: String): PendingIntent {
        val i = Intent(ctx, ReminderReceiver::class.java).apply {
            putExtra(EXTRA_ID, id)
            putExtra(EXTRA_TITLE, title)
            putExtra(EXTRA_MESSAGE, message)
            putExtra(EXTRA_TYPE, type)
        }
        return PendingIntent.getBroadcast(
            ctx, id, i,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
    }

    fun ensureChannel(ctx: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = ctx.getSystemService(NotificationManager::class.java)
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return
        val ch = NotificationChannel(
            CHANNEL_ID, "Zoya reminders",
            NotificationManager.IMPORTANCE_HIGH
        ).apply { description = "Reminders, birthdays and anniversaries" }
        nm.createNotificationChannel(ch)
    }
}

class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        val id = intent.getIntExtra(ReminderScheduler.EXTRA_ID, 0)
        val title = intent.getStringExtra(ReminderScheduler.EXTRA_TITLE) ?: "Zoya"
        val message = intent.getStringExtra(ReminderScheduler.EXTRA_MESSAGE) ?: ""
        val type = intent.getStringExtra(ReminderScheduler.EXTRA_TYPE) ?: "reminder"

        ReminderScheduler.ensureChannel(ctx)

        val pi = PendingIntent.getActivity(
            ctx, id + 10_000,
            Intent(ctx, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra(MainActivity.EXTRA_REMINDER_MESSAGE, message)
                .putExtra(MainActivity.EXTRA_REMINDER_TYPE, type),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val n = NotificationCompat.Builder(ctx, ReminderScheduler.CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle(title)
            .setContentText(message)
            .setStyle(NotificationCompat.BigTextStyle().bigText(message))
            .setContentIntent(pi)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()

        ctx.getSystemService(NotificationManager::class.java).notify(id, n)

        // Re-arm birthdays / anniversaries for next year.
        if (type == "birthday" || type == "anniversary") {
            val c = Calendar.getInstance().apply { add(Calendar.YEAR, 1) }
            ReminderScheduler.scheduleAt(
                ctx, id, c.timeInMillis, title, message, type
            )
        }
    }
}

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        val prefs = ctx.getSharedPreferences("zoya_prefs", Context.MODE_PRIVATE)
        if (prefs.getBoolean("wake_enabled", true)) {
            try { WakeWordService.start(ctx) } catch (_: Exception) {}
        }
        IdleNotificationWorker.schedule(ctx)
    }
}
