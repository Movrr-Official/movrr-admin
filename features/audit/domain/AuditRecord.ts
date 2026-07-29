export type AuditRecordInput = {
  actorUserId: string;
  actorEmail: string | null;
  principalType: string;
  capability?: string;
  targetEntityType: string;
  targetEntityId: string;
  previousState?: unknown;
  resultingState?: unknown;
  correlationId: string;
  reason?: string;
};

export type AuditRecord = AuditRecordInput & {
  id: string;
  createdAt: string;
};
