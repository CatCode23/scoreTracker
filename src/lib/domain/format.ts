/** "13:00:00" -> "1300" (military time, as used on the schedule). */
export function formatTime(t: string | null | undefined): string {
  if (!t) return '';
  const [h, m] = t.split(':');
  return `${h.padStart(2, '0')}${(m ?? '00').padStart(2, '0')}`;
}

/** "2026-12-07" -> "Mon, Dec 7" without timezone shifting. */
export function formatDate(d: string | null | undefined, withYear = false): string {
  if (!d) return '';
  const [y, mo, day] = d.split('-').map(Number);
  const date = new Date(Date.UTC(y, mo - 1, day));
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: withYear ? 'numeric' : undefined,
    timeZone: 'UTC',
  });
}

export function formatDateTime(ts: string | null | undefined): string {
  if (!ts) return '';
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** 125.4 -> "2:05.4", 42 -> "42s" */
export function formatSeconds(s: number | null | undefined): string {
  if (s == null || Number.isNaN(Number(s))) return '';
  const total = Math.round(Number(s) * 10) / 10;
  const m = Math.floor(total / 60);
  const rest = Math.round((total - m * 60) * 10) / 10;
  const fmt = Number.isInteger(rest) ? String(rest) : rest.toFixed(1);
  return m > 0 ? `${m}:${rest < 10 ? '0' : ''}${fmt}` : `${fmt}s`;
}

/**
 * Parse "mm:ss", "mm:ss.s", "h:mm:ss" or plain seconds into seconds.
 * Returns null for blank, NaN for invalid input.
 */
export function parseDuration(input: string): number | null {
  const v = input.trim();
  if (v === '') return null;
  if (/^\d+(\.\d+)?$/.test(v)) return Number(v);
  const parts = v.split(':');
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p)))
    return NaN;
  const nums = parts.map(Number);
  if (nums.slice(1).some((n) => n >= 60)) return NaN;
  return nums.reduce((acc, n) => acc * 60 + n, 0);
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function humanize(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
