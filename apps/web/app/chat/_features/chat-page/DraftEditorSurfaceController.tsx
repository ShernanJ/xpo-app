"use client";

import {
  useDraftEditorSurfaceProps,
  type UseDraftEditorSurfacePropsOptions,
} from "./useDraftEditorSurfaceProps";
import { DraftEditorSurface } from "../draft-editor/DraftEditorSurface";

export function DraftEditorSurfaceController(
  props: UseDraftEditorSurfacePropsOptions,
) {
  const draftEditorSurfaceProps = useDraftEditorSurfaceProps(props);

  return <DraftEditorSurface {...draftEditorSurfaceProps} />;
}
