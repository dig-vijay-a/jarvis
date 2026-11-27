package com.jarvis.companion.ui

import android.os.Bundle
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.jarvis.companion.network.JarvisApiClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MissionMonitorActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val apiClient = JarvisApiClient(this)
        val deviceId = apiClient.getDeviceId()

        val textView = TextView(this).apply {
            text = "Loading missions..."
            setPadding(48, 64, 48, 48)
        }
        setContentView(textView)

        if (deviceId != null) {
            lifecycleScope.launch {
                val summary = withContext(Dispatchers.IO) {
                    try {
                        val res = apiClient.api.pullSync(deviceId)
                        if (res.isSuccessful) {
                            val missions = res.body()?.getAsJsonArray("missions")
                            "Active synced missions: ${missions?.size() ?: 0}\n\n${missions ?: "[]"}"
                        } else {
                            "Sync failed: HTTP ${res.code()}"
                        }
                    } catch (e: Exception) {
                        "Network error: ${e.message}"
                    }
                }
                textView.text = summary
            }
        }
    }
}
