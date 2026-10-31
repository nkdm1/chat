const time = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});
const weekday = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const day = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
});
const full = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const DAY = 24 * 60 * 60 * 1000;

/** Compact timestamp for lists: 14:03, Mon, 12 Oct. */
export function shortTime(iso: string) {
  const date = new Date(iso);
  const age = Date.now() - date.getTime();
  if (age < DAY && date.getDate() === new Date().getDate()) {
    return time.format(date);
  }
  return age < 6 * DAY ? weekday.format(date) : day.format(date);
}

export function clockTime(iso: string) {
  return time.format(new Date(iso));
}

export function fullTime(iso: string) {
  return full.format(new Date(iso));
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** "123456" -> "123 456" */
export function formatCode(code: string) {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}
