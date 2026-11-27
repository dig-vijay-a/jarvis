package com.jarvis.companion.ui

import android.content.Intent
import android.os.Bundle
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.jarvis.companion.network.JarvisApiClient
import com.jarvis.companion.service.DevicePairingService
import com.jarvis.companion.service.SyncScheduler

class MainActivity : AppCompatActivity() {
    private lateinit var apiClient: JarvisApiClient
    private lateinit var pairingService: DevicePairingService

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        apiClient = JarvisApiClient(this)
        pairingService = DevicePairingService(this, apiClient)

        if (!pairingService.isPaired()) {
            startActivity(Intent(this, PairingActivity::class.java))
            finish()
            return
        }

        SyncScheduler.schedulePeriodicSync(this)

        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 64, 48, 48)
        }

        val statusText = TextView(this).apply {
            text = "JARVIS Companion Connected\nDevice ID: ${apiClient.getDeviceId()}"
            textSize = 18f
        }
        val missionsBtn = Button(this).apply {
            text = "Monitor Missions"
            setOnClickListener { startActivity(Intent(this@MainActivity, MissionMonitorActivity::class.java)) }
        }
        val approvalsBtn = Button(this).apply {
            text = "Pending Approvals"
            setOnClickListener { startActivity(Intent(this@MainActivity, ApprovalActivity::class.java)) }
        }
        val syncBtn = Button(this).apply {
            text = "Sync Now"
            setOnClickListener { SyncScheduler.triggerImmediateSync(this@MainActivity) }
        }

        layout.addView(statusText)
        layout.addView(missionsBtn)
        layout.addView(approvalsBtn)
        layout.addView(syncBtn)
        setContentView(layout)
    }
}
