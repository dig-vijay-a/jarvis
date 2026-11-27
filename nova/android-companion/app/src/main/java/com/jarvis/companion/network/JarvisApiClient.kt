package com.jarvis.companion.network

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.google.gson.Gson
import com.google.gson.JsonObject
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.*
import java.util.UUID
import java.util.concurrent.TimeUnit
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

data class PairRequest(
    val enrollment_code: String,
    val token: String = "",
    val device_name: String,
    val device_type: String = "android",
    val capabilities: List<String> = listOf("chat", "voice", "missions", "approvals", "telemetry", "notifications")
)

data class PairResponse(
    val success: Boolean,
    val device_id: String?,
    val device_token: String?,
    val permissions: List<String>?,
    val error: String?
)

data class HeartbeatRequest(
    val device_id: String
)

data class HealthReportRequest(
    val battery_level: Int,
    val storage_available_mb: Int,
    val cpu_load_percent: Int,
    val network_type: String
)

data class ApprovalDecisionRequest(
    val mission_id: String,
    val decision: String,
    val device_id: String,
    val device_token: String
)

data class VoiceLockRequest(
    val command_text: String,
    val device_id: String
)

data class SyncPushRequest(
    val device_id: String,
    val operations: List<Map<String, Any>>
)

interface JarvisApiService {
    @POST("api/ambient/devices/pair")
    suspend fun pairDevice(@Body request: PairRequest): Response<PairResponse>

    @GET("api/ambient/sync")
    suspend fun pullSync(
        @Query("device_id") deviceId: String,
        @Query("since") since: String? = null
    ): Response<JsonObject>

    @POST("api/ambient/sync")
    suspend fun pushSync(@Body request: SyncPushRequest): Response<JsonObject>

    @POST("api/ambient/connectivity/heartbeat")
    suspend fun sendHeartbeat(@Body request: HeartbeatRequest): Response<JsonObject>

    @POST("api/ambient/devices/{id}/health")
    suspend fun reportHealth(
        @Path("id") deviceId: String,
        @Body request: HealthReportRequest
    ): Response<JsonObject>

    @POST("api/ambient/approvals/{stepId}/decide")
    suspend fun decideApproval(
        @Path("stepId") stepId: String,
        @Body request: ApprovalDecisionRequest
    ): Response<JsonObject>

    @POST("api/ambient/voice/lock")
    suspend fun acquireVoiceLock(@Body request: VoiceLockRequest): Response<JsonObject>

    @GET("api/ambient/notifications")
    suspend fun getNotifications(
        @Query("device_id") deviceId: String
    ): Response<JsonObject>
}

class JarvisApiClient(context: Context, baseUrl: String = "http://10.0.2.2:5000/") {
    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val prefs = EncryptedSharedPreferences.create(
        context,
        "jarvis_secure_prefs",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    fun saveCredentials(deviceId: String, deviceToken: String) {
        prefs.edit()
            .putString("device_id", deviceId)
            .putString("device_token", deviceToken)
            .apply()
    }

    fun getDeviceId(): String? = prefs.getString("device_id", null)
    fun getDeviceToken(): String? = prefs.getString("device_token", null)
    fun clearCredentials() {
        prefs.edit().clear().apply()
    }

    private fun computeHmacSha256(payload: String, secret: String): String {
        val mac = Mac.getInstance("HmacSHA256")
        val keySpec = SecretKeySpec(secret.toByteArray(Charsets.UTF_8), "HmacSHA256")
        mac.init(keySpec)
        return mac.doFinal(payload.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
    }

    private val authInterceptor = Interceptor { chain ->
        val original: Request = chain.request()
        val builder = original.newBuilder()
        val token = getDeviceToken()
        val nonce = UUID.randomUUID().toString()
        val timestamp = System.currentTimeMillis().toString()

        if (!token.isNullOrBlank()) {
            builder.header("Authorization", "Bearer $token")
            val signaturePayload = "${original.method}:${original.url.encodedPath}:$timestamp:$nonce"
            builder.header("X-Jarvis-Signature", computeHmacSha256(signaturePayload, token))
        }
        builder.header("X-Jarvis-Nonce", nonce)
        builder.header("X-Jarvis-Timestamp", timestamp)
        chain.proceed(builder.build())
    }

    private val okHttpClient = OkHttpClient.Builder()
        .addInterceptor(authInterceptor)
        .addInterceptor(HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BASIC
        })
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    val api: JarvisApiService = Retrofit.Builder()
        .baseUrl(baseUrl)
        .client(okHttpClient)
        .addConverterFactory(GsonConverterFactory.create(Gson()))
        .build()
        .create(JarvisApiService::class.java)
}
