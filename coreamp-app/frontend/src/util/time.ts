// Format a number of seconds as m:ss (minutes uncapped). Invalid or negative
// inputs render as 0:00.
export function formatTime(secs: number | null | undefined): string {
  const total = typeof secs === "number" && Number.isFinite(secs) && secs > 0 ? secs : 0;
  const whole = Math.floor(total);
  const minutes = Math.floor(whole / 60);
  const seconds = whole % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
