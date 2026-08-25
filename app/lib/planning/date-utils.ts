export const DAY = 86_400_000;

export function dateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function addDays(value: Date, count: number) {
  return new Date(value.getTime() + count * DAY);
}
