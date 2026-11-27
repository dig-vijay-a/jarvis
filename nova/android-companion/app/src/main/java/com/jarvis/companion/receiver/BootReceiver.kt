package com.jarvis.companion.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.jarvis.companion.network.JarvisApiClient
import com.jarvis.companion.service.SyncScheduler

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED || intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
            val client = JarvisApiClient(context)
            if (!client.getDeviceId().isNullOrBlank()) {
                SyncScheduler.schedulePeriodicSync(context)
                SyncScheduler.triggerImmediateSync(context)
            }
        }
    }
}
