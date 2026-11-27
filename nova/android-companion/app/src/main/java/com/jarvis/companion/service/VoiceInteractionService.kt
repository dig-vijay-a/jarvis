package com.jarvis.companion.service

import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.speech.tts.TextToSpeech
import com.jarvis.companion.network.JarvisApiClient
import com.jarvis.companion.network.VoiceLockRequest
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.util.Locale

class VoiceInteractionService : Service(), TextToSpeech.OnInitListener {
    private var tts: TextToSpeech? = null
    private lateinit var apiClient: JarvisApiClient
    private val serviceScope = CoroutineScope(Dispatchers.IO)

    override fun onCreate() {
        super.onCreate()
        apiClient = JarvisApiClient(applicationContext)
        tts = TextToSpeech(this, this)
    }

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            tts?.language = Locale.US
        }
    }

    fun submitVoiceCommand(commandText: String, onResult: (Boolean) -> Unit) {
        val deviceId = apiClient.getDeviceId() ?: return onResult(false)
        serviceScope.launch {
            try {
                val res = apiClient.api.acquireVoiceLock(VoiceLockRequest(commandText, deviceId))
                val acquired = res.isSuccessful && (res.body()?.get("acquired")?.asBoolean == true)
                onResult(acquired)
            } catch (e: Exception) {
                onResult(false)
            }
        }
    }

    fun speak(text: String) {
        tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "jarvis_tts_${System.currentTimeMillis()}")
    }

    override fun onDestroy() {
        tts?.stop()
        tts?.shutdown()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
