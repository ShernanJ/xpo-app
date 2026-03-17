export type DirectionHandoffArtifact = "post" | "thread" | "direction";
export type DirectionHandoffSource =
  | "bare_ideation"
  | "image_ideation"
  | "draft_bundle";

function deterministicIndex(seed: string, modulo: number): number {
  if (modulo <= 1) {
    return 0;
  }

  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 33 + seed.charCodeAt(index)) >>> 0;
  }

  return hash % modulo;
}

function pickDeterministic(options: string[], seed: string): string {
  return options[deterministicIndex(seed, options.length)];
}

function resolveArtifactLabel(artifact: DirectionHandoffArtifact): string {
  if (artifact === "thread") {
    return "thread directions";
  }

  if (artifact === "post") {
    return "post directions";
  }

  return "directions";
}

function buildSelectionClose(args: {
  source: DirectionHandoffSource;
  seed: string;
}): string {
  if (args.source === "draft_bundle") {
    return pickDeterministic(
      [
        "Pick the one that feels right, and we can keep going.",
        "Choose the one you want to build on, and we'll refine from there.",
        "Start with the one that feels closest, and we can sharpen it up.",
      ],
      `${args.seed}|close|bundle`,
    );
  }

  return pickDeterministic(
    [
      "Pick the one you want, and I'll draft it.",
      "Choose one and I'll turn it into a draft.",
      "If one clicks, I'll write it out.",
    ],
    `${args.seed}|close|ideation`,
  );
}

function buildLead(args: {
  source: DirectionHandoffSource;
  artifact: DirectionHandoffArtifact;
  seed: string;
}): string {
  const label = resolveArtifactLabel(args.artifact);

  if (args.source === "image_ideation") {
    return pickDeterministic(
      [
        `I pulled a few ${label} from the image.`,
        `This image gave us a few ${label} to work with.`,
        `I found a few ${label} in the image.`,
      ],
      `${args.seed}|lead|image|${label}`,
    );
  }

  if (args.source === "draft_bundle") {
    return pickDeterministic(
      [
        `I put together a few different ${label} from what I already know about you.`,
        `I sketched a few ${label} based on your lane and voice.`,
        `I pulled together a few ways this could go based on what I know about you.`,
      ],
      `${args.seed}|lead|bundle|${label}`,
    );
  }

  return pickDeterministic(
    [
      `I pulled together a few ${label}.`,
      `I sketched a few ${label} to start from.`,
      `I found a few ${label} worth trying.`,
    ],
    `${args.seed}|lead|bare|${label}`,
  );
}

export function buildDirectionHandoffCopy(args: {
  source: DirectionHandoffSource;
  artifact: DirectionHandoffArtifact;
  seed: string;
}): string {
  const normalizedSeed =
    args.seed.trim().toLowerCase() || `${args.source}|${args.artifact}`;
  const lead = buildLead({
    source: args.source,
    artifact: args.artifact,
    seed: normalizedSeed,
  });
  const close = buildSelectionClose({
    source: args.source,
    seed: normalizedSeed,
  });

  return `${lead} ${close}`;
}
