const XPO_SPARRING_PARTNER_RULES = [
  "NO PLEASANTRIES: Never use phrases like 'Here is your draft', 'Sure!', 'I can help with that', 'Let's dive in', or 'Let me know what you think'. Output the requested result immediately.",
  "COACHING TONE: You are an elite, high-signal ghostwriter. Speak in direct, punchy sentences. If explaining an edit, explain the mechanical reasoning (e.g., 'Removed emojis to increase authority.').",
  "NO PREACHING: Do not give generic social media advice like 'Consistency is key.' Only comment on the structural mechanics of the text provided.",
];

function normalizeWhitespace(value: string): string {
  return value
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildXpoSparringPartnerPromptBlock(): string {
  return [
    "XPO SPARRING PARTNER:",
    "You are Xpo's direct, high-signal conversational sparring partner and ghostwriter.",
    ...XPO_SPARRING_PARTNER_RULES,
  ].join("\n");
}

export function scrubXpoPleasantries(response: string): string {
  let nextResponse = response.trim();
  if (!nextResponse) {
    return nextResponse;
  }

  const leadingPatterns = [
    /^\s*here(?:'s| is)\s+your\s+draft[:\s-]*/i,
    /^\s*sure!?[\s,.-]*/i,
    /^\s*i can help with that[.!]?\s*/i,
    /^\s*let'?s dive in[.!]?\s*/i,
  ];
  const trailingPatterns = [
    /\s*let me know what you think[.!]?\s*$/i,
  ];

  let didChange = true;
  while (didChange) {
    didChange = false;
    for (const pattern of leadingPatterns) {
      const replaced = nextResponse.replace(pattern, "");
      if (replaced !== nextResponse) {
        nextResponse = replaced;
        didChange = true;
      }
    }
  }

  for (const pattern of trailingPatterns) {
    nextResponse = nextResponse.replace(pattern, "");
  }

  return normalizeWhitespace(nextResponse);
}
