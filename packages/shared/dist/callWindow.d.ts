/**
 * Call-window conversion utilities.
 * All timezone operations use Intl APIs — no external libraries required.
 */
/**
 * Convert a group's call window from the group's timezone to the viewer's timezone.
 *
 * @param windowStartHour  Hour (0–23) the window opens, in groupTz
 * @param windowEndHour    Hour (0–23) the window closes (exclusive), in groupTz
 * @param groupTz          IANA timezone the window is defined in
 * @param viewerTz         IANA timezone to convert into
 * @param anchor           Reference date for DST-correct offset lookup (default: now)
 * @returns startMinutes / endMinutes in viewer's timezone (0–1439),
 *          plus dayShift: -1 window starts previous day, 0 same day, 1 next day
 */
export declare function toViewerWindow(windowStartHour: number, windowEndHour: number, groupTz: string, viewerTz: string, anchor?: Date): {
    startMinutes: number;
    endMinutes: number;
    dayShift: number;
};
/**
 * Format a minute-of-day value (0–1439) as a human-readable time string.
 * e.g. 0 → "12 AM", 60 → "1 AM", 780 → "1 PM", 795 → "1:15 PM"
 */
export declare function formatMinutes(totalMinutes: number): string;
/**
 * Format a group call window in the viewer's local timezone as a display string.
 * Returns e.g. "6 AM – 10 PM" or "11:30 AM – 3:30 AM (next day)"
 */
export declare function formatViewerWindow(windowStartHour: number, windowEndHour: number, groupTz: string, viewerTz: string, anchor?: Date): string;
