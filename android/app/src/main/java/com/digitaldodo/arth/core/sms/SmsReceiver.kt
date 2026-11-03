package com.digitaldodo.arth.core.sms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import com.digitaldodo.arth.core.database.ArthDatabase
import com.digitaldodo.arth.core.database.SmsSuggestionEntity
import com.digitaldodo.arth.core.model.SuggestionStatus
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class SmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
        if (messages.isNullOrEmpty()) return

        val fullBody = buildString {
            for (msg in messages) {
                append(msg.displayMessageBody)
            }
        }
        val sender = messages[0].displayOriginatingAddress ?: "Unknown"
        val timestamp = messages[0].timestampMillis

        // Parse entirely in memory
        val parsed = SmsParser.parse(sender, fullBody, timestamp) ?: return

        // Save candidate locally for user review
        val appContext = context.applicationContext
        val pendingResult = goAsync()

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val db = ArthDatabase.getInstance(appContext)
                val entity = SmsSuggestionEntity(
                    id = parsed.id,
                    sender = parsed.sender,
                    amountPaise = parsed.amountPaise,
                    type = parsed.type.name,
                    paymentMode = parsed.paymentMode.name,
                    merchant = parsed.merchant,
                    refNumber = parsed.refNumber,
                    smsTimestamp = parsed.timestamp,
                    confidence = parsed.confidence,
                    status = SuggestionStatus.PENDING.name
                )
                db.smsSuggestionDao().insert(entity)
            } finally {
                pendingResult.finish()
            }
        }
    }
}
