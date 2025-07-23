import { IEvent } from '../core/interfaces';

/**
 * Event published when a form template is updated.
 * This is critical for 21 CFR Part 11 audit trails.
 */
export interface FormTemplateUpdatedEvent extends IEvent {
  type: 'FORM_TEMPLATE_UPDATED';
  templateId: string;
  userId: string;
  version: number;
  changes: any; // In a real scenario, this would contain a diff of the changes.
}
