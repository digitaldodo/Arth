# SpendSense Native Android App — Testing & Quality Assurance Guide

This document details the test suites, APK validation procedures, ADB commands, and verification matrix for the native SpendSense Android application.

---

## 1. Automated Unit Test Matrix

The Android project includes unit test coverage across accounting math, Money formatting, regex transaction parsing, and bank SMS parsing.

### Run Unit Tests via Gradle:
```powershell
cd android
# Test Local variant
.\gradlew.bat :app:testLocalDebugUnitTest

# Test Play variant
.\gradlew.bat :app:testPlayDebugUnitTest

# Test All Variants in parallel
.\gradlew.bat test
```

### Coverage Breakdown:
| Test Class | Focus Area | Status |
|---|---|---|
| `MoneyTest` | Integer paise conversion, formatting (INR formatting, commas, decimals), and arithmetic safety | **Passed (4/4)** |
| `FinancialAccountingTest` | Balance movements, settlement math, person lend/borrow adjustments | **Passed (3/3)** |
| `TransactionMessageParserTest` | Multi-format Indian bank regex parser (HDFC, SBI, Axis, ICICI, Kotak, UPI) | **Passed (5/5)** |
| `SmsParserTest` | Full SMS string parsing, debit/credit classification, merchant extraction, OTP rejection | **Passed (7/7)** |
| **Total Test Count** | Across both flavor targets (38 executions total) | **100% Passed** |

---

## 2. Merged Manifest & Permission Verification

To confirm that variants have strictly segregated permissions:

### Check `localDebug` Merged Manifest (Must have 0 SMS permissions):
```powershell
Select-String -Path android/app/build/intermediates/merged_manifests/localDebug/processLocalDebugManifest/AndroidManifest.xml -Pattern "SMS|sms"
```
*Expected Result: Zero matches.*

### Check `playDebug` Merged Manifest (Must include SMS permissions and receiver):
```powershell
Select-String -Path android/app/build/intermediates/merged_manifests/playDebug/processPlayDebugManifest/AndroidManifest.xml -Pattern "RECEIVE_SMS|READ_SMS|SmsReceiver"
```
*Expected Result: Matches for `RECEIVE_SMS`, `READ_SMS`, and `com.digitaldodo.arth.core.sms.SmsReceiver` with `BROADCAST_SMS` permission.*

---

## 3. Physical Device Testing Guide

### A. Check Connected Devices
```powershell
& "C:\Users\Ansh\AppData\Local\Android\Sdk\platform-tools\adb.exe" devices
```

### B. Install Local Debug Variant (Recommended for sideloading)
```powershell
& "C:\Users\Ansh\AppData\Local\Android\Sdk\platform-tools\adb.exe" install -r android/app/build/outputs/apk/local/debug/app-local-debug.apk
```

### C. Launch MainActivity
```powershell
& "C:\Users\Ansh\AppData\Local\Android\Sdk\platform-tools\adb.exe" shell am start -n com.digitaldodo.arth.local.debug/com.digitaldodo.arth.MainActivity
```

### D. Verify Clean Startup via Logcat
```powershell
& "C:\Users\Ansh\AppData\Local\Android\Sdk\platform-tools\adb.exe" logcat -c
& "C:\Users\Ansh\AppData\Local\Android\Sdk\platform-tools\adb.exe" logcat -s Arth:V AndroidRuntime:E
```

### E. Simulate SMS on an Emulator (Play Build)
To test SMS detection on an Android emulator:
```powershell
& "C:\Users\Ansh\AppData\Local\Android\Sdk\platform-tools\adb.exe" emu sms send "VK-HDFCBK" "Sent Rs 850.00 from HDFC Bank A/c xx1234 to Swiggy on 03-Nov-26 via UPI. Ref 430829182391"
```
1. Verify system notification triggers.
2. Open SpendSense and verify the transaction appears in the **Pending SMS Reviews** banner.
3. Confirm the transaction, assign "Food", and check that it reflects in the Dashboard balances.
