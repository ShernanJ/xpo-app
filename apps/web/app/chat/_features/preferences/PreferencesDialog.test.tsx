import type { ImgHTMLAttributes } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import { PreferencesDialog } from "./PreferencesDialog";

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: (props: ImgHTMLAttributes<HTMLImageElement>) => <img {...props} />,
}));

function buildProps(
  overrides: Partial<Parameters<typeof PreferencesDialog>[0]> = {},
): Parameters<typeof PreferencesDialog>[0] {
  return {
    open: true,
    onOpenChange: vi.fn(),
    onSave: vi.fn(),
    isPreferencesLoading: false,
    isPreferencesSaving: false,
    preferenceCasing: "normal",
    onPreferenceCasingChange: vi.fn(),
    preferenceBulletStyle: "auto",
    onPreferenceBulletStyleChange: vi.fn(),
    preferenceWritingMode: "balanced",
    onPreferenceWritingModeChange: vi.fn(),
    preferenceUseEmojis: true,
    onTogglePreferenceUseEmojis: vi.fn(),
    preferenceAllowProfanity: false,
    onTogglePreferenceAllowProfanity: vi.fn(),
    preferenceBlacklistInput: "",
    onPreferenceBlacklistInputChange: vi.fn(),
    onPreferenceBlacklistInputKeyDown: vi.fn(),
    preferenceBlacklistedTerms: ["spam"],
    onRemovePreferenceBlacklistedTerm: vi.fn(),
    isVerifiedAccount: true,
    effectivePreferenceMaxCharacters: 280,
    onPreferenceMaxCharactersChange: vi.fn(),
    previewDisplayName: "Stanley",
    previewUsername: "standev",
    previewAvatarUrl: null,
    preferencesPreviewDraft: "Shipping a cleaner modal today.",
    preferencesPreviewCounter: {
      label: "34 / 280 chars",
      toneClassName: "text-zinc-500",
    },
    ...overrides,
  };
}

test("renders the preferences dialog with controls, actions, and preview content", () => {
  render(<PreferencesDialog {...buildProps()} />);

  expect(screen.getByRole("dialog", { name: "Preferences" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Close preferences" })).toBeInTheDocument();
  expect(screen.getByText("Core Settings")).toBeInTheDocument();
  expect(screen.getAllByText("Preview").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Shipping a cleaner modal today.").length).toBeGreaterThan(0);
});

test("closes the preferences dialog on escape and backdrop click", () => {
  const onOpenChange = vi.fn();

  render(<PreferencesDialog {...buildProps({ onOpenChange })} />);

  const dialog = screen.getByRole("dialog", { name: "Preferences" });

  fireEvent.keyDown(document, { key: "Escape" });
  expect(onOpenChange).toHaveBeenCalledWith(false);

  onOpenChange.mockClear();
  fireEvent.mouseDown(dialog.parentElement as HTMLElement);
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

test("disables save while loading or saving preferences", () => {
  const { rerender } = render(
    <PreferencesDialog {...buildProps({ isPreferencesLoading: true })} />,
  );

  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

  rerender(<PreferencesDialog {...buildProps({ isPreferencesSaving: true })} />);

  expect(screen.getByRole("button", { name: "Saving" })).toBeDisabled();
});

test("renders preview identity and counter details from props", () => {
  render(
    <PreferencesDialog
      {...buildProps({
        previewDisplayName: "Vitalii Dodonov",
        previewUsername: "vitddnv",
        preferencesPreviewDraft: "The preview should mirror the selected preferences.",
        preferencesPreviewCounter: {
          label: "72 / 280 chars",
          toneClassName: "text-emerald-400",
        },
      })}
    />,
  );

  expect(screen.getAllByText("Vitalii Dodonov").length).toBeGreaterThan(0);
  expect(screen.getAllByText("@vitddnv").length).toBeGreaterThan(0);
  expect(
    screen.getAllByText("The preview should mirror the selected preferences.").length,
  ).toBeGreaterThan(0);
  expect(screen.getAllByText("72 / 280 chars").length).toBeGreaterThan(0);
});
