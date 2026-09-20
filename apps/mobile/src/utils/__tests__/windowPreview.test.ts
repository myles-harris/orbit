import { windowPreviewLines } from '../windowPreview';

// The formatter reads "now" to pick DST offsets, so clock times are only asserted
// where the offset can't change with the season (New York is always three hours
// ahead of Los Angeles). Everywhere else these tests assert structure.
const NY = 'America/New_York';
const LA = 'America/Los_Angeles';
const LONDON = 'Europe/London';

describe('windowPreviewLines', () => {
  it('leads with the group’s own zone, marked as the group’s', () => {
    const [first] = windowPreviewLines({ start: 6, end: 22, groupTz: NY });
    expect(first).toBe('America/New_York · 6 AM – 10 PM · group');
  });

  it('gives a lone group its one line', () => {
    expect(windowPreviewLines({ start: 6, end: 22, groupTz: NY })).toHaveLength(1);
    expect(windowPreviewLines({ start: 6, end: 22, groupTz: NY, memberTimeZones: [] })).toHaveLength(1);
  });

  it('shows three deduplicated lines for members spread over three zones', () => {
    const lines = windowPreviewLines({
      start: 6,
      end: 22,
      groupTz: NY,
      // Six members, three zones — the group's own zone appears among them.
      memberTimeZones: [NY, LA, LONDON, LA, NY, LONDON],
    });
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('· group');
    expect(lines.filter((l) => l.startsWith(LA))).toHaveLength(1);
    expect(lines.filter((l) => l.startsWith(LONDON))).toHaveLength(1);
    // The group's zone is not repeated as a member line.
    expect(lines.filter((l) => l.startsWith(NY))).toHaveLength(1);
  });

  it('converts the window into each member’s zone', () => {
    const lines = windowPreviewLines({ start: 6, end: 22, groupTz: NY, memberTimeZones: [LA] });
    // New York is always three hours ahead of Los Angeles, whichever side of DST.
    expect(lines[1]).toBe('America/Los_Angeles · 3 AM – 7 PM');
  });

  it('keeps a stable order however the members arrive', () => {
    const a = windowPreviewLines({ start: 6, end: 22, groupTz: NY, memberTimeZones: [LONDON, LA] });
    const b = windowPreviewLines({ start: 6, end: 22, groupTz: NY, memberTimeZones: [LA, LONDON] });
    expect(a).toEqual(b);
  });

  it('marks a window that lands on another day', () => {
    // 22:00 New York is already the next morning in Tokyo.
    const lines = windowPreviewLines({ start: 20, end: 23, groupTz: NY, memberTimeZones: ['Asia/Tokyo'] });
    expect(lines[1]).toMatch(/^Asia\/Tokyo · .*\(next day\)$/);
  });

  it('skips a zone Intl does not know rather than throwing', () => {
    const lines = windowPreviewLines({ start: 6, end: 22, groupTz: NY, memberTimeZones: ['Not/AZone', LA] });
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain(LA);
  });

  it('ignores blank zones', () => {
    expect(windowPreviewLines({ start: 6, end: 22, groupTz: NY, memberTimeZones: ['', LA] })).toHaveLength(2);
  });
});
