package com.zoya.app

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import androidx.localbroadcastmanager.content.LocalBroadcastManager

/**
 * Accessibility service that powers Zoya's "do it for me" browser flows:
 *
 *  - Autofill form fields in Chrome / any app (name, email, phone, address…)
 *  - Perform a global back / home / recents gesture on request
 *  - Read out the currently focused text (useful for "read this for me")
 *
 * Commands are dispatched via local broadcast. The WebView/ZoyaInterface sends
 * an Intent with action [ACTION_COMMAND] and extras describing the operation.
 */
class ZoyaAccessibilityService : AccessibilityService() {

    companion object {
        const val ACTION_COMMAND = "com.zoya.app.ACCESSIBILITY_COMMAND"
        const val EXTRA_OP = "op"           // "autofill" | "back" | "home" | "recents" | "read_focused"
        const val EXTRA_FIELDS = "fields"   // JSON string map: label -> value
        const val EXTRA_TEXT = "text"

        @Volatile var instance: ZoyaAccessibilityService? = null
            private set
    }

    private val commandReceiver = object : android.content.BroadcastReceiver() {
        override fun onReceive(ctx: Context, intent: Intent) {
            when (intent.getStringExtra(EXTRA_OP)) {
                "autofill" -> handleAutofill(intent.getStringExtra(EXTRA_FIELDS).orEmpty())
                "back" -> performGlobalAction(GLOBAL_ACTION_BACK)
                "home" -> performGlobalAction(GLOBAL_ACTION_HOME)
                "recents" -> performGlobalAction(GLOBAL_ACTION_RECENTS)
                "notifications" -> performGlobalAction(GLOBAL_ACTION_NOTIFICATIONS)
                "quick_settings" -> performGlobalAction(GLOBAL_ACTION_QUICK_SETTINGS)
                "read_focused" -> readFocused()
            }
        }
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        LocalBroadcastManager.getInstance(this)
            .registerReceiver(commandReceiver, android.content.IntentFilter(ACTION_COMMAND))
    }

    override fun onDestroy() {
        try {
            LocalBroadcastManager.getInstance(this).unregisterReceiver(commandReceiver)
        } catch (_: Exception) {}
        if (instance === this) instance = null
        super.onDestroy()
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) { /* passive */ }
    override fun onInterrupt() {}

    /** Parse a JSON fields map and fill any editable fields we can match. */
    private fun handleAutofill(fieldsJson: String) {
        val root = rootInActiveWindow ?: return
        val map = parseFieldsJson(fieldsJson)
        if (map.isEmpty()) return

        fun walk(node: AccessibilityNodeInfo?) {
            if (node == null) return
            if (node.isEditable) {
                val hints = listOfNotNull(
                    node.hintText?.toString(),
                    node.contentDescription?.toString(),
                    node.viewIdResourceName,
                    node.text?.toString()
                ).joinToString(" ").lowercase()
                for ((key, value) in map) {
                    if (hints.contains(key.lowercase())) {
                        setText(node, value)
                        break
                    }
                }
            }
            for (i in 0 until node.childCount) walk(node.getChild(i))
        }
        walk(root)
    }

    private fun setText(node: AccessibilityNodeInfo, value: String) {
        val args = Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, value)
        }
        node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
    }

    private fun readFocused() {
        val node = findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
            ?: findFocus(AccessibilityNodeInfo.FOCUS_ACCESSIBILITY)
            ?: return
        val text = node.text?.toString() ?: node.contentDescription?.toString() ?: return
        val out = Intent("com.zoya.app.READ_FOCUSED_RESULT").putExtra(EXTRA_TEXT, text)
        LocalBroadcastManager.getInstance(this).sendBroadcast(out)
    }

    private fun parseFieldsJson(json: String): Map<String, String> {
        if (json.isBlank()) return emptyMap()
        return try {
            val obj = org.json.JSONObject(json)
            val out = HashMap<String, String>()
            val keys = obj.keys()
            while (keys.hasNext()) {
                val k = keys.next()
                out[k] = obj.optString(k, "")
            }
            out
        } catch (_: Exception) { emptyMap() }
    }
}
