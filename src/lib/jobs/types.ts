/**
 * Background Job Queue abstraction. Phase 1 can run things in-process;
 * this interface lets us swap in a real queue (Redis, etc.) later without
 * touching anything that calls it.
 */

export interface JobPayloadMap {
  "run-monitor-sweep": { scope?: string };
  "run-investigation": { incidentId: string };
  "generate-executive-report": { incidentId: string };
}

export type JobName = keyof JobPayloadMap;

export interface EnqueueOptions {
  delayMs?: number;
  dedupeKey?: string;
  maxAttempts?: number;
}

export interface JobQueue {
  enqueue<TName extends JobName>(
    name: TName,
    payload: JobPayloadMap[TName],
    options?: EnqueueOptions
  ): Promise<{ jobId: string }>;

  registerHandler<TName extends JobName>(
    name: TName,
    handler: (payload: JobPayloadMap[TName]) => Promise<void>
  ): void;

  start(): Promise<void>;
  stop(): Promise<void>;
}