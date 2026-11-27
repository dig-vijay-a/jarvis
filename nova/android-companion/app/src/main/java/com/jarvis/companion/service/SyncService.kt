package com.jarvis.companion.service

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Environment
import android.os.StatFs
import androidx.work.*
import com.jarvis.companion.network.HealthReportRequest
import com.jarvis.companion.network.HeartbeatRequest
import com.jarvis.companion.network.JarvisApiClient
import com.jarvis.companion.network.SyncPushRequest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.concurrent.TimeUnit

class SyncWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val apiClient = JarvisApiClient(applicationContext)
        val deviceId = apiClient.getDeviceId() ?: return@withContext Result.failure()

        try {
            // 1. Send Heartbeat
            apiClient.api.sendHeartbeat(HeartbeatRequest(deviceId))

            // 2. Report Device Health
            val battery = getBatteryPercentage()
            val storageMb = getAvailableStorageMb()
            apiClient.api.reportHealth(
                deviceId,
                HealthReportRequest(
                    battery_level = battery,
                    storage_available_mb = storageMb,
                    cpu_load_percent = 25,
                    network_type = "WIFI"
                )
            )

            // 3. Pull Sync Delta
            val syncResponse = apiClient.api.pullSync(deviceId)
            if (syncResponse.isSuccessful) {
                val payload = syncResponse.body()
                val notifications = payload?.getAsJsonArray("notifications")
                if (notifications != null && notifications.size() > 0) {
                    val notifService = NotificationService(applicationContext)
                    for (item in notifications) {
                        val obj = item.asJsonObject
                        val title = obj.get("title")?.asString ?: "JARVIS Alert"
                        val msg = obj.get("message")?.asString ?: ""
                        val type = obj.get("type")?.asString ?: "INFO"
                        notifService.showNotification(title, msg, type)
                    }
                }
            }
            Result.success()
        } catch (e: Exception) {
            Result.retry()
        }
    }

    private fun getBatteryPercentage(): Int {
        val intent = applicationContext.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val level = intent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = intent?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        return if (level >= 0 && scale > 0) (level * 100) / scale else 100
    }

    private fun getAvailableStorageMb(): Int {
        val stat = StatFs(Environment.getDataDirectory().path)
        return ((stat.availableBlocksLong * stat.blockSizeLong) / (1024 * 1024)).toInt()
    }
}

object SyncScheduler {
    private const val WORK_NAME = "jarvis_periodic_sync"

    fun schedulePeriodicSync(context: Context) {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val workRequest = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES)
            .setConstraints(constraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            workRequest
        )
    }

    fun triggerImmediateSync(context: Context) {
        val request = OneTimeWorkRequestBuilder<SyncWorker>().build()
        WorkManager.getInstance(context).enqueue(request)
    }
}
