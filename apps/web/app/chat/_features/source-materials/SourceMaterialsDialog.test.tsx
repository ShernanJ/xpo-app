import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import { SourceMaterialsDialog } from "./SourceMaterialsDialog";
import type { SourceMaterialAsset } from "./sourceMaterialsState";

function buildAsset(
  overrides: Partial<SourceMaterialAsset> = {},
): SourceMaterialAsset {
  return {
    id: "asset_1",
    userId: "user_1",
    xHandle: "standev",
    type: "story",
    title: "Launch story",
    tags: ["launch", "positioning"],
    verified: true,
    claims: ["We cut onboarding friction by removing the tour."],
    snippets: ["People do not need more onboarding. They need more clarity."],
    doNotClaim: ["Do not mention customer names"],
    lastUsedAt: null,
    createdAt: "2026-03-17T10:00:00.000Z",
    updatedAt: "2026-03-17T10:00:00.000Z",
    ...overrides,
  };
}

function buildProps(
  overrides: Partial<Parameters<typeof SourceMaterialsDialog>[0]> = {},
): Parameters<typeof SourceMaterialsDialog>[0] {
  return {
    open: true,
    onOpenChange: vi.fn(),
    onSeedSourceMaterials: vi.fn(),
    isSourceMaterialsLoading: false,
    isSourceMaterialsSaving: false,
    sourceMaterialsNotice: null,
    sourceMaterialDraft: {
      id: null,
      title: "",
      type: "story",
      verified: true,
      tagsInput: "",
      claimsInput: "We cut onboarding friction by removing the tour.",
      snippetsInput: "",
      doNotClaimInput: "",
    },
    onClearDraft: vi.fn(),
    onApplyClaimExample: vi.fn(),
    onDraftTitleChange: vi.fn(),
    onDraftTypeChange: vi.fn(),
    onToggleDraftVerified: vi.fn(),
    onDraftClaimsChange: vi.fn(),
    sourceMaterialAdvancedOpen: false,
    onToggleSourceMaterialAdvancedOpen: vi.fn(),
    onDraftTagsChange: vi.fn(),
    onDraftSnippetsChange: vi.fn(),
    onDraftDoNotClaimChange: vi.fn(),
    onDeleteSourceMaterial: vi.fn(),
    onSaveSourceMaterial: vi.fn(),
    sourceMaterialsLibraryOpen: true,
    onToggleSourceMaterialsLibraryOpen: vi.fn(),
    sourceMaterials: [buildAsset()],
    onSelectSourceMaterial: vi.fn(),
    ...overrides,
  };
}

test("renders saved context dialog with header action, editor, and library", () => {
  render(<SourceMaterialsDialog {...buildProps()} />);

  expect(screen.getByRole("dialog", { name: "Saved Context" })).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Auto-fill what Xpo already knows" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Close saved context" })).toBeInTheDocument();
  expect(screen.getAllByText("Add something true").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Saved stories and proof").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Launch story").length).toBeGreaterThan(0);
});

test("closes saved context on escape and backdrop click", () => {
  const onOpenChange = vi.fn();

  render(<SourceMaterialsDialog {...buildProps({ onOpenChange })} />);

  const dialog = screen.getByRole("dialog", { name: "Saved Context" });

  fireEvent.keyDown(document, { key: "Escape" });
  expect(onOpenChange).toHaveBeenCalledWith(false);

  onOpenChange.mockClear();
  fireEvent.mouseDown(dialog.parentElement as HTMLElement);
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

test("disables header and save actions while loading or saving", () => {
  const { rerender } = render(
    <SourceMaterialsDialog {...buildProps({ isSourceMaterialsLoading: true })} />,
  );

  expect(
    screen.getByRole("button", { name: "Auto-fill what Xpo already knows" }),
  ).toBeDisabled();
  expect(screen.getAllByRole("button", { name: "Save for later" })[0]).toBeDisabled();

  rerender(<SourceMaterialsDialog {...buildProps({ isSourceMaterialsSaving: true })} />);

  expect(
    screen.getByRole("button", { name: "Auto-fill what Xpo already knows" }),
  ).toBeDisabled();
  expect(screen.getAllByRole("button", { name: "Saving" })[0]).toBeDisabled();
});

test("renders notice and loading library state from props", () => {
  render(
    <SourceMaterialsDialog
      {...buildProps({
        sourceMaterialsNotice: "Saved story imported.",
        isSourceMaterialsLoading: true,
        sourceMaterials: [],
      })}
    />,
  );

  expect(screen.getAllByText("Saved story imported.").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Loading saved stories...").length).toBeGreaterThan(0);
});

test("renders empty library state and selects saved assets", () => {
  const onSelectSourceMaterial = vi.fn();
  const asset = buildAsset({
    id: "asset_2",
    title: "Hiring playbook",
    type: "playbook",
  });

  const { rerender } = render(
    <SourceMaterialsDialog
      {...buildProps({
        sourceMaterials: [],
      })}
    />,
  );

  expect(
    screen.getAllByText(
      "Nothing saved yet. Add one real story or playbook on the right and Xpo will start reusing it.",
    ).length,
  ).toBeGreaterThan(0);

  rerender(
    <SourceMaterialsDialog
      {...buildProps({
        sourceMaterials: [asset],
        onSelectSourceMaterial,
      })}
    />,
  );

  fireEvent.click(screen.getAllByText("Hiring playbook")[0].closest("button") as HTMLElement);
  expect(onSelectSourceMaterial).toHaveBeenCalledWith(asset);
});
