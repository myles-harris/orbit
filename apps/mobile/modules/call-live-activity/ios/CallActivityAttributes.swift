// ⚠️ DUPLICATED FILE — this struct exists in both:
//   apps/mobile/modules/call-live-activity/ios/CallActivityAttributes.swift
//   apps/mobile/targets/call-live-activity-widget/CallActivityAttributes.swift
// The two copies MUST be byte-identical or the Live Activity silently fails to render.
import ActivityKit
import Foundation

struct CallActivityAttributes: ActivityAttributes {
  public typealias ContentState = CallState

  public struct CallState: Codable, Hashable {
    var groupName: String
    /// "spontaneous" or "scheduled"
    var callType: String
    /// Epoch milliseconds. Non-nil only for scheduled calls.
    var endsAtMs: Double?
    /// Number of participants currently in the call. Optional for two reasons: an
    /// activity started by a pre-deploy push-to-start payload must still decode, and
    /// the widget renders the count line only when the server actually supplies one.
    var participantCount: Int?
  }

  var callId: String
  var groupId: String
}
