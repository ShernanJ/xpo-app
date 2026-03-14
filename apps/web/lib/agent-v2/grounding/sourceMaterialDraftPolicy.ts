import type { DraftFormatPreference } from "../contracts/chat.ts";
import type { GroundingPacketSourceMaterial } from "./groundingPacket.ts";

function normalizeLine(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function dedupeList(values: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];

  for (const value of values) {
    const normalized = normalizeLine(value);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      continue;
    }

    seen.add(key);
    next.push(normalized);
  }

  return next;
}

function buildPrimarySourceSeed(source: GroundingPacketSourceMaterial): string | null {
  const seed = source.claims[0] || source.snippets[0] || null;
  if (!seed) {
    return null;
  }

  return `Primary source seed: ${seed}`;
}

export function buildSourceMaterialDraftConstraints(args: {
  sourceMaterials: GroundingPacketSourceMaterial[];
  formatPreference?: DraftFormatPreference | null;
  hasAutobiographicalGrounding?: boolean;
}): string[] {
  const primary = args.sourceMaterials[0];
  if (!primary) {
    return [];
  }

  const constraints = [
    `Primary source material: ${primary.type.replace(/_/g, " ")} "${primary.title}".`,
    ...(buildPrimarySourceSeed(primary) ? [buildPrimarySourceSeed(primary)!] : []),
  ];

  if (primary.type === "story") {
    constraints.push(
      "Source-material draft mode: keep the draft anchored to the saved story beats. Do not flatten it into generic tips or framework language.",
    );
    if (!args.hasAutobiographicalGrounding) {
      constraints.push(
        "Source-material draft mode: do not add extra first-person scenes, characters, or outcomes beyond the saved story detail.",
      );
    }
  }

  if (primary.type === "playbook") {
    constraints.push(
      "Source-material draft mode: frame this as a usable playbook. Prefer steps, sequence, or operating rules over a vague founder anecdote.",
    );
    if (args.formatPreference === "thread") {
      constraints.push(
        "Source-material draft mode: if this is a thread, let each post carry one step, rule, or decision from the playbook.",
      );
    }
  }

  if (primary.type === "framework") {
    constraints.push(
      "Source-material draft mode: frame this as a clear framework or principle stack. Prefer named principles over autobiographical storytelling.",
    );
    if (args.formatPreference === "thread") {
      constraints.push(
        "Source-material draft mode: if this is a thread, let each post carry one principle or lens from the framework.",
      );
    }
  }

  if (primary.type === "case_study") {
    constraints.push(
      "Source-material draft mode: frame this as a concrete case study or teardown. Lead with the saved example, then extract the takeaway.",
    );
    constraints.push(
      "Source-material draft mode: do not dissolve the saved case study into generic advice before grounding it in the example.",
    );
  }

  return dedupeList(constraints);
}
