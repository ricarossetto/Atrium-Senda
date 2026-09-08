export const DAILY_SYNC_HOUR = 10;

export function nextDailySyncAt(now = new Date(), hour = DAILY_SYNC_HOUR) {
  const current = new Date(now);
  const next = new Date(current);
  next.setHours(hour, 0, 0, 0);
  if (next <= current) next.setDate(next.getDate() + 1);
  return next;
}

export function millisecondsUntilDailySync(now = new Date(), hour = DAILY_SYNC_HOUR) {
  return Math.max(1, nextDailySyncAt(now, hour).getTime() - new Date(now).getTime());
}
