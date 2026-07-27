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
    val d = message.data
    if (d["type"] == "call_started") {
      val callId   = d["callId"]   ?: return
      val groupId  = d["groupId"]  ?: return
      val name     = d["groupName"] ?: "Orbit"
      val endsAtMs = d["endsAt"]?.let {
        runCatching { java.time.Instant.parse(it).toEpochMilli() }.getOrNull()
      }
      CallNotificationHelper.post(applicationContext, name, callId, groupId, endsAtMs)
    }
  }
}
