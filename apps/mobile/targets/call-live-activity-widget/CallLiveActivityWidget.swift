import WidgetKit
import SwiftUI
import ActivityKit

private func participantCountLabel(_ count: Int) -> String {
  count == 1 ? "1 in the call" : "\(count) in the call"
}

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
        .widgetURL(URL(string: "orbit://group/\(context.attributes.groupId)"))
        .activityBackgroundTint(Color.black.opacity(0.75))
        .activitySystemActionForegroundColor(.white)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          VStack(alignment: .leading, spacing: 2) {
            Text(context.state.groupName)
              .font(.headline)
              .foregroundColor(.white)
              .lineLimit(1)
            if let count = context.state.participantCount {
              Text(participantCountLabel(count))
                .font(.caption)
                .foregroundColor(.white.opacity(0.7))
                .lineLimit(1)
            }
          }
        }
        DynamicIslandExpandedRegion(.trailing) {
          if context.state.callType == "scheduled", let ms = context.state.endsAtMs {
            let endsAt = Date(timeIntervalSince1970: ms / 1000)
            Text(timerInterval: Date.now...max(endsAt, Date.now), countsDown: true)
              .font(.subheadline.monospacedDigit())
              .foregroundColor(.white)
              .frame(width: 84, alignment: .trailing)
          }
        }
      } compactLeading: {
        Image("OrbitMark")
          .resizable()
          .aspectRatio(contentMode: .fit)
          .frame(width: 18, height: 18)
          .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
      } compactTrailing: {
        if context.state.callType == "scheduled", let ms = context.state.endsAtMs {
          let endsAt = Date(timeIntervalSince1970: ms / 1000)
          Text(timerInterval: Date.now...max(endsAt, Date.now), countsDown: true)
            .font(.caption2.monospacedDigit())
            .foregroundColor(.white)
            .frame(width: 66)
        } else if let count = context.state.participantCount {
          // Spontaneous calls have no countdown, so the count is the only live number
          // worth the slot. White, not green: one palette across the whole surface.
          Text("\(count)")
            .font(.caption2.monospacedDigit())
            .foregroundColor(.white)
        } else {
          Image(systemName: "waveform")
            .foregroundColor(.white)
        }
      } minimal: {
        Image(systemName: "phone.fill")
          .foregroundColor(.white)
      }
      .widgetURL(URL(string: "orbit://group/\(context.attributes.groupId)"))
    }
  }
}

struct LockScreenCallView: View {
  let state: CallActivityAttributes.CallState

  var body: some View {
    HStack(alignment: .center, spacing: 12) {
      VStack(alignment: .leading, spacing: 4) {
        Text("\(state.groupName) is calling")
          .font(.headline)
          .foregroundColor(.white)
          .lineLimit(1)

        if state.callType == "scheduled", let ms = state.endsAtMs {
          let endsAt = Date(timeIntervalSince1970: ms / 1000)
          Text(timerInterval: Date.now...max(endsAt, Date.now), countsDown: true)
            .font(.system(size: 40, weight: .bold, design: .rounded).monospacedDigit())
            .foregroundColor(.white)
            .lineLimit(1)
            .minimumScaleFactor(0.6)
            .accessibilityLabel("Call ends in")
        } else {
          Text("Active now")
            .font(.system(size: 34, weight: .bold, design: .rounded))
            .foregroundColor(.white)
        }

        // Subordinate line, rendered only when the server supplies a count. Absent
        // until the presence fan-out ships, at which point this is the live number.
        if let count = state.participantCount {
          Text(participantCountLabel(count))
            .font(.subheadline)
            .foregroundColor(.white.opacity(0.7))
            .lineLimit(1)
        }
      }

      Spacer(minLength: 8)

      Image("OrbitMark")
        .resizable()
        .aspectRatio(contentMode: .fit)
        .frame(width: 44, height: 44)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .accessibilityHidden(true)
    }
    .padding()
  }
}
