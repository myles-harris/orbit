import ExpoModulesCore
import ActivityKit

/// Expo native module that starts, updates, and ends the call Live Activity.
/// Add this file to the main app target in Xcode (not the widget extension target).
public class CallLiveActivityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CallLiveActivity")

    /// Start a Live Activity for an incoming/active call.
    /// Returns the activity ID string, or null if Live Activities are unavailable.
    AsyncFunction("startActivityAsync") { (callId: String, groupId: String, state: [String: Any]) -> String? in
      guard #available(iOS 16.2, *) else { return nil }
      guard ActivityAuthorizationInfo().areActivitiesEnabled else {
        return nil
      }
      let contentState = Self.contentState(from: state)
      let attributes = CallActivityAttributes(callId: callId, groupId: groupId)
      do {
        let content = ActivityContent(state: contentState, staleDate: contentState.endsAt)
        let activity = try Activity<CallActivityAttributes>.request(
          attributes: attributes,
          content: content,
          pushType: nil
        )
        return activity.id
      } catch {
        print("[CallLiveActivity] Failed to start activity: \(error)")
        return nil
      }
    }

    /// End the Live Activity identified by activityId.
    AsyncFunction("endActivityAsync") { (activityId: String) in
      guard #available(iOS 16.2, *) else { return }
      for activity in Activity<CallActivityAttributes>.activities where activity.id == activityId {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
    }
  }

  private static func contentState(from dict: [String: Any]) -> CallActivityAttributes.CallState {
    let groupName = dict["groupName"] as? String ?? ""
    let callType = dict["callType"] as? String ?? "spontaneous"
    let endsAtMs = dict["endsAt"] as? Double
    let endsAt = endsAtMs.map { Date(timeIntervalSince1970: $0 / 1000) }
    return CallActivityAttributes.CallState(groupName: groupName, callType: callType, endsAt: endsAt)
  }
}
