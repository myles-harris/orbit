package expo.modules.callnotification

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class CallNotificationModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CallNotification")

    Function("postOngoingCall") { groupName: String, callId: String, groupId: String, endsAtMs: Double? ->
      val context = appContext.reactContext ?: return@Function
      CallNotificationHelper.post(context, groupName, callId, groupId, endsAtMs?.toLong())
    }

    Function("cancelOngoingCall") {
      val context = appContext.reactContext ?: return@Function
      CallNotificationHelper.cancel(context)
    }
  }
}
