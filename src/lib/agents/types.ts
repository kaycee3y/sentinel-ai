/**
 * Sentinel AI — Agent Contracts
 *
 * This file defines the shape every agent in the system must conform to.
 * Agents are intentionally "dumb" about orchestration, they receive a
 * context, do one job, and return a structured result. All coordination
 * logic lives in the Orchestrator, not here.
 */

import type { DataHubService } from "../datahub/types";
import type { AIProvider } from "../ai/types";
import type { EventBus } from "../events/types";

// ---------------------------------------------------------------------------
// Agent identity
// ---------------------------------------------------------------------------

export type AgentId = string;

export const CORE_AGENT_IDS = {
  MONITOR: "monitor-agent",
  INVESTIGATION: "investigation-agent",
  IMPACT_ANALYSIS: "impact-analysis-agent",
  RECOMMENDATION: "recommendation-agent",
  EXECUTIVE_REPORT: "executive-report-agent",
} as const;

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export enum AgentLifecycleState {
  PENDING = "pending",
  RUNNING = "running",
  SUCCEEDED = "succeeded",
  FAILED = "failed",
  SKIPPED = "skipped",
  TIMED_OUT = "timed_out",
}

export const TERMINAL_STATES: ReadonlySet<AgentLifecycleState> = new Set([
  AgentLifecycleState.SUCCEEDED,
  AgentLifecycleState.FAILED,
  AgentLifecycleState.SKIPPED,
  AgentLifecycleState.TIMED_OUT,
]);

// ---------------------------------------------------------------------------
// Shared execution context
// ---------------------------------------------------------------------------

export interface AgentExecutionContext {
  runId: string;
  incidentId?: string;

  datahub: DataHubService;
  ai: AIProvider;
  events: EventBus;
  logger: AgentLogger;

  config: Readonly<AgentRunConfig>;

  priorResults: ReadonlyMap<AgentId, AgentResult>;

  signal: AbortSignal;
}

export interface AgentRunConfig {
  timeoutMs: number;
  maxRetries: number;
  agentOptions?: Record<string, unknown>;
}

export interface AgentLogger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

// ---------------------------------------------------------------------------
// Findings the common currency agents pass between each other
// ---------------------------------------------------------------------------

export type FindingSeverity = "info" | "low" | "medium" | "high" | "critical";

export interface AgentFinding {
  id: string;
  summary: string;
  detail?: string;
  severity: FindingSeverity;
  relatedUrns?: string[];
  confidence?: number;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Agent result
// ---------------------------------------------------------------------------

export type AgentResultStatus = "success" | "partial" | "failure";

export interface AgentResult<TData = unknown> {
  agentId: AgentId;
  status: AgentResultStatus;
  startedAt: string;
  finishedAt: string;
  durationMs: number;

  findings: AgentFinding[];
  data?: TData;

  error?: {
    message: string;
    code?: string;
    retryable: boolean;
  };

  suggestedNextAgents?: AgentId[];
}

// ---------------------------------------------------------------------------
// The Agent interface itself
// ---------------------------------------------------------------------------

export interface AgentDefinition<TInput = unknown, TOutput = unknown> {
  id: AgentId;
  name: string;
  description: string;

  dependsOn?: AgentId[];

  buildInput?: (context: AgentExecutionContext) => TInput | Promise<TInput>;

  execute: (
    context: AgentExecutionContext,
    input: TInput
  ) => Promise<AgentResult<TOutput>>;
}