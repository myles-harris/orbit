import ExpoModulesCore
import ActivityKit

public class CallLiveActivityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CallLiveActivity")

    AsyncFunction("startActivityAsync") { (callId: String, groupId: String, state: [String: Any]) -> String? in
      guard #available(iOS 16.2, *) else { return nil }
      guard ActivityAuthorizationInfo().areActivitiesEnabled else { return nil }
      let groupName = state["groupName"] as? String ?? ""
      let callType = state["callType"] as? String ?? "spontaneous"
      let endsAtMs = state["endsAt"] as? Double
      let contentState = CallActivityAttributes.CallState(
        groupName: groupName, callType: callType, endsAtMs: endsAtMs)
      let attributes = CallActivityAttributes(callId: callId, groupId: groupId)
      let staleDate = endsAtMs.map { Date(timeIntervalSince1970: $0 / 1000) }
      do {
        let content = ActivityContent(state: contentState, staleDate: staleDate)
        let activity = try Activity<CallActivityAttributes>.request(
          attributes: attributes, content: content, pushType: nil)
        return activity.id
      } catch {
        print("[CallLiveActivity] Failed to start activity: \(error)")
        return nil
      }
    }

    AsyncFunction("endActivityAsync") { (activityId: String) in
      guard #available(iOS 16.2, *) else { return }
      for activity in Activity<CallActivityAttributes>.activities where activity.id == activityId {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
    }

    /// End ALL call activities — safety net for stale activities after crashes.
    AsyncFunction("endAllActivitiesAsync") {
      guard #available(iOS 16.2, *) else { return }
      for activity in Activity<CallActivityAttributes>.activities {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
    }
  }
}
