import { afterEach, expect, test, vi } from "vitest";

afterEach(() => {
  delete process.env.NEXT_PUBLIC_ENABLE_MONETIZATION;
  vi.resetModules();
});

test("omits pricing from the sitemap when monetization is disabled", async () => {
  delete process.env.NEXT_PUBLIC_ENABLE_MONETIZATION;

  const { default: sitemap } = await import("./sitemap");
  const urls = sitemap().map((entry) => entry.url);

  expect(urls.some((url) => url.endsWith("/pricing"))).toBe(false);
});

test("includes pricing in the sitemap when monetization is enabled", async () => {
  process.env.NEXT_PUBLIC_ENABLE_MONETIZATION = "1";

  const { default: sitemap } = await import("./sitemap");
  const urls = sitemap().map((entry) => entry.url);

  expect(urls.some((url) => url.endsWith("/pricing"))).toBe(true);
});
