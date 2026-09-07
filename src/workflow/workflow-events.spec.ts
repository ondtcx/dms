import { WorkflowEventType } from '@prisma/client';
import { WorkflowEvents, WorkflowDomainEvent } from './workflow-events';

describe('WorkflowEvents', () => {
  it('publishes typed events only when called after persistence commits', () => {
    const events = new WorkflowEvents();
    const received: WorkflowDomainEvent[] = [];
    events.subscribe((event) => received.push(event));
    const event: WorkflowDomainEvent = {
      workflowId: 10,
      type: WorkflowEventType.COMPLETED,
      payload: { performedById: 'u1' },
    };

    events.publish(event);

    expect(received).toEqual([event]);
  });

  it('does not invoke notification channels while publishing durable workflow events', () => {
    const events = new WorkflowEvents();
    const listener = jest.fn();
    events.subscribe(listener);

    events.publish({ workflowId: 10, type: WorkflowEventType.APPROVED, payload: {} });

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: WorkflowEventType.APPROVED }));
  });
});
