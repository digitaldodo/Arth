package com.digitaldodo.arth

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import org.json.JSONObject

class ConfirmedTransactionSyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        if (!NativeAuth.signedIn(applicationContext)) return Result.failure()
        val base = BuildConfig.API_URL.trimEnd('/')
        if (base.isBlank()) return Result.failure()
        return try {
            val ownerId = NativeAuth.userId(applicationContext) ?: return Result.failure()
            val token = NativeAuth.freshAccess(applicationContext)
            if (NativeAuth.userId(applicationContext) != ownerId) return Result.retry()
            CandidateStore(applicationContext).queued().forEach { (id, payload) ->
                if (NativeAuth.userId(applicationContext) != ownerId) return Result.retry()
                NativeAuth.request("$base/api/native/transactions", BuildConfig.SUPABASE_ANON_KEY, token, JSONObject(payload))
                CandidateStore(applicationContext).complete(id)
            }
            Result.success()
        } catch (_: Exception) {
            Result.retry()
        }
    }
}
