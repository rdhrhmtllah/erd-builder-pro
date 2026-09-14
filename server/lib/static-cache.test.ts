import { describe, expect, it } from "vitest";
import { staticCacheControl } from "./static-cache.js";

describe("staticCacheControl", () => {
  it("lets fingerprinted bundles be cached forever", () => {
    expect(staticCacheControl("/assets/index-Cc9__xmp.js")).toBe("public, max-age=31536000, immutable");
    expect(staticCacheControl("/assets/index-ym6W0Aka.css")).toContain("immutable");
  });

  it("makes the service worker revalidate every time", () => {
    // A CDN holding the worker for hours keeps serving an app shell that points
    // at bundles the next deploy has deleted.
    expect(staticCacheControl("/sw.js")).toBe("no-cache");
  });

  it("does not mistake a nested file for the service worker", () => {
    expect(staticCacheControl("/assets/sw.js")).toContain("immutable");
    expect(staticCacheControl("/vendor/sw.js")).toBe("public, max-age=3600");
  });

  it("keeps the manifest and shell revalidating", () => {
    expect(staticCacheControl("/manifest.webmanifest")).toBe("no-cache");
    expect(staticCacheControl("/index.html")).toBe("no-cache");
  });

  it("gives everything else a short, ordinary lifetime", () => {
    expect(staticCacheControl("/favicon.png")).toBe("public, max-age=3600");
    expect(staticCacheControl("/icons/icon-192x192-any.png")).toBe("public, max-age=3600");
  });
});
