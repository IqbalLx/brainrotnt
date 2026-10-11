// The block install.sh adds to a shell's startup file to put ~/.brainrotnt/bin on PATH. The markers let
// the installer skip it when present and `brnt uninstall` remove exactly it. Keep in sync with install.sh.
export const PATH_BEGIN = "# >>> brainrotnt >>>";
export const PATH_END = "# <<< brainrotnt <<<";

/** Removes every brainrotnt PATH block (and the blank line before it), leaving the rest untouched. */
export function removePathBlock(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let inside = false;
  for (const line of lines) {
    if (line.trim() === PATH_BEGIN) {
      inside = true;
      if (out.length && out[out.length - 1].trim() === "") out.pop();
      continue;
    }
    if (inside) {
      if (line.trim() === PATH_END) inside = false;
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}
