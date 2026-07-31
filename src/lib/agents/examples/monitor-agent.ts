/**
 * Reference implementation — shows how a concrete agent implements
 * AgentDefinition using only the abstractions (DataHubService, AIProvider)
 * injected via context.
 */

import { AgentDefinition, AgentResult, CORE_AGENT_IDS } from "../types";

interface MonitorAgentInput {
  lookbackMins: number;
}

interface MonitorAgentOutput {
  suspiciousUrns: string[];
}

export const monitorAgent: AgentDefinition<MonitorAgentInput, MonitorAgentOutput> = {
  id: CORE_AGENT_IDS.MONITOR,
  name: "Monitor Agent",
  description: "Scans DataHub for freshness, volume, and quality signals that indicate an incident.",
  dependsOn: [],

  buildInput: (context) => ({
    lookbackMins: (context.config.agentOptions?.[CORE_AGENT_IDS.MONITOR] as { lookbackMins?: number })
      ?.lookbackMins ?? 60,
  }),

  async execute(context, input): Promise<AgentResult<MonitorAgentOutput>> {
    const startedAt = new Date().toISOString();

    const candidates = await context.datahub.search({
      query: "hasFailingAssertion:true OR freshnessSla:violated",
      limit: 25,
    });

    const suspiciousUrns = candidates.map((c) => c.urn);

    const finishedAt = new Date().toISOString();
    return {
      agentId: monitorAgent.id,
      status: "success",
      startedAt,
      finishedAt,
      durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
      findings: candidates.map((c) => ({
        id: c.urn,
        summary: `Signal detected on ${c.name}`,
        severity: "medium",
        relatedUrns: [c.urn],
      })),
      data: { suspiciousUrns },
      suggestedNextAgents: suspiciousUrns.length > 0 ? [CORE_AGENT_IDS.INVESTIGATION] : [],
    };
  },
};