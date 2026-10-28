const formats = new Map<string, Intl.NumberFormat>();

/** Display precision only. Never use formatted numbers in persisted data. */
export function formatNumber(
  value: number | null | undefined,
  precision: 0 | 1 | 2 = 1,
  minimum: 0 | 1 | 2 = 0,
) {
  if (value == null || !Number.isFinite(value)) return "—";
  const key = `${precision}:${minimum}`;
  let formatter = formats.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-GB", {
      maximumFractionDigits: precision,
      minimumFractionDigits: Math.min(minimum, precision),
    });
    formats.set(key, formatter);
  }
  return formatter.format(Math.abs(value) < 0.5 * 10 ** -precision ? 0 : value);
}
export function formatDelta(value: number, precision: 0 | 1 | 2 = 2) {
  const text = formatNumber(value, precision, precision);
  return value >= 0.5 * 10 ** -precision ? `+${text}` : text;
}
