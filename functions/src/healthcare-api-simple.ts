import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin
initializeApp();
const db = getFirestore();

// Permission mapping for different user roles
const ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: ['CREATE', 'READ', 'UPDATE', 'DELETE', 'EXPORT'],
  admin: ['CREATE', 'READ', 'UPDATE', 'EXPORT'],
  investigator: ['CREATE', 'READ', 'UPDATE'],
  monitor: ['READ', 'EXPORT'],
  data_entry: ['CREATE', 'READ', 'UPDATE'],
  viewer: ['READ']
};

// Helper function to check user permissions
const checkUserPermissions = async (userId: string, action: string, resourceType: string) => {
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();

  if (!userData) {
    throw new HttpsError('permission-denied', 'User not found');
  }

  // Check user status
  if (userData.status !== 'ACTIVE') {
    throw new HttpsError('permission-denied', 'User account is not active');
  }

  // Check role-based permissions
  const userPermissions = ROLE_PERMISSIONS[userData.role];
  if (!userPermissions || !userPermissions.includes(action)) {
    throw new HttpsError(
      'permission-denied', 
      `User role ${userData.role} does not have ${action} permission for ${resourceType}`
    );
  }

  return userData;
};

// Simplified patient creation (stores in Firestore instead of Healthcare API)
export const createPatientSimple = onCall(
  { cors: true },
  async (request: CallableRequest<{
    name: string;
    identifier: string;
    birthdate: string;
    gender: string;
  }>) => {
    try {
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      const userId = request.auth.uid;
      await checkUserPermissions(userId, 'CREATE', 'Patient');

      const { name, identifier, birthdate, gender } = request.data;

      // Create patient record in Firestore
      const patientRef = await db.collection('patients').add({
        name,
        identifier,
        birthdate,
        gender,
        createdAt: new Date(),
        createdBy: userId,
        status: 'active'
      });

      return {
        success: true,
        patientId: patientRef.id,
        message: 'Patient created successfully'
      };

    } catch (error: any) {
      console.error('Error creating patient:', error);
      throw new HttpsError('internal', error.message || 'Failed to create patient');
    }
  }
);

// Simplified observation creation
export const createObservationSimple = onCall(
  { cors: true },
  async (request: CallableRequest<{
    patientId: string;
    code: string;
    value: any;
    effectiveDateTime: string;
  }>) => {
    try {
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      const userId = request.auth.uid;
      await checkUserPermissions(userId, 'CREATE', 'Observation');

      const { patientId, code, value, effectiveDateTime } = request.data;

      // Create observation record in Firestore
      const observationRef = await db.collection('observations').add({
        patientId,
        code,
        value,
        effectiveDateTime,
        createdAt: new Date(),
        createdBy: userId,
        status: 'final'
      });

      return {
        success: true,
        observationId: observationRef.id,
        message: 'Observation created successfully'
      };

    } catch (error: any) {
      console.error('Error creating observation:', error);
      throw new HttpsError('internal', error.message || 'Failed to create observation');
    }
  }
);

// Get patient data
export const getPatientSimple = onCall(
  { cors: true },
  async (request: CallableRequest<{ patientId: string }>) => {
    try {
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      const userId = request.auth.uid;
      await checkUserPermissions(userId, 'READ', 'Patient');

      const { patientId } = request.data;
      const patientDoc = await db.collection('patients').doc(patientId).get();

      if (!patientDoc.exists) {
        throw new HttpsError('not-found', 'Patient not found');
      }

      return {
        success: true,
        patient: patientDoc.data(),
        message: 'Patient retrieved successfully'
      };

    } catch (error: any) {
      console.error('Error getting patient:', error);
      throw new HttpsError('internal', error.message || 'Failed to get patient');
    }
  }
);
