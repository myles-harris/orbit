import { useEffect } from 'react';
import { useNow } from '../utils/countdown';
import { LiveCall, formatCallTimer, hasCountdown, isMissingEndTime } from '../utils/liveCalls';

interface CallTimerProps {
  call: LiveCall;
  /** False while the screen is blurred: the clock stops, and reads fresh on return. */
  active: boolean;
}

/**
 * A live call's timer, with its own clock. It renders nothing but the string, so each
 * second only this text node updates — not the card, its gradient, or any tile on the
 * screen.
 *
 * The one implementation behind every live surface: Home's card and the Spotlight
 * overlay both draw it for every call and differ only in size. The direction is
 * `formatCallTimer`'s — down for a scheduled call, up for any other — so a surface
 * never chooses it.
 */
export function CallTimer({ call, active }: CallTimerProps) {
  const counting = hasCountdown(call);
  // A countdown has nothing left to tick toward once it reaches zero; a count-up never stops.
  const now = useNow({ active, until: counting ? new Date(call.ends_at).getTime() : Infinity });

  // Once per call, not once a second: the fault is in the payload, and it stays there.
  const missingEndTime = isMissingEndTime(call);
  useEffect(() => {
    if (missingEndTime) {
      console.error('[call-timer] scheduled call has no ends_at; showing elapsed time:', call.id);
    }
  }, [missingEndTime, call.id]);

  return <>{formatCallTimer(call, now)}</>;
}
