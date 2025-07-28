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
  try {
    const userDoc = await admin.firestore().collection("users").doc(userId).get();
    
    if (!userDoc.exists) {
      console.error(`User document not found for userId: ${userId}`);
      // Try to create a default user profile for authenticated users
      const auth = admin.auth();
      try {
        const userRecord = await auth.getUser(userId);
        console.log(`Creating default profile for authenticated user: ${userRecord.email}`);
        
        // Create a default admin profile
        const defaultProfile = {
          uid: userId,
          email: userRecord.email || '',
          displayName: userRecord.displayName || userRecord.email?.split('@')[0] || 'User',
          accessLevel: 'ADMIN', // Default to ADMIN for now
          status: 'ACTIVE',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        
        await admin.firestore().collection("users").doc(userId).set(defaultProfile);
        console.log(`Created default profile for user ${userId}`);
        
        // Return the created profile data
        return defaultProfile;
      } catch (authError) {
        console.error(`Failed to get auth user or create profile: ${authError}`);
        throw new HttpsError("permission-denied", "User document not found and could not create default profile");
      }
    }
    
    const userData = userDoc.data();
    if (!userData) {
      console.error(`User data is null for userId: ${userId}`);
      throw new HttpsError("permission-denied", "User data not found");
    }

    // Log user data for debugging
    console.log(`User ${userId} data:`, {
      accessLevel: userData.accessLevel,
      status: userData.status,
      email: userData.email,
      hasPermissions: !!userData.permissions
    });

    // Fix missing or undefined accessLevel
    if (!userData.accessLevel || userData.accessLevel === 'undefined') {
      console.warn(`User ${userId} has missing or undefined accessLevel, setting to ADMIN`);
      // Update the user document with default ADMIN access
      await admin.firestore().collection("users").doc(userId).update({
        accessLevel: 'ADMIN',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      userData.accessLevel = 'ADMIN';
    }

    // Fix missing status
    if (!userData.status) {
      console.warn(`User ${userId} has no status, setting to ACTIVE`);
      await admin.firestore().collection("users").doc(userId).update({
        status: 'ACTIVE',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      userData.status = 'ACTIVE';
    }

    // Check user status
    if (userData.status !== "ACTIVE") {
      throw new HttpsError("permission-denied", `User account is not active (status: ${userData.status})`);
    }

    // Check access level-based permissions
    const userPermissions = ACCESS_LEVEL_PERMISSIONS[userData.accessLevel];
    if (!userPermissions) {
      console.error(`Invalid access level: ${userData.accessLevel}`);
      // Default to ADMIN if invalid access level
      console.warn(`Setting invalid access level to ADMIN for user ${userId}`);
      await admin.firestore().collection("users").doc(userId).update({
        accessLevel: 'ADMIN',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      userData.accessLevel = 'ADMIN';
      return userData;
    }
    
    // Check if user has the required permission
    // Handle both array-based and object-based permissions
    let hasPermission = false;
    
    if (Array.isArray(userData.permissions)) {
      // Legacy array format
      hasPermission = userData.permissions.includes(action);
    } else if (userData.permissions && typeof userData.permissions === 'object') {
      // New object format with specific permissions
      switch (action) {
        case 'CREATE':
          hasPermission = userData.permissions.canCreateStudy || 
                         userData.permissions.canEditStudy || 
                         userData.accessLevel === 'SUPER_ADMIN' || 
                         userData.accessLevel === 'ADMIN';
          break;
        case 'READ':
          hasPermission = userData.permissions.canViewAllData || 
                         userData.accessLevel === 'SUPER_ADMIN' || 
                         userData.accessLevel === 'ADMIN' ||
                         true; // Everyone can read
          break;
        case 'UPDATE':
          hasPermission = userData.permissions.canEditStudy || 
                         userData.accessLevel === 'SUPER_ADMIN' || 
                         userData.accessLevel === 'ADMIN';
          break;
        case 'DELETE':
          hasPermission = userData.permissions.canDeleteStudy || 
                         userData.accessLevel === 'SUPER_ADMIN' ||
                         (userData.accessLevel === 'ADMIN' && userData.permissions.canDeleteStudy !== false);
          break;
        case 'EXPORT':
          hasPermission = userData.permissions.canExportData || 
                         userData.accessLevel === 'SUPER_ADMIN' || 
                         userData.accessLevel === 'ADMIN';
          break;
        default:
          hasPermission = false;
      }
    } else {
      // No permissions object, use access level permissions
      hasPermission = userPermissions.includes(action);
    }
    
    if (!hasPermission) {
      throw new HttpsError(
        "permission-denied",
        `User with access level ${userData.accessLevel} does not have ${action} permission for ${resourceType}`
      );
    }
    

    return userData;
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    console.error(`Unexpected error in checkUserPermissions: ${error}`);
    throw new HttpsError("internal", "Failed to check user permissions");
  }
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
  console.log(`searchPatients called by user: ${request.auth?.uid}`);
  
  if (!request.auth) {
    console.error("searchPatients: No authentication provided");
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  try {
    // Check user permissions first
    await checkUserPermissions(request.auth.uid, "READ", "Patient");
    console.log(`User ${request.auth.uid} has permission to search patients`);

    // Get authenticated client
    const client = await auth.getClient();
    const fhirStoreName = getFhirStoreName();
    console.log(`Using FHIR store: ${fhirStoreName}`);
    
    const url = `https://healthcare.googleapis.com/v1/${fhirStoreName}/fhir/Patient`;

    // Build search parameters
    const params: any = {};
    if (request.data?.name) params["name"] = request.data.name;
    if (request.data?.identifier) params["identifier"] = request.data.identifier;
    if (request.data?.birthdate) params["birthdate"] = request.data.birthdate;
    if (request.data?.gender) params["gender"] = request.data.gender;
    
    console.log(`Searching patients with params:`, params);

    const response = await client.request({
      url,
      method: "GET",
      params,
    });

    console.log(`Patient search successful, found ${(response.data as any)?.entry?.length || 0} patients`);

    // Log to audit trail
    try {
      await logHealthcareAccess(request.auth.uid, "SEARCH", "Patient", "multiple");
    } catch (auditError) {
      console.error("Failed to log audit trail:", auditError);
      // Don't fail the request if audit logging fails
    }

    return response.data;
  } catch (error: any) {
    console.error("Failed to search patients:", error);
    console.error("Error details:", {
      name: error?.name,
      message: error?.message,
      code: error?.code,
      status: error?.status,
      stack: error?.stack
    });
    
    // Handle specific error types
    if (error instanceof HttpsError) {
      throw error;
    } else if (error?.code === 'ENOTFOUND' || error?.code === 'ECONNREFUSED') {
      throw new HttpsError("unavailable", "Healthcare API service is unavailable");
    } else if (error?.status === 404) {
      throw new HttpsError("not-found", "Healthcare dataset or FHIR store not found. Please check configuration.");
    } else if (error?.status === 403) {
      throw new HttpsError("permission-denied", "Service account lacks permission to access Healthcare API");
    } else if (error?.status === 401) {
      throw new HttpsError("unauthenticated", "Service account authentication failed");
    } else {
      const message = error?.message || "An unknown error occurred while searching patients";
      throw new HttpsError("internal", message);
    }
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

  // Only SUPER_ADMIN can delete
  if (userData.accessLevel !== "SUPER_ADMIN") {
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
