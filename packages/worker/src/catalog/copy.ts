// Postgres COPY text-format encoding (https://www.postgresql.org/docs/current/sql-copy.html).
// Columns are tab-separated, rows end in \n, NULL is \N, and backslash, tab, newline and
// carriage return inside values are escaped.

export function copyValue(value: string | number | null): string {
  if (value === null) return "\\N";
  if (typeof value === "number") return String(value);
  return value.replace(/\\/g, "\\\\").replace(/\t/g, "\\t").replace(/\n/g, "\\n").replace(/\r/g, "\\r");
}

export function copyRow(values: (string | number | null)[]): string {
  return values.map(copyValue).join("\t") + "\n";
}
