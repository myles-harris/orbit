package expo.modules.callnotification

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class CallNotificationModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CallNotification")

    Function("postOngoingCall") { groupName: String, callId: String, groupId: String,
                                  endsAtMs: Long?, participantCount: Int?,
                                  ongoing: Boolean, timeoutAtMs: Long? ->
      val context = appContext.reactContext ?: return@Function null
      CallNotificationHelper.post(
        context, groupName, callId, groupId,
        endsAtMs, participantCount, ongoing, timeoutAtMs,
      )
      null
    }

    Function("cancelOngoingCall") {
      val context = appContext.reactContext ?: return@Function null
      CallNotificationHelper.cancel(context)
      null
    }
  }
}
