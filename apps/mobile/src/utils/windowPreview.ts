import { formatViewerWindow } from '@orbit/shared';
import { formatHour } from './groupFormat';

interface WindowPreviewInput {
  /** Whole hours in the group's own zone. */
  start: number;
  end: number;
  groupTz: string;
  /** One entry per member, duplicates and all — this collapses them. */
  memberTimeZones?: string[];
}

/**
 * The lines under the call-window dial: the group's own zone first, then the same
 * window as each other zone sees it, one line per distinct zone.
 *
 * A member in the group's own zone is already covered by the first line, so three
 * zones across the membership give three lines, not four. Zones are sorted so the
 * order does not shuffle between polls while the API returns members unordered.
 */
export function windowPreviewLines({ start, end, groupTz, memberTimeZones = [] }: WindowPreviewInput): string[] {
  const lines = [`${groupTz} · ${formatHour(start)} – ${formatHour(end)} · group`];
  const zones = [...new Set(memberTimeZones)].filter((tz) => tz && tz !== groupTz).sort();
  for (const tz of zones) {
    try {
      lines.push(`${tz} · ${formatViewerWindow(start, end, groupTz, tz)}`);
    } catch {
      // Intl throws on a zone it doesn't know. One member's bad profile value
      // must not take the whole settings screen down, so that line is dropped.
    }
  }
  return lines;
}
