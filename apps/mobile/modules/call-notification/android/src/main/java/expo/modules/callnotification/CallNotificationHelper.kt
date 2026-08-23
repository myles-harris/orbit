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

  // [fix 11] The client cannot know the participant count. startCallPresence fires on
  // notification tap, cold start, and foreground receive, any of which can happen after
  // the server has already pushed a count. If the client asserted 0 it would silently
  // overwrite the server's value on this same NOTIFICATION_ID. Callers that don't know
  // the count pass null and we reuse the last one the server sent.
  //
  // [v2] Scoped by callId. One NOTIFICATION_ID is reused across calls, so without this
  // a count from a previous call leaks onto the next call's card whenever the previous
  // one was not cancelled first (crash, force-stop, preemption).
  @Volatile private var lastKnownCount: Int = 0
  @Volatile private var lastCountCallId: String? = null

  // [divergence from brief] Stage 2's iOS Live Activity gates its count line on
  // participantCount != nil, so nothing renders before stage 8 starts sending pushes.
  // Android's notification text has no such nil state to gate on — count defaults to
  // 0 — so without this it would show "0 in the call" on every call from this stage's
  // release until stage 8 ships. Track whether a real count has ever been received and
  // omit the count phrase entirely until then, to match iOS's behaviour.
  @Volatile private var hasKnownCount: Boolean = false

  fun post(
    context: Context,
    groupName: String,
    callId: String,
    groupId: String,
    endsAtMs: Long?,
    participantCount: Int? = null,
    ongoing: Boolean = true,
    timeoutAtMs: Long? = null,
  ) {
    ensureChannel(context)

    if (callId != lastCountCallId) {
      lastKnownCount = 0
      lastCountCallId = callId
      hasKnownCount = false
    }
    val count = participantCount ?: lastKnownCount
    if (participantCount != null) {
      lastKnownCount = participantCount
      hasKnownCount = true
    }

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
      .setOngoing(ongoing)
      .setOnlyAlertOnce(true)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setPriority(NotificationCompat.PRIORITY_HIGH)

    val countText = if (!hasKnownCount) null
      else if (count == 1) "1 in the call" else "$count in the call"
    if (endsAtMs != null) {
      builder
        .setContentText(if (countText != null) "$countText · Tap to join" else "Tap to join")
        .setWhen(endsAtMs)
        .setUsesChronometer(true)
        .setChronometerCountDown(true)
        .setShowWhen(true)
    } else {
      builder.setContentText(if (countText != null) "$countText · Tap to join" else "Active call · Tap to join")
    }

    // Expiry: ends_at for scheduled, started_at + 1 h for spontaneous. Spontaneous
    // calls previously passed no endsAtMs and so never timed out at all.
    val timeoutAnchor = timeoutAtMs ?: endsAtMs
    if (timeoutAnchor != null) {
      builder.setTimeoutAfter((timeoutAnchor - System.currentTimeMillis()).coerceAtLeast(0))
    }

    NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, builder.build())
  }

  fun cancel(context: Context) {
    NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
    lastKnownCount = 0
    lastCountCallId = null
    hasKnownCount = false
  }

  private fun ensureChannel(context: Context) {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(CHANNEL_ID) == null) {
      val channel = NotificationChannel(CHANNEL_ID, "Ongoing Calls", NotificationManager.IMPORTANCE_HIGH).apply {
        // Must match App.tsx's setNotificationChannelAsync('call-ongoing', …). Android locks
        // sound and importance at creation, so if these two definitions ever diverge AND this
        // path can run before the JS one, the divergence becomes permanent for that install.
        // Today JS always runs first; this is defensive, not a live fix.
        setSound(null, null)
        enableVibration(false)
      }
      manager.createNotificationChannel(channel)
    }
  }
}
