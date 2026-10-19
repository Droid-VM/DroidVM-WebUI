import type { components } from '../../../generated/api'

export type EventCursor = components['schemas']['EventCursor']
export type EventNotification = components['schemas']['EventNotification']
export interface EventAccess {
  context: components['schemas']['ServerContext']
  csrfToken: string
}
export interface EventGateway {
  access(): EventAccess | null
  connect(
    access: EventAccess,
    cursor: EventCursor | null,
    receive: (message: EventNotification) => void,
    closed: (policy: boolean) => void,
  ): () => void
  reauthenticate(): void
}
