import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
dayjs.extend(utc);
dayjs.extend(timezone);
const FORMAT = 'YYYY-MM-DD HH:mm:ss';
export function institutionWallTime(iso: string | Date | null | undefined, zone: string): string | null {
  return iso ? dayjs(iso).tz(zone).format(FORMAT) : null;
}
export function institutionInstant(wall: string | null | undefined, zone: string): string | undefined {
  if (!wall) return undefined;
  const parsed = dayjs.tz(wall, zone);
  if (!parsed.isValid() || parsed.format(FORMAT) !== wall) throw new Error('Invalid local time');
  // Reject ambiguous DST overlap instead of silently choosing one of two different instants.
  if ([-120, -90, -60, -30, 30, 60, 90, 120].some(minutes => parsed.add(minutes, 'minute').tz(zone).format(FORMAT) === wall)) throw new Error('Ambiguous local time');
  return parsed.toISOString();
}
