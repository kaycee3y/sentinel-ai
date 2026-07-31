/**
 * Agent Orchestrator
 *
 * Responsibilities (and ONLY these — agents own everything else):
 *   1. Resolve which agents run, and in what order, from their declared
 *      `dependsOn` relationships (a simple DAG, not a generic workflow engine).
 *   2. Build each agent's AgentExecutionContext, including prior results.
 *   3. Enforce per-agent timeout + retry policy.
 *   4. Emit lifecycle events (run.*, agent.*) for real-time consumers.
 *   5. Aggregate results into a single RunResult.
 *
 * The orchestrator does NOT know what "Monitor Agent" or "DataHub" mean —
 * it only knows the AgentDefinition and AgentExecutionContext shapes. New
 * agents register themselves; nothing here needs to change to add one.
 */

import {
  AgentDefinition,
  AgentExecutionContext,
  AgentId,
  AgentLifecycleState,
  AgentResult,
  AgentRunConfig,
  TERMINAL_STATES,
} from "./types";
import type { DataHubService } from "../datahub/types";
import type { AIProviderRegistry } from "../ai/types";
import type { EventBus } from "../events/types";
import type { AgentLogger } from "./types";

export interface OrchestratorDeps {
  datahub: DataHubService;
  aiProviders: AIProviderRegistry;
  events: EventBus;
  logger: AgentLogger;
}

export interface RunOptions {
  incidentId?: string;
  agentIds?: AgentId[];
  config?: Partial<AgentRunConfig>;
  aiProviderOverrides?: Record<AgentId, string>;
}

export interface RunResult {
  runId: string;
  incidentId?: string;
  startedAt: string;
  finishedAt: string;
  status: "success" | "partial" | "failure";
  results: Map<AgentId, AgentResult>;
}

const DEFAULT_CONFIG: AgentRunConfig = {
  timeoutMs: 30_000,
  maxRetries: 1,
};

export class AgentOrchestrator {
  private readonly registry = new Map<AgentId, AgentDefinition>();

  constructor(private readonly deps: OrchestratorDeps) {}

  register(agent: AgentDefinition): void {
    if (this.registry.has(agent.id)) {
      throw new Error(`Agent "${agent.id}" is already registered.`);
    }
    this.registry.set(agent.id, agent);
  }

  async run(options: RunOptions = {}): Promise<RunResult> {
    const runId = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    const config: AgentRunConfig = { ...DEFAULT_CONFIG, ...options.config };

    const agentIds = options.agentIds ?? [...this.registry.keys()];
    const plan = this.buildExecutionPlan(agentIds);

    const results = new Map<AgentId, AgentResult>();
    const states = new Map<AgentId, AgentLifecycleState>(
      agentIds.map((id) => [id, AgentLifecycleState.PENDING])
    );

    await this.deps.events.publish({
      type: "run.started",
      runId,
      incidentId: options.incidentId,
      timestamp: startedAt,
      payload: { agentIds },
    });

    for (const wave of plan) {
      await Promise.all(
        wave.map((agentId) =>
          this.runAgent({
            agentId,
            runId,
            incidentId: options.incidentId,
            config,
            results,
            states,
            aiProviderOverride: options.aiProviderOverrides?.[agentId],
          })
        )
      );
    }

    const finishedAt = new Date().toISOString();
    const status = this.summarizeStatus(results);

    await this.deps.events.publish({
      type: status === "failure" ? "run.failed" : "run.completed",
      runId,
      incidentId: options.incidentId,
      timestamp: finishedAt,
      payload: { status },
    });

    return { runId, incidentId: options.incidentId, startedAt, finishedAt, status, results };
  }

  private buildExecutionPlan(agentIds: AgentId[]): AgentId[][] {
    const remaining = new Set(agentIds);
    const waves: AgentId[][] = [];

    while (remaining.size > 0) {
      const wave = [...remaining].filter((id) => {
        const deps = this.registry.get(id)?.dependsOn ?? [];
        return deps.every((dep) => !remaining.has(dep) || !agentIds.includes(dep));
      });

      if (wave.length === 0) {
        throw new Error(
          `Cannot resolve agent execution order — cycle or missing dependency among: ${[...remaining].join(", ")}`
        );
      }

      wave.forEach((id) => remaining.delete(id));
      waves.push(wave);
    }

    return waves;
  }

  private async runAgent(params: {
    agentId: AgentId;
    runId: string;
    incidentId?: string;
    config: AgentRunConfig;
    results: Map<AgentId, AgentResult>;
    states: Map<AgentId, AgentLifecycleState>;
    aiProviderOverride?: string;
  }): Promise<void> {
    const { agentId, runId, incidentId, config, results, states, aiProviderOverride } = params;
    const definition = this.registry.get(agentId);

    if (!definition) {
      states.set(agentId, AgentLifecycleState.SKIPPED);
      this.deps.logger.warn(`Skipping unregistered agent "${agentId}"`);
      return;
    }

    const failedDep = (definition.dependsOn ?? []).find(
      (dep) => states.get(dep) === AgentLifecycleState.FAILED || states.get(dep) === AgentLifecycleState.TIMED_OUT
    );
    if (failedDep) {
      states.set(agentId, AgentLifecycleState.SKIPPED);
      await this.deps.events.publish({
        type: "agent.skipped",
        runId,
        incidentId,
        timestamp: new Date().toISOString(),
        payload: { agentId, reason: `dependency "${failedDep}" did not succeed` },
      });
      return;
    }

    states.set(agentId, AgentLifecycleState.RUNNING);
    await this.deps.events.publish({
      type: "agent.started",
      runId,
      incidentId,
      timestamp: new Date().toISOString(),
      payload: { agentId },
    });

    const context: AgentExecutionContext = {
      runId,
      incidentId,
      datahub: this.deps.datahub,
      ai: this.deps.aiProviders.get(aiProviderOverride),
      events: this.deps.events,
      logger: this.deps.logger,
      config,
      priorResults: results,
      signal: AbortSignal.timeout(config.timeoutMs),
    };

    const result = await this.executeWithRetry(definition, context, config.maxRetries);
    results.set(agentId, result);
    states.set(
      agentId,
      result.status === "failure" ? AgentLifecycleState.FAILED : AgentLifecycleState.SUCCEEDED
    );

    await this.deps.events.publish({
      type: result.status === "failure" ? "agent.failed" : "agent.completed",
      runId,
      incidentId,
      timestamp: result.finishedAt,
      payload: { agentId, status: result.status, findingCount: result.findings.length },
    });
  }

  private async executeWithRetry(
    definition: AgentDefinition,
    context: AgentExecutionContext,
    maxRetries: number
  ): Promise<AgentResult> {
    let attempt = 0;
    let lastResult: AgentResult | undefined;

    while (attempt <= maxRetries) {
      const startedAt = new Date().toISOString();
      try {
        const input = definition.buildInput
          ? await definition.buildInput(context)
          : undefined;
        const result = await definition.execute(context, input);
        if (result.status !== "failure" || !result.error?.retryable) {
          return result;
        }
        lastResult = result;
      } catch (err) {
        const finishedAt = new Date().toISOString();
        lastResult = {
          agentId: definition.id,
          status: "failure",
          startedAt,
          finishedAt,
          durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
          findings: [],
          error: {
            message: err instanceof Error ? err.message : String(err),
            retryable: true,
          },
        };
      }
      attempt += 1;
    }

    return lastResult!;
  }

  private summarizeStatus(results: Map<AgentId, AgentResult>): RunResult["status"] {
    const statuses = [...results.values()].map((r) => r.status);
    if (statuses.every((s) => s === "success")) return "success";
    if (statuses.some((s) => s === "success" || s === "partial")) return "partial";
    return "failure";
  }
}