/**
 * Study Patient Reference Model
 * This model represents the reference to a patient within a study's patients subcollection
 * The actual patient data is stored in the main patients collection
 */
export interface StudyPatientReference {
  patientId: string; // Reference to the patient document in the patients collection
  patientNumber: string; // Study-specific patient number for quick reference
  enrollmentDate: Date;
  status: 'screening' | 'enrolled' | 'active' | 'completed' | 'withdrawn' | 'discontinued';
  treatmentArm?: string;
  siteId?: string;
  addedBy: string;
  addedAt: Date;
}
