import ExpoModulesCore
import ActivityKit

public class CallLiveActivityModule: Module {
  private var ptsTask: Task<Void, Never>?
  private var activityTokenTask: Task<Void, Never>?
  private var lastPtsToken: String?

  public func definition() -> ModuleDefinition {
    Name("CallLiveActivity")
    Events("onPushToStartToken", "onActivityPushToken")

    OnStartObserving {
      self.startObservingTokens()
    }

    OnStopObserving {
      self.ptsTask?.cancel(); self.ptsTask = nil
      self.activityTokenTask?.cancel(); self.activityTokenTask = nil
    }

    // Returns the most recently received push-to-start token without waiting for an event.
    // Use on mount to catch tokens issued before JS subscribed.
    AsyncFunction("getPushToStartTokenAsync") { () -> String? in
      self.lastPtsToken
    }

    // True if a Live Activity already exists for the given callId.
    // Used in App.tsx to skip a duplicate client-side start when push-to-start fired.
    AsyncFunction("hasActivityForCall") { (callId: String) -> Bool in
      Activity<CallActivityAttributes>.activities.contains { $0.attributes.callId == callId }
    }

    AsyncFunction("startActivityAsync") { (callId: String, groupId: String, state: [String: Any]) -> String? in
      guard ActivityAuthorizationInfo().areActivitiesEnabled else { return nil }
      let groupName = state["groupName"] as? String ?? ""
      let callType = state["callType"] as? String ?? "spontaneous"
      let endsAtMs = state["endsAt"] as? Double
      let contentState = CallActivityAttributes.CallState(
        groupName: groupName, callType: callType, endsAtMs: endsAtMs)
      let attributes = CallActivityAttributes(callId: callId, groupId: groupId)
      let endsAt = endsAtMs.map { Date(timeIntervalSince1970: $0 / 1000) }
      do {
        let content = ActivityContent(state: contentState, staleDate: endsAt)
        // pushType: .token enables per-activity update tokens (for remote end/update).
        let activity = try Activity<CallActivityAttributes>.request(
          attributes: attributes, content: content, pushType: .token)
        // For scheduled calls, self-terminate at endsAt so no server push is needed.
        if let endsAt {
          Task {
            do {
              try await Task.sleep(until: .now + max(endsAt.timeIntervalSinceNow, 0), clock: .continuous)
              await activity.end(nil, dismissalPolicy: .after(endsAt))
            } catch { /* task cancelled */ }
          }
        }
        return activity.id
      } catch {
        print("[CallLiveActivity] Failed to start activity: \(error)")
        return nil
      }
    }

    AsyncFunction("endActivityAsync") { (activityId: String) in
      for activity in Activity<CallActivityAttributes>.activities where activity.id == activityId {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
    }

    /// End ALL call activities — safety net for stale activities after crashes.
    AsyncFunction("endAllActivitiesAsync") {
      for activity in Activity<CallActivityAttributes>.activities {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
    }
  }

  private func startObservingTokens() {
    // Push-to-start tokens — allow the server to start a Live Activity without the app running.
    ptsTask = Task { [weak self] in
      for await data in Activity<CallActivityAttributes>.pushToStartTokenUpdates {
        let hex = data.map { String(format: "%02x", $0) }.joined()
        self?.lastPtsToken = hex
        self?.sendEvent("onPushToStartToken", ["token": hex])
      }
    }

    // Per-activity push tokens — allow the server to update or end a specific activity.
    // Activities started by push-to-start have no in-process handle until the app next runs,
    // so we observe activityUpdates and forward each activity's token as it becomes available.
    activityTokenTask = Task { [weak self] in
      for await activity in Activity<CallActivityAttributes>.activityUpdates {
        Task { [weak self] in
          for await tokenData in activity.pushTokenUpdates {
            let hex = tokenData.map { String(format: "%02x", $0) }.joined()
            self?.sendEvent("onActivityPushToken", [
              "activityId": activity.id,
              "callId": activity.attributes.callId,
              "token": hex,
            ])
          }
        }
      }
    }
  }
}
