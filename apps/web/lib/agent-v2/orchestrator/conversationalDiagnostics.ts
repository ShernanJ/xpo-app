export interface RecommendedPlaybookSummary {
  id: string;
  name: string;
  whyFit: string;
}

export interface ConversationalDiagnosticContext {
  stage?: string | null;
  knownFor?: string | null;
  reasons: string[];
  nextActions: string[];
  recommendedPlaybooks?: RecommendedPlaybookSummary[];
  includeRoutingTrace?: boolean;
}
