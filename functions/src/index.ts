/**
 * Cloud Functions for EDC System
 * Handles audit logging, healthcare API integration, and compliance
 */

import { initializeApp } from 'firebase-admin/app';

// Initialize Firebase Admin SDK
initializeApp();

// Export audit logging functions
export {
  logAuditEvent,
  queryAuditLogs,
  exportAuditLogs
} from './audit-logging';

// Export comprehensive Healthcare API functions with audit logging
export {
  createPatient,
  getPatient,
  deletePatientData,
  searchPatients,
  createObservation,
  getPatientObservations,
  createEncounter,
  createConsent,
  validateFhirResource,
  bulkImportFhir,
  exportPatientData
} from './healthcare-api';

console.log('Firebase Functions initialized successfully');
