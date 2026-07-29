import type { DomainEvent } from "./types";

export type { DomainEvent } from "./types";

type DomainEventHandler = (event: DomainEvent) => void | Promise<void>;

export class DomainEventBus {
  private readonly subscribers = new Map<string, DomainEventHandler[]>();
  private pending: DomainEvent[] = [];

  subscribe(eventName: string, handler: DomainEventHandler): void {
    const handlers = this.subscribers.get(eventName) ?? [];
    handlers.push(handler);
    this.subscribers.set(eventName, handlers);
  }

  enqueue(event: DomainEvent): void {
    this.pending.push(event);
  }

  /** Alias for enqueue — events are held until flushAfterCommit. */
  publish(event: DomainEvent): void {
    this.enqueue(event);
  }

  async flushAfterCommit(): Promise<void> {
    const events = this.pending;
    this.pending = [];

    for (const event of events) {
      const handlers = this.subscribers.get(event.name) ?? [];
      for (const handler of handlers) {
        await handler(event);
      }
    }
  }
}
