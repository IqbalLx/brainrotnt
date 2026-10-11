import type { Context } from "hono";

/** URL path (such as "/assets/index-abc.js") to a file Bun can read: on disk, or embedded in the binary. */
export type StaticAssets = Map<string, string>;

/**
 * Serves the built web app. Hashed files under /assets never change, so they are cached for a year;
 * everything else (index.html, fonts copied as-is) is revalidated. Unknown paths get index.html, as
 * the app routes with the URL hash and any other path is just the app.
 */
export function serveStatic(assets: StaticAssets) {
  return async (c: Context) => {
    const path = decodeURIComponent(new URL(c.req.url).pathname);
    const file = assets.get(path === "/" ? "/index.html" : path) ?? (looksLikeFile(path) ? undefined : assets.get("/index.html"));
    if (!file) return c.notFound();
    return new Response(Bun.file(file), {
      headers: { "cache-control": path.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache" },
    });
  };
}

// A missing script or font should be a 404, not the app's HTML with a 200.
const looksLikeFile = (path: string) => /\.[a-z0-9]+$/i.test(path);

/** Lists a built web app on disk, for running the launcher from a source checkout. */
export async function assetsFromDirectory(dir: string): Promise<StaticAssets> {
  const assets: StaticAssets = new Map();
  for await (const relative of new Bun.Glob("**/*").scan({ cwd: dir, onlyFiles: true })) {
    assets.set(`/${relative.split("\\").join("/")}`, `${dir}/${relative}`);
  }
  return assets;
}
