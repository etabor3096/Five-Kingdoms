/**
 * A Durable Object has a single alarm, so we keep a small list of named deadlines in
 * storage and always point the alarm at the earliest one. All functions are pure.
 */

export interface Deadline {
  /** Unique name, e.g. `pause` or `expiry`. Setting an existing id replaces it. */
  id: string;
  /** Epoch milliseconds. */
  at: number;
}

export type Schedule = readonly Deadline[];

/** Adds a deadline, replacing any existing one with the same id. */
export function setDeadline(schedule: Schedule, id: string, at: number): Schedule {
  return [...schedule.filter((d) => d.id !== id), { id, at }];
}

/** Removes the deadline with this id, if present. */
export function clearDeadline(schedule: Schedule, id: string): Schedule {
  return schedule.filter((d) => d.id !== id);
}

/** The time the alarm should fire, or `null` when nothing is scheduled. */
export function nextAlarmTime(schedule: Schedule): number | null {
  return schedule.length === 0 ? null : Math.min(...schedule.map((d) => d.at));
}

/** Splits the schedule into deadlines that have passed (earliest first) and those still ahead. */
export function takeDue(schedule: Schedule, now: number): { due: Deadline[]; rest: Deadline[] } {
  const due = schedule.filter((d) => d.at <= now).sort((a, b) => a.at - b.at);
  return { due, rest: schedule.filter((d) => d.at > now) };
}
