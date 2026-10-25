# ProGuard rules for Arth TWA
-keepattributes *Annotation*
-keepclassmembers class * {
    @org.chromium.base.annotations.CalledByNative <methods>;
}
