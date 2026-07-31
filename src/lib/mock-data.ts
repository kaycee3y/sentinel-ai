import { AgentFinding, AgentResult } from "./agents/types";

// Mock Data for the Dashboard
export const mockIncidents: AgentResult[] = [
  {
    agentId: "monitor-agent-01",
    status: "success",
    startedAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(), // 15 mins ago
    finishedAt: new Date().toISOString(),
    durationMs: 1200,
    findings: [
      {
        id: "fnd_001",
        summary: "High latency detected in production core-events pipeline",
        severity: "critical",
        relatedUrns: ["urn:li:dataset:(urn:li:dataPlatform:kafka,core-events,PROD)"],
      }
    ]
  },
  {
    agentId: "monitor-agent-02",
    status: "success",
    startedAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), // 2 hours ago
    finishedAt: new Date().toISOString(),
    durationMs: 850,
    findings: [
      {
        id: "fnd_002",
        summary: "Unexpected schema mutation in users_v2 table",
        severity: "medium",
        relatedUrns: ["urn:li:dataset:(urn:li:dataPlatform:snowflake,users_v2,PROD)"],
      }
    ]
  },
  {
    agentId: "monitor-agent-03",
    status: "success",
    startedAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), // 1 day ago
    finishedAt: new Date().toISOString(),
    durationMs: 920,
    findings: [
      {
        id: "fnd_003",
        summary: "Daily dbt run skipped for analytics_marts",
        severity: "high",
        relatedUrns: ["urn:li:dataset:(urn:li:dataPlatform:dbt,analytics_marts,PROD)"],
      }
    ]
  }
];