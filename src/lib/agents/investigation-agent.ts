/**
 * Investigation Agent — traces DataHub lineage for signals raised by the
 * Monitor Agent and uses the AI provider to hypothesize root cause.
 */

import { AgentDefinition, AgentFinding, AgentExecutionContext, CORE_AGENT_IDS } from "./types";
import type { EntityDetail, LineageResult, DatasetQuery } from "../datahub/types";

interface InvestigationAgentInput {
  suspiciousUrns: string[];
}

interface RootCauseHypothesis {
  urn: string;
  hypothesis: string;
  confidence: number;
  upstreamCulprits: string[];
}

interface InvestigationAgentOutput {
  hypotheses: RootCauseHypothesis[];
}

export const investigationAgent: AgentDefinition<InvestigationAgentInput, InvestigationAgentOutput> = {
  id: CORE_AGENT_IDS.INVESTIGATION,
  name: "Investigation Agent",
  description:
    "Traces DataHub lineage and query history for signals raised by the Monitor Agent to hypothesize root cause.",
  dependsOn: [CORE_AGENT_IDS.MONITOR],

  buildInput: (context) => {
    const monitorResult = context.priorResults.get(CORE_AGENT_IDS.MONITOR);
    const data = monitorResult?.data as { suspiciousUrns?: string[] } | undefined;
    return { suspiciousUrns: data?.suspiciousUrns ?? [] };
  },

  async execute(context, input) {
    const startedAt = new Date().toISOString();

    if (input.suspiciousUrns.length === 0) {
      const finishedAt = new Date().toISOString();
      return {
        agentId: investigationAgent.id,
        status: "success" as const,
        startedAt,
        finishedAt,
        durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
        findings: [],
        data: { hypotheses: [] },
        suggestedNextAgents: [],
      };
    }

    const findings: AgentFinding[] = [];
    const hypotheses: RootCauseHypothesis[] = [];
    const failures: string[] = [];

    for (const urn of input.suspiciousUrns) {
      if (context.signal.aborted) {
        context.logger.warn("Investigation Agent aborted mid-run", { urn });
        break;
      }

      try {
        const [entity, lineage, queries] = await Promise.all([
          context.datahub.getEntity(urn),
          context.datahub.getLineage({ urn, direction: "upstream", maxHops: 3 }),
          context.datahub.getDatasetQueries(urn),
        ]);

        const hypothesis = await hypothesizeRootCause(context, { urn, entity, lineage, queries });
        hypotheses.push(hypothesis);

        findings.push({
          id: `investigation-${urn}`,
          summary: hypothesis.hypothesis,
          severity: severityFromConfidence(hypothesis.confidence),
          relatedUrns: [urn, ...hypothesis.upstreamCulprits],
          confidence: hypothesis.confidence,
          metadata: { upstreamNodeCount: lineage.nodes.length },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        context.logger.error("Investigation failed for asset", { urn, message });
        failures.push(urn);
      }
    }

    const finishedAt = new Date().toISOString();
    const status =
      failures.length === 0 ? "success" : hypotheses.length > 0 ? "partial" : "failure";

    return {
      agentId: investigationAgent.id,
      status: status as "success" | "partial" | "failure",
      startedAt,
      finishedAt,
      durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
      findings,
      data: { hypotheses },
      error:
        failures.length > 0
          ? { message: `Failed to investigate ${failures.length} asset(s): ${failures.join(", ")}`, retryable: true }
          : undefined,
      suggestedNextAgents: hypotheses.length > 0 ? [CORE_AGENT_IDS.IMPACT_ANALYSIS] : [],
    };
  },
};

function severityFromConfidence(confidence: number): AgentFinding["severity"] {
  if (confidence >= 0.85) return "critical";
  if (confidence >= 0.65) return "high";
  if (confidence >= 0.4) return "medium";
  return "low";
}

async function hypothesizeRootCause(
  context: AgentExecutionContext,
  params: { urn: string; entity: EntityDetail | null; lineage: LineageResult; queries: DatasetQuery[] }
): Promise<RootCauseHypothesis> {
  const { urn, entity, lineage, queries } = params;

  const upstreamSummary =
    lineage.nodes
      .filter((n) => n.urn !== urn)
      .slice(0, 15)
      .map((n) => `- ${n.name} [${n.urn}] (${n.platform ?? "unknown platform"})`)
      .join("\n") || "No upstream lineage found in DataHub.";

  const querySummary =
    queries.length > 0
      ? `${queries.length} known queries; most recent at ${queries[0]?.lastExecutedAt ?? "unknown time"}.`
      : "No query history available.";

  const prompt = `You are investigating a potential data incident on asset "${entity?.name ?? urn}" (${urn}).

Upstream lineage (${lineage.nodes.length} total nodes, showing up to 15):
${upstreamSummary}

Query history: ${querySummary}
Owners: ${entity?.owners.map((o) => o.name).join(", ") || "unknown"}
Tags: ${entity?.tags.join(", ") || "none"}

Based only on this context, hypothesize the most likely root cause of a data quality or freshness incident on this asset. Identify which upstream asset(s), if any, are most likely responsible.

Respond with ONLY valid JSON in this exact shape, no prose outside the JSON:
{"hypothesis": string, "confidence": number between 0 and 1, "upstreamCulprits": string[] of URNs from the lineage list above}`;

  const completion = await context.ai.complete(
    [
      {
        role: "system",
        content:
          "You are a precise data-incident root-cause analyst for a data platform team. You reason only from the context provided and never invent asset names or URNs not present in the input. You always respond with valid JSON only.",
      },
      { role: "user", content: prompt },
    ],
    { responseFormat: "json", maxTokens: 500, temperature: 0.2, signal: context.signal }
  );

  return parseHypothesis(urn, completion.content);
}

function parseHypothesis(urn: string, raw: string): RootCauseHypothesis {
  try {
    const parsed = JSON.parse(raw) as {
      hypothesis?: string;
      confidence?: number;
      upstreamCulprits?: string[];
    };
    return {
      urn,
      hypothesis: parsed.hypothesis ?? "Model returned no hypothesis text.",
      confidence: clamp01(parsed.confidence ?? 0),
      upstreamCulprits: Array.isArray(parsed.upstreamCulprits) ? parsed.upstreamCulprits : [],
    };
  } catch {
    return {
      urn,
      hypothesis: "Unable to parse AI root-cause analysis; manual review recommended.",
      confidence: 0,
      upstreamCulprits: [],
    };
  }
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}