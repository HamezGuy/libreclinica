import { BaseEvent } from "../services/event-bus.service";

// Event for when a user accepts the terms of service and privacy policy.
export interface ComplianceTermsAcceptedEvent extends BaseEvent {
  type: 'COMPLIANCE_TERMS_ACCEPTED';
  userId: string;
  ipAddress: string;
  userAgent: string;
}

// Event for when a user completes all required training modules.
export interface ComplianceTrainingCompletedEvent extends BaseEvent {
  type: 'COMPLIANCE_TRAINING_COMPLETED';
  userId: string;
  modulesCompleted: number;
}
