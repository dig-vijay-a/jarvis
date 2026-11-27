package com.jarvis.companion.ui

import android.content.Intent
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.jarvis.companion.network.JarvisApiClient
import com.jarvis.companion.service.DevicePairingService
import kotlinx.coroutines.launch

class PairingActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val apiClient = JarvisApiClient(this)
        val pairingService = DevicePairingService(this, apiClient)

        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 64, 48, 48)
        }
        val title = TextView(this).apply {
            text = "Pair with JARVIS OS 2.0"
            textSize = 20f
        }
        val codeInput = EditText(this).apply {
            hint = "6-digit Enrollment Code"
        }
        val tokenInput = EditText(this).apply {
            hint = "Enrollment Token (optional)"
        }
        val pairBtn = Button(this).apply {
            text = "Pair Device"
            setOnClickListener {
                val code = codeInput.text.toString()
                val token = tokenInput.text.toString()
                lifecycleScope.launch {
                    val res = pairingService.pairWithEnrollmentCode(code, token)
                    res.onSuccess {
                        Toast.makeText(this@PairingActivity, "Paired: ${it.first}", Toast.LENGTH_SHORT).show()
                        startActivity(Intent(this@PairingActivity, MainActivity::class.java))
                        finish()
                    }.onFailure { err ->
                        Toast.makeText(this@PairingActivity, "Error: ${err.message}", Toast.LENGTH_LONG).show()
                    }
                }
            }
        }

        layout.addView(title)
        layout.addView(codeInput)
        layout.addView(tokenInput)
        layout.addView(pairBtn)
        setContentView(layout)
    }
}
