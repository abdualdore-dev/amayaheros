package com.amaya.app

import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.aggregate.AggregateMetric
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.FloorsClimbedRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateGroupByPeriodRequest
import androidx.health.connect.client.time.TimeRangeFilter
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONObject
import java.time.LocalDate
import java.time.Period

/** Steps, floors and distance from Health Connect (fed by Samsung Health, Google Fit and watches). */
object Fit {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val STEPS = HealthPermission.getReadPermission(StepsRecord::class)
    private val FLOORS = HealthPermission.getReadPermission(FloorsClimbedRecord::class)
    private val DIST = HealthPermission.getReadPermission(DistanceRecord::class)
    private val PERMS = setOf(STEPS, FLOORS, DIST)

    private fun available(ctx: Context): Boolean =
        Build.VERSION.SDK_INT >= 26 && HealthConnectClient.getSdkStatus(ctx) == HealthConnectClient.SDK_AVAILABLE

    private fun granted(ctx: Context): Set<String> = try {
        runBlocking { withTimeoutOrNull(3000) { HealthConnectClient.getOrCreate(ctx).permissionController.getGrantedPermissions() } } ?: emptySet()
    } catch (e: Throwable) { emptySet() }

    /** "ok" = steps can be read, "ask" = needs permission, "nohc" = Health Connect missing, "no" = phone too old */
    @JvmStatic
    fun status(ctx: Context): String {
        if (Build.VERSION.SDK_INT < 26) return "no"
        if (!available(ctx)) return "nohc"
        return if (granted(ctx).contains(STEPS)) "ok" else "ask"
    }

    @JvmStatic
    fun permissionIntent(ctx: Context): Intent? = if (available(ctx))
        PermissionController.createRequestPermissionResultContract().createIntent(ctx, PERMS) else null

    /** Reads today and the six days before it, then hands JSON to [done]. */
    @JvmStatic
    fun read(ctx: Context, loud: Boolean, done: java.util.function.Consumer<String>) {
        if (!available(ctx)) { done.accept("{\"err\":\"nohc\"}"); return }
        scope.launch {
            val out = JSONObject()
            try {
                val g = HealthConnectClient.getOrCreate(ctx).permissionController.getGrantedPermissions()
                if (!g.contains(STEPS)) { done.accept("{\"err\":\"denied\"}"); return@launch }
                val metrics = mutableSetOf<AggregateMetric<*>>(StepsRecord.COUNT_TOTAL)
                if (g.contains(FLOORS)) metrics.add(FloorsClimbedRecord.FLOORS_CLIMBED_TOTAL)
                if (g.contains(DIST)) metrics.add(DistanceRecord.DISTANCE_TOTAL)
                val today = LocalDate.now()
                val res = HealthConnectClient.getOrCreate(ctx).aggregateGroupByPeriod(
                    AggregateGroupByPeriodRequest(
                        metrics = metrics,
                        timeRangeFilter = TimeRangeFilter.between(today.minusDays(6).atStartOfDay(), today.plusDays(1).atStartOfDay()),
                        timeRangeSlicer = Period.ofDays(1)
                    )
                )
                val days = JSONObject()
                for (r in res) {
                    val d = JSONObject()
                    d.put("s", r.result[StepsRecord.COUNT_TOTAL] ?: 0L)
                    d.put("f", r.result[FloorsClimbedRecord.FLOORS_CLIMBED_TOTAL] ?: 0.0)
                    d.put("d", r.result[DistanceRecord.DISTANCE_TOTAL]?.inMeters ?: 0.0)
                    days.put(r.startTime.toLocalDate().toString(), d)
                }
                out.put("days", days)
                if (loud) out.put("loud", 1)
            } catch (e: Throwable) {
                out.put("err", "read")
            }
            done.accept(out.toString())
        }
    }
}
