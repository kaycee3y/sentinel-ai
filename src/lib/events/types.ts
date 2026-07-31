/**
 * Event Bus decouples "something happened" from "how the UI finds out".
 * Lets us add real-time updates later (WebSockets, SSE) without touching
 * the orchestrator or agents.
 */

export type SentinelEventType =
  | "run.started"
  | "run.completed"
  | "run.failed"
  | "agent.started"
  | "agent.completed"
  | "agent.failed"
  | "agent.skipped"
  | "incident.detected"
  | "incident.updated";

export interface SentinelEvent<TPayload = unknown> {
  type: SentinelEventType;
  runId: string;
  incidentId?: string;
  timestamp: string;
  payload: TPayload;
}

export type EventHandler<TPayload = unknown> = (
  event: SentinelEvent<TPayload>
) => void | Promise<void>;

export interface EventBus {
  publish<TPayload>(event: SentinelEvent<TPayload>): Promise<void>;
  subscribe<TPayload>(
    type: SentinelEventType | "*",
    handler: EventHandler<TPayload>
  ): () => void;
}