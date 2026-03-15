import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import { ProfileAuditBannerGenerator } from "./ProfileAuditBannerGenerator";

test("downloads a 1500x500 PNG from the banner generator", async () => {
  const user = userEvent.setup();
  const onOpen = vi.fn();
  const onDownload = vi.fn();
  const drawImage = vi.fn();
  const getContextSpy = vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockImplementation(() => ({ drawImage }) as never);
  const toDataUrlSpy = vi
    .spyOn(HTMLCanvasElement.prototype, "toDataURL")
    .mockImplementation(() => "data:image/png;base64,banner");
  const anchorClickSpy = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => undefined);

  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => "blob:banner"),
    revokeObjectURL: vi.fn(),
  });
  vi.stubGlobal(
    "Image",
    class MockImage {
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;

      set src(_value: string) {
        window.setTimeout(() => {
          this.onload?.();
        }, 0);
      }
    },
  );

  render(
    <ProfileAuditBannerGenerator
      presets={[
        {
          id: "authority-stack",
          headline: "AI Growth Systems",
          subheadline: "Helping SaaS founders turn profile visits into qualified follows.",
          proofLine: "2.4k followers on X",
          ctaLine: null,
        },
      ]}
      onOpen={onOpen}
      onDownload={onDownload}
    />,
  );

  await user.click(screen.getByRole("button", { name: /open banner generator/i }));

  expect(onOpen).toHaveBeenCalledTimes(1);

  await user.click(screen.getByRole("button", { name: /download 1500x500 png/i }));

  await waitFor(() => {
    expect(onDownload).toHaveBeenCalledWith("authority-stack");
  });

  expect(drawImage).toHaveBeenCalled();
  expect(toDataUrlSpy).toHaveBeenCalledWith("image/png");
  expect(anchorClickSpy).toHaveBeenCalled();

  anchorClickSpy.mockRestore();
  toDataUrlSpy.mockRestore();
  getContextSpy.mockRestore();
  vi.unstubAllGlobals();
});
