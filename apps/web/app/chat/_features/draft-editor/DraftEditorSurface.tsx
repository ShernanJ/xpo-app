"use client";

import {
  DesktopDraftEditorDock,
  MobileDraftEditorDock,
} from "./DraftEditorDock";
import { DraftEditorPanel, type DraftEditorPanelProps } from "./DraftEditorPanel";

interface DraftEditorSurfaceProps extends Omit<DraftEditorPanelProps, "layout"> {
  open: boolean;
}

export function DraftEditorSurface(props: DraftEditorSurfaceProps) {
  const { open, ...panelProps } = props;

  if (!open) {
    return null;
  }

  return (
    <>
      <DesktopDraftEditorDock>
        <DraftEditorPanel layout="desktop" {...panelProps} />
      </DesktopDraftEditorDock>

      <MobileDraftEditorDock>
        <DraftEditorPanel layout="mobile" {...panelProps} />
      </MobileDraftEditorDock>
    </>
  );
}
