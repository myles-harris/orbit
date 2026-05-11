import ActivityKit
import Foundation

/// Shared ActivityKit attributes for the call Live Activity.
/// Must be included in BOTH the main app target AND the
/// CallLiveActivityExtension widget target in Xcode.
struct CallActivityAttributes: ActivityAttributes {
  public typealias ContentState = CallState

  public struct CallState: Codable, Hashable {
    /// Display name of the group
    var groupName: String
    /// "spontaneous" or "scheduled"
    var callType: String
    /// Non-nil only for scheduled calls
    var endsAt: Date?
  }

  var callId: String
  var groupId: String
}
