import {onCall, HttpsError, CallableRequest} from "firebase-functions/v2/https";
// import { getFirestore } from 'firebase-admin/firestore';
import * as admin from "firebase-admin";
import {GoogleAuth} from "google-auth-library";

// Firebase Admin is initialized in index.ts
// Firestore database instance would be used here if needed
// const db = getFirestore();

// Initialize Google Healthcare API Authentication
const auth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});

// Healthcare API configuration
const HEALTHCARE_CONFIG = {
  projectId: process.env.GCLOUD_PROJECT || "data-entry-project-465905",
  location: "us-central1",
  datasetId: "edc-clinical-data",
  fhirStoreId: "edc-fhir-store",
  dicomStoreId: "edc-dicom-store",
  consentStoreId: "edc-consent-store",
};

// Helper function to get FHIR store name
const getFhirStoreName = () => {
  const {projectId, location, datasetId, fhirStoreId} = HEALTHCARE_CONFIG;
  return `projects/${projectId}/locations/${location}/datasets/${datasetId}/fhirStores/${fhirStoreId}`;
};

// Permission mapping for different user access levels
const ACCESS_LEVEL_PERMISSIONS: Record<string, string[]> = {
  SUPER_ADMIN: ["CREATE", "READ", "UPDATE", "DELETE", "EXPORT"],
  ADMIN: ["CREATE", "READ", "UPDATE", "DELETE", "EXPORT"],
  INVESTIGATOR: ["CREATE", "READ", "UPDATE"],
  MONITOR: ["READ", "EXPORT"],
  DATA_ENTRY: ["CREATE", "READ", "UPDATE"],
  VIEWER: ["READ"],
};

// Helper function to check user permissions
const checkUserPermissions = async (userId: string, action: string, resourceType: string) => {
  const userDoc = await admin.firestore().collection("users").doc(userId).get();
  const userData = userDoc.data();

  if (!userData) {
    throw new HttpsError("permission-denied", "User not found");
  }

  // Check user status
  if (userData.status !== "ACTIVE") {
    throw new HttpsError("permission-denied", "User account is not active");
  }

  // Check access level-based permissions
  const userPermissions = ACCESS_LEVEL_PERMISSIONS[userData.accessLevel];
  if (!userPermissions || !userPermissions.includes(action)) {
    throw new HttpsError(
      "permission-denied",
      `User access level ${userData.accessLevel} does not have ${action} permission for ${resourceType}`
    );
  }

  return userData;
};

/**
 * Create a new patient in FHIR store
 */
export const createPatient = onCall({
  cors: ["http://localhost:4200", "http://localhost:4201", "http://localhost:4202", "https://www.accuratrials.com"],
}, async (request: CallableRequest<Record<string, unknown>>) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  await checkUserPermissions(request.auth.uid, "CREATE", "Patient");

  try {
    const client = await auth.getClient();
    const url = `https://healthcare.googleapis.com/v1/${getFhirStoreName()}/fhir/Patient`;

    const response = await client.request({
      url,
      method: "POST",
      headers: {
        "Content-Type": "application/fhir+json",
      },
      data: request.data,
    });

    // Log to audit trail
    await logHealthcareAccess(request.auth.uid, "CREATE", "Patient", (response.data as any).id);

    return response.data;
  } catch (error) {
    console.error("Failed to create patient:", error);
    const message = error instanceof Error ? error.message : "An unknown error occurred";
    throw new HttpsError("internal", message);
  }
});

/**
 * Get patient by ID
 */
export const getPatient = onCall({
  cors: ["http://localhost:4200", "http://localhost:4201", "http://localhost:4202", "https://www.accuratrials.com"],
}, async (request: CallableRequest<{patientId: string}>) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  await checkUserPermissions(request.auth.uid, "READ", "Patient");

  try {
    const client = await auth.getClient();
    const url = `https://healthcare.googleapis.com/v1/${getFhirStoreName()}/fhir/Patient/${request.data.patientId}`;

    const response = await client.request({
      url,
      method: "GET",
    });

    // Log to audit trail
    await logHealthcareAccess(request.auth.uid, "READ", "Patient", request.data.patientId);

    return response.data;
  } catch (error) {
    console.error("Failed to get patient:", error);
    const message = error instanceof Error ? error.message : "An unknown error occurred";
    throw new HttpsError("internal", message);
  }
});

/**
 * Search patients
 */
export const searchPatients = onCall({
  cors: ["http://localhost:4200", "http://localhost:4201", "http://localhost:4202", "https://www.accuratrials.com"],
}, async (request: CallableRequest<Record<string, string>>) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  await checkUserPermissions(request.auth.uid, "READ", "Patient");

  try {
    const client = await auth.getClient();
    const url = `https://healthcare.googleapis.com/v1/${getFhirStoreName()}/fhir/Patient`;

    // Build search parameters
    const params: any = {};
    if (request.data.name) params["name"] = request.data.name;
    if (request.data.identifier) params["identifier"] = request.data.identifier;
    if (request.data.birthdate) params["birthdate"] = request.data.birthdate;
    if (request.data.gender) params["gender"] = request.data.gender;

    const response = await client.request({
      url,
      method: "GET",
      params,
    });

    // Log to audit trail
    await logHealthcareAccess(request.auth.uid, "SEARCH", "Patient", "multiple");

    return response.data;
  } catch (error) {
    console.error("Failed to search patients:", error);
    const message = error instanceof Error ? error.message : "An unknown error occurred";
    throw new HttpsError("internal", message);
  }
});

/**
 * Create observation (lab results, vitals, etc.)
 */
export const createObservation = onCall({
  cors: ["http://localhost:4200", "http://localhost:4201", "http://localhost:4202", "https://www.accuratrials.com"],
}, async (request: CallableRequest<Record<string, unknown>>) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  await checkUserPermissions(request.auth.uid, "CREATE", "Observation");

  try {
    const client = await auth.getClient();
    const url = `https://healthcare.googleapis.com/v1/${getFhirStoreName()}/fhir/Observation`;

    // Add performer reference to current user
    const observationData = {
      ...request.data,
      performer: [{
        reference: `Practitioner/${request.auth.uid}`,
        display: request.auth.token?.email || "Unknown",
      }],
    };

    const response = await client.request({
      url,
      method: "POST",
      headers: {
        "Content-Type": "application/fhir+json",
      },
      data: observationData,
    });

    // Log to audit trail
    await logHealthcareAccess(request.auth.uid, "CREATE", "Observation", (response.data as any).id);

    return response.data;
  } catch (error) {
    console.error("Failed to create observation:", error);
    const message = error instanceof Error ? error.message : "An unknown error occurred";
    throw new HttpsError("internal", message);
  }
});

/**
 * Get patient observations
 */
export const getPatientObservations = onCall({
  cors: ["http://localhost:4200", "http://localhost:4201", "http://localhost:4202", "https://www.accuratrials.com"],
}, async (request: CallableRequest<{patientId: string}>) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  await checkUserPermissions(request.auth.uid, "READ", "Observation");

  try {
    const client = await auth.getClient();
    const url = `https://healthcare.googleapis.com/v1/${getFhirStoreName()}/fhir/Observation`;

    const response = await client.request({
      url,
      method: "GET",
      params: {
        subject: `Patient/${request.data.patientId}`,
      },
    });

    // Log to audit trail
    await logHealthcareAccess(request.auth.uid, "READ", "Observation", request.data.patientId);

    return response.data;
  } catch (error) {
    console.error("Failed to get observations:", error);
    const message = error instanceof Error ? error.message : "An unknown error occurred";
    throw new HttpsError("internal", message);
  }
});

/**
 * Create encounter
 */
export const createEncounter = onCall({
  cors: ["http://localhost:4200", "http://localhost:4201", "http://localhost:4202", "https://www.accuratrials.com"],
}, async (request: CallableRequest<Record<string, unknown>>) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  await checkUserPermissions(request.auth.uid, "CREATE", "Encounter");

  try {
    const client = await auth.getClient();
    const url = `https://healthcare.googleapis.com/v1/${getFhirStoreName()}/fhir/Encounter`;

    const response = await client.request({
      url,
      method: "POST",
      headers: {
        "Content-Type": "application/fhir+json",
      },
      data: request.data,
    });

    // Log to audit trail
    await logHealthcareAccess(request.auth.uid, "CREATE", "Encounter", (response.data as any).id);

    return response.data;
  } catch (error) {
    console.error("Failed to create encounter:", error);
    const message = error instanceof Error ? error.message : "An unknown error occurred";
    throw new HttpsError("internal", message);
  }
});

/**
 * Create consent record
 */
export const createConsent = onCall({
  cors: ["http://localhost:4200", "http://localhost:4201", "http://localhost:4202", "https://www.accuratrials.com"],
}, async (request: CallableRequest<Record<string, unknown>>) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  await checkUserPermissions(request.auth.uid, "CREATE", "Consent");

  try {
    const client = await auth.getClient();
    const url = `https://healthcare.googleapis.com/v1/${getFhirStoreName()}/fhir/Consent`;

    const response = await client.request({
      url,
      method: "POST",
      headers: {
        "Content-Type": "application/fhir+json",
      },
      data: request.data,
    });

    // Log to audit trail
    await logHealthcareAccess(request.auth.uid, "CREATE", "Consent", (response.data as any).id);

    return response.data;
  } catch (error) {
    console.error("Failed to create consent:", error);
    const message = error instanceof Error ? error.message : "An unknown error occurred";
    throw new HttpsError("internal", message);
  }
});

/**
 * Export patient data (GDPR/CCPA compliance)
 */
export const exportPatientData = onCall({
  cors: ["http://localhost:4200", "http://localhost:4201", "http://localhost:4202", "https://www.accuratrials.com"],
}, async (request: CallableRequest<{patientId: string}>) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  await checkUserPermissions(request.auth.uid, "EXPORT", "Patient");

  try {
    const client = await auth.getClient();
    const exportData: any = {};

    // Get all patient resources
    const resourceTypes = ["Patient", "Observation", "Encounter", "Condition", "Procedure", "MedicationRequest"];

    for (const resourceType of resourceTypes) {
      const url = `https://healthcare.googleapis.com/v1/${getFhirStoreName()}/fhir/${resourceType}`;
      const params = resourceType === "Patient" ?
        {_id: request.data.patientId} :
        {subject: `Patient/${request.data.patientId}`};

      const response = await client.request({
        url,
        method: "GET",
        params,
      });

      if ((response.data as any).entry) {
        exportData[resourceType] = (response.data as any).entry.map((e: any) => e.resource);
      }
    }

    // Log to audit trail
    await logHealthcareAccess(request.auth.uid, "EXPORT", "Patient", request.data.patientId);

    return exportData;
  } catch (error) {
    console.error("Failed to export patient data:", error);
    const message = error instanceof Error ? error.message : "An unknown error occurred";
    throw new HttpsError("internal", message);
  }
});

/**
 * Delete patient data (restricted operation)
 */
export const deletePatientData = onCall({
  cors: ["http://localhost:4200", "http://localhost:4201", "http://localhost:4202", "https://www.accuratrials.com"],
}, async (request: CallableRequest<{patientId: string, reason: string}>) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  const userData = await checkUserPermissions(request.auth.uid, "DELETE", "Patient");

  // Only super_admin can delete
  if (userData.role !== "super_admin") {
    throw new HttpsError("permission-denied", "Only super administrators can delete patient data");
  }

  try {
    const client = await auth.getClient();
    const url = `https://healthcare.googleapis.com/v1/${getFhirStoreName()}/fhir/Patient/${request.data.patientId}`;

    // Delete patient and all related resources
    // Note: In production, this should be a soft delete with retention period
    await client.request({
      url,
      method: "DELETE",
    });

    // Log to audit trail with reason
    await logHealthcareAccess(
      request.auth.uid,
      "DELETE",
      "Patient",
      request.data.patientId,
      {reason: request.data.reason, deletedAt: new Date().toISOString()}
    );

    return {success: true};
  } catch (error) {
    console.error("Failed to delete patient data:", error);
    const message = error instanceof Error ? error.message : "An unknown error occurred";
    throw new HttpsError("internal", message);
  }
});

/**
 * Validate FHIR resource
 */
export const validateFhirResource = onCall({
  cors: ["http://localhost:4200", "http://localhost:4201", "http://localhost:4202", "https://www.accuratrials.com"],
}, async (request: CallableRequest<Record<string, unknown>>) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  try {
    const client = await auth.getClient();
    const url = `https://healthcare.googleapis.com/v1/${getFhirStoreName()}/fhir/${request.data.resourceType}/$validate`;

    const response = await client.request({
      url,
      method: "POST",
      headers: {
        "Content-Type": "application/fhir+json",
      },
      data: request.data,
    });

    return {valid: true, result: response.data};
  } catch (error) {
    console.error("Validation failed:", error);
    const message = error instanceof Error ? error.message : "An unknown error occurred";
    return {
      valid: false,
      errors: [message],
    };
  }
});

/**
 * Bulk import FHIR resources
 */
export const bulkImportFhir = onCall({
  cors: ["http://localhost:4200", "http://localhost:4201", "http://localhost:4202", "https://www.accuratrials.com"],
}, async (request: CallableRequest<any[]>) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  await checkUserPermissions(request.auth.uid, "CREATE", "BulkImport");

  const results = {
    success: 0,
    failed: 0,
    errors: [] as any[],
  };

  try {
    const client = await auth.getClient();

    for (const resource of request.data) {
      try {
        const url = `https://healthcare.googleapis.com/v1/${getFhirStoreName()}/fhir/${resource.resourceType}`;

        await client.request({
          url,
          method: "POST",
          headers: {
            "Content-Type": "application/fhir+json",
          },
          data: resource,
        });
        results.success++;
      } catch (error: any) {
        results.failed++;
        results.errors.push({
          resource: resource.id || "unknown",
          error: error.message,
        });
      }
    }

    // Log to audit trail
    await logHealthcareAccess(
      request.auth.uid,
      "BULK_IMPORT",
      "Multiple",
      `${results.success} resources`,
      {success: results.success, failed: results.failed}
    );

    return results;
  } catch (error) {
    console.error("Bulk import failed:", error);
    const message = error instanceof Error ? error.message : "An unknown error occurred";
    throw new HttpsError("internal", message);
  }
});

/**
 * Helper function to log Healthcare API access
 */
async function logHealthcareAccess(
  userId: string,
  action: string,
  resourceType: string,
  resourceId: string,
  metadata?: any
) {
  // Log to Firestore for quick access
  await admin.firestore().collection("healthcare_access_logs").add({
    userId,
    action,
    resourceType,
    resourceId,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    metadata,
  });

  // Also log to Cloud Logging for immutable audit trail
  // This would call the audit logging function
}
