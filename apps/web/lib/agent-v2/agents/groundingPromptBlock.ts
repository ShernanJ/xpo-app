import {
  collectGroundingFactualAuthority,
  type GroundingPacket,
} from "../orchestrator/groundingPacket";

export function buildGroundingPromptBlock(args: {
  groundingPacket: GroundingPacket | null | undefined;
  title?: string;
  sourceMaterialLimit?: number;
  claimLabel?: string;
  snippetLabel?: string;
  sourceMaterialFallbackLine?: string | null;
  guidanceLines: string[];
}): string | null {
  const packet = args.groundingPacket;
  if (!packet) {
    return null;
  }

  const factualAuthority = collectGroundingFactualAuthority(packet);
  const sourceMaterialLines = packet.sourceMaterials
    .slice(0, args.sourceMaterialLimit ?? 0)
    .map((item) => {
      const claim = item.claims[0] ? ` | ${args.claimLabel || "claim"}: ${item.claims[0]}` : "";
      const snippet = item.snippets[0]
        ? ` | ${args.snippetLabel || "snippet"}: ${item.snippets[0]}`
        : "";
      return `- [${item.type}] ${item.title}${claim}${snippet}`;
    });
  const sourceMaterialDetails =
    sourceMaterialLines.length > 0
      ? `- Source material details:\n${sourceMaterialLines.join("\n")}`
      : args.sourceMaterialFallbackLine || null;

  return `
${args.title || "GROUNDING PACKET"}:
- Durable facts: ${packet.durableFacts.join(" | ") || "None"}
- Turn grounding: ${packet.turnGrounding.join(" | ") || "None"}
- Allowed first-person claims: ${packet.allowedFirstPersonClaims.join(" | ") || "None"}
- Allowed numbers: ${packet.allowedNumbers.join(" | ") || "None"}
- Unknowns: ${packet.unknowns.join(" | ") || "None"}
- Source materials: ${packet.sourceMaterials.map((item) => `${item.type}: ${item.title}`).join(" | ") || "None"}
- Voice context hints: ${packet.voiceContextHints?.join(" | ") || "None"}
- Factual authority: ${factualAuthority.join(" | ") || "None"}
${sourceMaterialDetails ? sourceMaterialDetails : ""}

${args.guidanceLines.join("\n")}
  `.trim();
}
