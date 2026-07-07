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
  }

  var callId: String
  var groupId: String
}
