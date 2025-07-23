import { Injectable } from '@angular/core';
import { Subject, Observable, filter } from 'rxjs';
import { IEvent, IEventBus, IEventHandler } from '../interfaces';

/**
 * Event Bus Service - Core of the event-driven architecture
 * Implements publish-subscribe pattern for loose coupling
 */
@Injectable({
  providedIn: 'root'
})
export class EventBusService implements IEventBus {
  private eventStream = new Subject<IEvent>();
  private handlers = new Map<string, Set<IEventHandler<any>>>();

  constructor() {
    console.log('EventBus initialized');
  }

  /**
   * Publish an event to all registered handlers
   */
  publish<T extends IEvent>(event: T): void {
    // Add timestamp if not present
    if (!event.timestamp) {
      event.timestamp = new Date();
    }

    // Add unique ID if not present
    if (!event.id) {
      event.id = this.generateEventId();
    }

    console.log(`Publishing event: ${event.type}`, event);
    
    // Emit to stream for reactive subscribers
    this.eventStream.next(event);

    // Call registered handlers
    const handlers = this.handlers.get(event.type);
    if (handlers) {
      handlers.forEach(handler => {
        if (handler.canHandle(event)) {
          handler.handle(event).subscribe({
            next: () => console.log(`Handler processed event ${event.type}`),
            error: (error) => console.error(`Handler error for event ${event.type}:`, error)
          });
        }
      });
    }
  }

  /**
   * Subscribe a handler to a specific event type
   */
  subscribe<T extends IEvent>(eventType: string, handler: IEventHandler<T>): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler);
    console.log(`Handler subscribed to ${eventType}`);
  }

  /**
   * Unsubscribe a handler from an event type
   */
  unsubscribe(eventType: string, handler: IEventHandler<any>): void {
    const handlers = this.handlers.get(eventType);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.handlers.delete(eventType);
      }
    }
  }

  /**
   * Get observable stream of events (for reactive programming)
   */
  getEventStream<T extends IEvent>(eventType?: string): Observable<T> {
    if (eventType) {
      return this.eventStream.pipe(
        filter(event => event.type === eventType)
      ) as Observable<T>;
    }
    return this.eventStream.asObservable() as Observable<T>;
  }

  /**
   * Get all events of a specific type from the stream
   */
  onEvent<T extends IEvent>(eventType: string): Observable<T> {
    return this.getEventStream<T>(eventType);
  }

  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
