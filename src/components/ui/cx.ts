// Joins class names, skipping falsy ones. No conflict resolution: a primitive
// exposes a prop for anything a caller would otherwise override.
export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
