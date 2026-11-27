package com.digitaldodo.arth.core.sms

import android.content.Context
import android.content.pm.PackageManager
import android.provider.Telephony

data class FinancialNotificationSource(
    val packageName: String,
    val displayName: String,
    val category: SourceCategory,
    val bankOrProviderHint: String
)

enum class SourceCategory(val label: String) {
    SMS_APP("Default Messages App"),
    UPI_PAYMENT("UPI & Payment Apps"),
    BANKING_APP("Banking Apps")
}

data class DiscoveredNotificationSource(
    val source: FinancialNotificationSource,
    val isInstalled: Boolean,
    val isEnabled: Boolean
)

/**
 * Curated catalog of supported financial and messaging apps for opt-in notification capture.
 * Used with explicit manifest <queries> entries without broad QUERY_ALL_PACKAGES access.
 */
object SupportedNotificationSources {
    val curatedSources: List<FinancialNotificationSource> = listOf(
        FinancialNotificationSource(
            packageName = "com.google.android.apps.nbu.paisa.user",
            displayName = "Google Pay",
            category = SourceCategory.UPI_PAYMENT,
            bankOrProviderHint = "Google Pay"
        ),
        FinancialNotificationSource(
            packageName = "com.phonepe.app",
            displayName = "PhonePe",
            category = SourceCategory.UPI_PAYMENT,
            bankOrProviderHint = "PhonePe"
        ),
        FinancialNotificationSource(
            packageName = "net.one97.paytm",
            displayName = "Paytm",
            category = SourceCategory.UPI_PAYMENT,
            bankOrProviderHint = "Paytm"
        ),
        FinancialNotificationSource(
            packageName = "com.dreamplug.androidapp",
            displayName = "CRED",
            category = SourceCategory.UPI_PAYMENT,
            bankOrProviderHint = "CRED"
        ),
        FinancialNotificationSource(
            packageName = "in.org.npci.upiapp",
            displayName = "BHIM",
            category = SourceCategory.UPI_PAYMENT,
            bankOrProviderHint = "BHIM"
        ),
        FinancialNotificationSource(
            packageName = "in.amazon.mShop.android.shopping",
            displayName = "Amazon Pay",
            category = SourceCategory.UPI_PAYMENT,
            bankOrProviderHint = "Amazon Pay"
        ),
        FinancialNotificationSource(
            packageName = "com.snapwork.hdfc",
            displayName = "HDFC Bank",
            category = SourceCategory.BANKING_APP,
            bankOrProviderHint = "HDFC Bank"
        ),
        FinancialNotificationSource(
            packageName = "com.sbi.lotusintouch",
            displayName = "SBI YONO",
            category = SourceCategory.BANKING_APP,
            bankOrProviderHint = "State Bank of India"
        ),
        FinancialNotificationSource(
            packageName = "com.csam.icici.bank.imobile",
            displayName = "ICICI iMobile",
            category = SourceCategory.BANKING_APP,
            bankOrProviderHint = "ICICI Bank"
        ),
        FinancialNotificationSource(
            packageName = "com.axis.mobile",
            displayName = "Axis Mobile",
            category = SourceCategory.BANKING_APP,
            bankOrProviderHint = "Axis Bank"
        ),
        FinancialNotificationSource(
            packageName = "com.msf.kbank.mobile",
            displayName = "Kotak Mobile Banking",
            category = SourceCategory.BANKING_APP,
            bankOrProviderHint = "Kotak Mahindra Bank"
        ),
        FinancialNotificationSource(
            packageName = "com.idfcfirstbank.optimus",
            displayName = "IDFC FIRST Bank",
            category = SourceCategory.BANKING_APP,
            bankOrProviderHint = "IDFC FIRST Bank"
        )
    )

    val defaultAllowedPackages: Set<String> = curatedSources.map { it.packageName }.toSet()

    fun findByPackage(packageName: String?): FinancialNotificationSource? {
        if (packageName.isNullOrBlank()) return null
        return curatedSources.firstOrNull { it.packageName == packageName }
    }

    fun isPackageInstalled(context: Context, packageName: String): Boolean {
        return runCatching {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
                context.packageManager.getPackageInfo(
                    packageName,
                    PackageManager.PackageInfoFlags.of(0)
                )
            } else {
                @Suppress("DEPRECATION")
                context.packageManager.getPackageInfo(packageName, 0)
            }
            true
        }.getOrDefault(false)
    }

    fun inspectSources(
        context: Context,
        enabledPackages: Set<String>
    ): List<DiscoveredNotificationSource> {
        return curatedSources.map { src ->
            DiscoveredNotificationSource(
                source = src,
                isInstalled = isPackageInstalled(context, src.packageName),
                isEnabled = src.packageName in enabledPackages
            )
        }
    }

    fun resolveSourceLabel(
        packageName: String?,
        defaultSmsPackage: String?,
        defaultSmsLabel: String? = null
    ): String {
        if (!packageName.isNullOrBlank() && packageName == defaultSmsPackage) {
            return if (!defaultSmsLabel.isNullOrBlank()) "SMS · $defaultSmsLabel" else "SMS notification"
        }
        return findByPackage(packageName)?.let { "App · ${it.displayName}" } ?: "Notification"
    }
}
