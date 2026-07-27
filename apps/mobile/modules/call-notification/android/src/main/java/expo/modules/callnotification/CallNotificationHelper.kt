package expo.modules.callnotification

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

object CallNotificationHelper {
  const val CHANNEL_ID = "call-ongoing"
  const val NOTIFICATION_ID = 42_001

  fun post(context: Context, groupName: String, callId: String, groupId: String, endsAtMs: Long?) {
    ensureChannel(context)

    val launchIntent = context.packageManager
      .getLaunchIntentForPackage(context.packageName)?.apply {
        putExtra("type", "call_started")
        putExtra("callId", callId)
        putExtra("groupId", groupId)
      }
    val contentIntent = PendingIntent.getActivity(
      context, 0, launchIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    val builder = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(context.applicationInfo.icon)
      .setContentTitle("$groupName is calling!")
      .setContentIntent(contentIntent)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setPriority(NotificationCompat.PRIORITY_HIGH)

    if (endsAtMs != null) {
      val timeoutMs = endsAtMs - System.currentTimeMillis()
      builder
        .setContentText("Tap to join")
        .setWhen(endsAtMs)
        .setUsesChronometer(true)
        .setChronometerCountDown(true)
        .setShowWhen(true)
        .setTimeoutAfter(timeoutMs.coerceAtLeast(0))
    } else {
      builder.setContentText("Active Call • Tap to join")
    }

    NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, builder.build())
  }

  fun cancel(context: Context) {
    NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
  }

  private fun ensureChannel(context: Context) {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(CHANNEL_ID) == null) {
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "Ongoing Calls", NotificationManager.IMPORTANCE_HIGH),
      )
    }
  }
}
