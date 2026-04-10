# Add project specific ProGuard rules here.
-keep class com.zoya.app.** { *; }
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
