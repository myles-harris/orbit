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
  // the server has already pushed a count. If the client asserted a number it would
  // silently overwrite the server's value on this same NOTIFICATION_ID. Callers that
  // don't know the count pass null and we reuse the last one the server sent.
  //
  // NULLABLE, not Int = 0. Three distinct states have to stay distinguishable:
  //   null -> no count has ever been received; render no count phrase at all
  //   0    -> the server said zero (everyone left); render "0 in the call"
  //   n    -> the server said n
  // An Int sentinel of 0 collapses the first two. That is wrong from stage 8 onward
  // (a legitimately empty call must read "0 in the call"), and before stage 8 it makes
  // every Android notification read "0 in the call" for the entire window between this
  // stage shipping and the fan-out deploying. iOS avoids that by gating its count line
  // on `participantCount != nil`; this is the Android equivalent.
  //
  // [v2] Scoped by callId. One NOTIFICATION_ID is reused across calls, so without this
  // a count from a previous call leaks onto the next call's card whenever the previous
  // one was not cancelled first (crash, force-stop, preemption).
  //
  // NOTE: this is process state, and stage 0b confirmed FCM cold-starts the process to
  // deliver. On a cold start it is null, so a card posted before any presence push
  // renders no count phrase, which is correct. Verify on device (L7).
  @Volatile private var lastKnownCount: Int? = null
  @Volatile private var lastCountCallId: String? = null

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
      lastKnownCount = null
      lastCountCallId = callId
    }
    val count = participantCount ?: lastKnownCount
    if (participantCount != null) lastKnownCount = participantCount

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

    // Null count means no presence push has arrived for this call yet, so the phrase
    // is omitted entirely rather than asserting a number we do not have.
    val countText = count?.let { if (it == 1) "1 in the call" else "$it in the call" }

    if (endsAtMs != null) {
      builder
        .setContentText(countText?.let { "$it · Tap to join" } ?: "Tap to join")
        .setWhen(endsAtMs)
        .setUsesChronometer(true)
        .setChronometerCountDown(true)
        .setShowWhen(true)
    } else {
      builder.setContentText(countText?.let { "Active call · $it" } ?: "Active call")
    }

    // Expiry: ends_at for scheduled, started_at + 1 h for spontaneous. Spontaneous
    // calls previously passed no endsAtMs and so never timed out at all.
    val timeoutAnchor = timeoutAtMs ?: endsAtMs
    if (timeoutAnchor != null) {
      builder.setTimeoutAfter((timeoutAnchor - System.currentTimeMillis()).coerceAtLeast(0))
    }

    NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, builder.build())
  }

  // callId null means an unconditional local cancel — the JS bridge's
  // cancelOngoingCall(), for the user explicitly leaving/ending a call on this
  // device. Non-null scopes it to a push-driven call_ended event, matching post()'s
  // own lastCountCallId check: NOTIFICATION_ID is shared across every call this
  // device might be on, so an end-of-call push for a call OTHER than the one
  // currently displayed must not dismiss it.
  fun cancel(context: Context, callId: String? = null) {
    if (callId != null && callId != lastCountCallId) return
    NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
    // Null, not 0, or the conflation returns on the second call in a session.
    lastKnownCount = null
    lastCountCallId = null
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
