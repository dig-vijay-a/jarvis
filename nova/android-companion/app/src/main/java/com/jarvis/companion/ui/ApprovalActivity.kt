package com.jarvis.companion.ui

import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.jarvis.companion.network.ApprovalDecisionRequest
import com.jarvis.companion.network.JarvisApiClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class ApprovalActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val apiClient = JarvisApiClient(this)
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 64, 48, 48)
        }

        val title = TextView(this).apply {
            text = "Mission Step Approval"
            textSize = 18f
        }
        val missionIdInput = EditText(this).apply { hint = "Mission ID" }
        val stepIdInput = EditText(this).apply { hint = "Step ID" }

        val approveBtn = Button(this).apply {
            text = "Approve Step"
            setOnClickListener { sendDecision(apiClient, missionIdInput.text.toString(), stepIdInput.text.toString(), "approved") }
        }
        val rejectBtn = Button(this).apply {
            text = "Reject Step"
            setOnClickListener { sendDecision(apiClient, missionIdInput.text.toString(), stepIdInput.text.toString(), "rejected") }
        }

        layout.addView(title)
        layout.addView(missionIdInput)
        layout.addView(stepIdInput)
        layout.addView(approveBtn)
        layout.addView(rejectBtn)
        setContentView(layout)
    }

    private fun sendDecision(apiClient: JarvisApiClient, missionId: String, stepId: String, decision: String) {
        val deviceId = apiClient.getDeviceId() ?: return
        val deviceToken = apiClient.getDeviceToken() ?: return
        lifecycleScope.launch {
            val resultText = withContext(Dispatchers.IO) {
                try {
                    val res = apiClient.api.decideApproval(
                        stepId,
                        ApprovalDecisionRequest(missionId, decision, deviceId, deviceToken)
                    )
                    if (res.isSuccessful) "Decision '$decision' recorded" else "Failed: HTTP ${res.code()}"
                } catch (e: Exception) {
                    "Error: ${e.message}"
                }
            }
            Toast.makeText(this@ApprovalActivity, resultText, Toast.LENGTH_SHORT).show()
        }
    }
}
