import { WorkflowEventType } from '@prisma/client';

export interface WorkflowDomainEvent {
  workflowId: number;
  type: WorkflowEventType;
  payload: Record<string, unknown>;
}

export type WorkflowEventListener = (event: WorkflowDomainEvent) => void;

export class WorkflowEvents {
  private readonly listeners = new Set<WorkflowEventListener>();

  subscribe(listener: WorkflowEventListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish(event: WorkflowDomainEvent) {
    this.listeners.forEach((listener) => listener(event));
  }
}
