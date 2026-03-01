/**
 * Branded types for type-safe IDs in the AOS dashboard.
 *
 * Prevents accidental mixing of different ID types at compile time
 * with zero runtime cost (Brand is erased by TypeScript compiler).
 *
 * @example
 * function assignTask(agent: AgentId, task: TaskId): void { ... }
 * assignTask(TaskId("t1"), AgentId("a1")) // TS error!
 */

declare const __brand: unique symbol;

/**
 * Generic branded type utility.
 * Creates a nominal type from a structural one.
 */
type Brand<T, B extends string> = T & { readonly [__brand]: B };

// ─── Branded ID Types ──────────────────────────────────────────

export type AgentId = Brand<string, 'AgentId'>;
export type TaskId = Brand<string, 'TaskId'>;
export type SessionId = Brand<string, 'SessionId'>;
export type ProjectId = Brand<string, 'ProjectId'>;

// ─── Constructor Functions ─────────────────────────────────────

/** Create a type-safe AgentId from a string. */
export const asAgentId = (s: string): AgentId => s as AgentId;

/** Create a type-safe TaskId from a string. */
export const asTaskId = (s: string): TaskId => s as TaskId;

/** Create a type-safe SessionId from a string. */
export const asSessionId = (s: string): SessionId => s as SessionId;

/** Create a type-safe ProjectId from a string. */
export const asProjectId = (s: string): ProjectId => s as ProjectId;

// ─── Type Guards ───────────────────────────────────────────────

/** Check if a value is a non-empty string (basic ID validation). */
export const isValidId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;
