import { formatCountdown, useNow } from '../utils/countdown';

interface CountdownProps {
  /** ISO end time of a scheduled call. */
  endsAt: string;
  /** False while the screen is blurred: the clock stops, and reads fresh on return. */
  active: boolean;
}

/**
 * The live card's countdown, with its own clock. It renders nothing but the string,
 * so each second only this text node updates — not the card, its gradient, or any
 * tile on the screen. It is mounted only for a call that has a countdown
 * (`hasCountdown` in utils/liveCalls.ts), so a spontaneous call runs no timer.
 */
export function Countdown({ endsAt, active }: CountdownProps) {
  const now = useNow({ active, until: new Date(endsAt).getTime() });
  return <>{formatCountdown(endsAt, now)}</>;
}
