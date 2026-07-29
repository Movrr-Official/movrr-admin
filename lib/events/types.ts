export interface DomainEvent<TPayload = unknown> {
  name: string;
  occurredAt: string;
  correlationId: string;
  payload: TPayload;
}
