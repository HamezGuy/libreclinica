import {onCall, HttpsError} from "firebase-functions/v2/https";
import {Logging} from "@google-cloud/logging";
import * as admin from "firebase-admin";

const logging = new Logging();
const log = logging.log("audit-logs");

interface AuditEntry {
  userId: string;
  userEmail?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  oldValues?: any;
  newValues?: any;
  timestamp: string;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  errorMessage?: string;
  severity: "INFO" | "WARNING" | "ERROR";
}

/**
 * Simple v1 Cloud Function to log audit events with CORS support.
 * @param {https.Request} req The request object.
 * @param {https.Response} res The response object.
 */
export const logAuditEvent = onCall({cors: ["http://localhost:4200", "http://localhost:4201", "http://localhost:4202", "https://www.accuratrials.com"]}, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }

  const auditEntry: AuditEntry = request.data;
  const decodedToken = request.auth.token;

  try {
    const logEntry = log.entry({
      severity: auditEntry.severity || "INFO",
      labels: {
        userId: decodedToken.uid,
        action: auditEntry.action,
        resourceType: auditEntry.resourceType,
      },
      resource: {
        type: "cloud_function",
        labels: {
          function_name: "logAuditEvent",
          project_id: process.env.GCP_PROJECT || "",
          region: process.env.FUNCTION_REGION || "us-central1",
        },
      },
    }, {
      ...auditEntry,
      actualUserId: decodedToken.uid,
      verifiedEmail: decodedToken.email,
    });

    await log.write(logEntry);

    await admin.firestore().collection("audit_logs").add({
      ...auditEntry,
      actualUserId: decodedToken.uid,
      verifiedEmail: decodedToken.email,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {success: true};
  } catch (error) {
    console.error("Error logging audit event:", error);
    throw new HttpsError("internal", "Internal server error");
  }
});

/**
 * Simple query audit logs function.
 * @param {https.Request} req The request object.
 * @param {https.Response} res The response object.
 */
export const queryAuditLogs = onCall({cors: ["http://localhost:4200", "http://localhost:4201", "http://localhost:4202", "https://www.accuratrials.com"]}, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }

  const {userId, action, resourceType, limit = 100} = request.data;

  try {
    let query = admin.firestore().collection("audit_logs")
        .orderBy("timestamp", "desc");

    if (userId) {
      query = query.where("userId", "==", userId);
    }
    if (action) {
      query = query.where("action", "==", action);
    }
    if (resourceType) {
      query = query.where("resourceType", "==", resourceType);
    }

    const snapshot = await query.limit(limit).get();
    const logs = snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));

    return logs;
  } catch (error) {
    console.error("Error querying audit logs:", error);
    throw new HttpsError("internal", "Internal server error");
  }
});

/**
 * Export audit logs function
 */
export const exportAuditLogs = onCall({cors: ["http://localhost:4200", "http://localhost:4201", "http://localhost:4202", "https://www.accuratrials.com"]}, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }

  try {
    const snapshot = await admin.firestore().collection("audit_logs")
        .orderBy("timestamp", "desc").get();
    const logs = snapshot.docs.map((doc) => doc.data() as AuditEntry);

    if (logs.length === 0) {
      return {csv: ""}; // Return empty CSV if no logs
    }

    // Convert to CSV
    const csvRows = [];
    // Ensure consistent header order
    const headers = Object.keys(logs[0]).sort();
    csvRows.push(headers.join(","));

    for (const log of logs) {
      const values = headers.map((header) => {
        const value = log[header as keyof AuditEntry] ?? "";
        const escaped = value.toString().replace(/"/g, '""');
        return `"${escaped}"`;
      });
      csvRows.push(values.join(","));
    }

    const csvString = csvRows.join("\n");

    return {csv: csvString};
  } catch (error) {
    console.error("Error exporting audit logs:", error);
    throw new HttpsError("internal", "Internal server error while exporting logs.");
  }
});
