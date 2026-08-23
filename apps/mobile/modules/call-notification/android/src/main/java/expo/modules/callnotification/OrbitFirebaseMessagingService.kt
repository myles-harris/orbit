package expo.modules.callnotification

import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.ExpoFirebaseMessagingService

/**
 * Subclass of ExpoFirebaseMessagingService so expo-notifications keeps working normally.
 * Handles `call_started` data messages when the app is backgrounded or killed.
 * Scheduled calls auto-cancel via setTimeoutAfter; spontaneous calls clean up on next app open.
 *
 * Registered by withCallNotificationService.js in place of Expo's own registration,
 * so only one service owns the MESSAGING_EVENT intent filter.
 */
class OrbitFirebaseMessagingService : ExpoFirebaseMessagingService() {
  override fun onMessageReceived(message: RemoteMessage) {
    super.onMessageReceived(message) // keeps expo-notifications delivery working

    // Expo nests the caller payload as a JSON string under "body". Verified on device,
    // stage 0b. Reading message.data["type"] directly never matches.
    val d = message.data["body"]?.let {
      runCatching { org.json.JSONObject(it) }.getOrNull()
    } ?: return

    when (d.optString("type")) {
      "call_started" -> {
        val callId   = d.optString("callId").ifEmpty { return }
        val groupId  = d.optString("groupId").ifEmpty { return }
        val name     = d.optString("groupName").ifEmpty { "Orbit" }
        val endsAtMs = d.optString("endsAt").takeIf { it.isNotEmpty() }?.let {
          runCatching { java.time.Instant.parse(it).toEpochMilli() }.getOrNull()
        }
        CallNotificationHelper.post(
          applicationContext, name, callId, groupId,
          endsAtMs, null, true, d.optString("timeoutAtMs").toLongOrNull(),
        )
      }
      "call_presence" -> {
        val callId  = d.optString("callId").ifEmpty { return }
        val groupId = d.optString("groupId").ifEmpty { return }
        val name    = d.optString("groupName").ifEmpty { "Orbit" }
        val count     = d.optString("count").toIntOrNull()
        val ongoing   = d.optString("ongoing") == "true"
        val endsAtMs  = d.optString("endsAtMs").toLongOrNull()
        val timeoutAt = d.optString("timeoutAtMs").toLongOrNull()
        CallNotificationHelper.post(
          applicationContext, name, callId, groupId,
          endsAtMs, count, ongoing, timeoutAt,
        )
      }
    }
  }
}
