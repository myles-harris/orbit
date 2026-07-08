package expo.modules.callnotification

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class CallNotificationModule : Module() {
  companion object {
    const val CHANNEL_ID = "call-ongoing"
    const val NOTIFICATION_ID = 42_001
  }

  override fun definition() = ModuleDefinition {
    Name("CallNotification")

    Function("postOngoingCall") { groupName: String, callId: String, groupId: String, endsAtMs: Double? ->
      val context = appContext.reactContext ?: return@Function
      ensureChannel(context)

      val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
        putExtra("type", "call_started")
        putExtra("callId", callId)
        putExtra("groupId", groupId)
      }
      val contentIntent = PendingIntent.getActivity(
        context, 0, launchIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
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
        // Scheduled call: live countdown rendered by the OS chronometer.
        builder
          .setContentText("Tap to join")
          .setWhen(endsAtMs.toLong())
          .setUsesChronometer(true)
          .setChronometerCountDown(true)  // API 24+; minSdk >= 24 on Expo SDK 54
          .setShowWhen(true)
      } else {
        builder.setContentText("Active Call • Tap to join")
      }

      NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, builder.build())
    }

    Function("cancelOngoingCall") {
      val context = appContext.reactContext ?: return@Function
      NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
    }
  }

  private fun ensureChannel(context: Context) {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(CHANNEL_ID) == null) {
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "Ongoing Calls", NotificationManager.IMPORTANCE_HIGH)
      )
    }
  }
}
