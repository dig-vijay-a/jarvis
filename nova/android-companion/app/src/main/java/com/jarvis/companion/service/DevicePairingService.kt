package com.jarvis.companion.service

import android.content.Context
import android.os.Build
import com.jarvis.companion.network.JarvisApiClient
import com.jarvis.companion.network.PairRequest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class DevicePairingService(private val context: Context, private val apiClient: JarvisApiClient) {

    suspend fun pairWithEnrollmentCode(
        enrollmentCode: String,
        token: String = "",
        deviceName: String = "${Build.MANUFACTURER} ${Build.MODEL}"
    ): Result<Pair<String, String>> = withContext(Dispatchers.IO) {
        try {
            val response = apiClient.api.pairDevice(
                PairRequest(
                    enrollment_code = enrollmentCode.trim(),
                    token = token.trim(),
                    device_name = deviceName,
                    device_type = "android"
                )
            )
            val body = response.body()
            if (response.isSuccessful && body != null && body.success && body.device_id != null && body.device_token != null) {
                apiClient.saveCredentials(body.device_id, body.device_token)
                Result.success(Pair(body.device_id, body.device_token))
            } else {
                val err = body?.error ?: "Pairing failed with HTTP ${response.code()}"
                Result.failure(Exception(err))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    fun isPaired(): Boolean = !apiClient.getDeviceId().isNullOrBlank() && !apiClient.getDeviceToken().isNullOrBlank()
}
