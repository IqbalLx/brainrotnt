export type Scheme = "dark" | "light";

// Mirrors index.css: an explicit data-theme wins, otherwise follow the OS, with dark as the default.
export function resolveScheme(dataTheme: string | null | undefined, prefersLight: boolean): Scheme {
  if (dataTheme === "light" || dataTheme === "dark") return dataTheme;
  return prefersLight ? "light" : "dark";
}
