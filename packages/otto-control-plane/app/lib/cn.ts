/**
 * Keeps class name composition tiny and dependency-free so UI primitives stay lightweight
 * while still supporting conditional variant classes.
 *
 * @param values Class values that may be strings, null, undefined, or false.
 * @returns Space-joined class string with falsy values removed.
 */
export const cn = (...values: Array<string | false | null | undefined>): string => {
  return values.filter(Boolean).join(" ")
}
