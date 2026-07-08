import WidgetKit
import SwiftUI
import ActivityKit

@main
struct CallLiveActivityExtensionBundle: WidgetBundle {
  var body: some Widget {
    CallLiveActivityWidget()
  }
}

struct CallLiveActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: CallActivityAttributes.self) { context in
      LockScreenCallView(state: context.state)
        .activityBackgroundTint(Color.black.opacity(0.75))
        .activitySystemActionForegroundColor(.white)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Label(context.state.groupName, systemImage: "phone.fill")
            .font(.headline)
            .foregroundColor(.white)
            .lineLimit(1)
        }
        DynamicIslandExpandedRegion(.trailing) {
          if context.state.callType == "scheduled", let ms = context.state.endsAtMs {
            let endsAt = Date(timeIntervalSince1970: ms / 1000)
            Text(timerInterval: Date.now...max(endsAt, Date.now), countsDown: true)
              .font(.subheadline.monospacedDigit())
              .foregroundColor(.green)
              .frame(width: 64, alignment: .trailing)
          }
        }
        DynamicIslandExpandedRegion(.bottom) {
          Text("Tap to join")
            .font(.caption)
            .foregroundColor(.white.opacity(0.7))
        }
      } compactLeading: {
        Image(systemName: "phone.fill")
          .foregroundColor(.green)
      } compactTrailing: {
        if context.state.callType == "scheduled", let ms = context.state.endsAtMs {
          let endsAt = Date(timeIntervalSince1970: ms / 1000)
          Text(timerInterval: Date.now...max(endsAt, Date.now), countsDown: true)
            .font(.caption2.monospacedDigit())
            .foregroundColor(.green)
            .frame(width: 52)
        } else {
          Image(systemName: "waveform")
            .foregroundColor(.green)
        }
      } minimal: {
        Image(systemName: "phone.fill")
          .foregroundColor(.green)
      }
    }
  }
}

struct LockScreenCallView: View {
  let state: CallActivityAttributes.CallState

  var body: some View {
    HStack(spacing: 12) {
      Image(systemName: "phone.fill")
        .foregroundColor(.green)
        .font(.title2)

      VStack(alignment: .leading, spacing: 2) {
        Text(state.groupName)
          .font(.headline)
          .foregroundColor(.white)
          .lineLimit(1)

        if state.callType == "scheduled", let ms = state.endsAtMs {
          let endsAt = Date(timeIntervalSince1970: ms / 1000)
          HStack(spacing: 4) {
            Text("Ends in")
              .font(.subheadline)
              .foregroundColor(.white.opacity(0.7))
            Text(timerInterval: Date.now...max(endsAt, Date.now), countsDown: true)
              .font(.subheadline.monospacedDigit())
              .foregroundColor(.green)
          }
        } else {
          Text("Active Call")
            .font(.subheadline)
            .foregroundColor(.white.opacity(0.7))
        }
      }

      Spacer()

      Text("Join")
        .font(.subheadline.bold())
        .foregroundColor(.white)
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(Color.green)
        .clipShape(Capsule())
    }
    .padding()
  }
}
