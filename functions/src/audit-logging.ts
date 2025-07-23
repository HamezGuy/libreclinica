import * as functions from 'firebase-functions';
import { Logging } from '@google-cloud/logging';
import * as admin from 'firebase-admin';

// Initialize Cloud Logging
const logging = new Logging();
const log = logging.log('edc-audit-trail');

// Metadata for all audit logs
const AUDIT_METADATA = {
  resource: {
    type: 'cloud_function',
    labels: {
      function_name: 'edc-audit-logger',
      project_id: process.env.GCLOUD_PROJECT,
      region: 'us-central1'
    }
  },
  severity: 'INFO'
};

/**
 * Cloud Function to write immutable audit logs to Google Cloud Logging
 * This ensures 21 CFR Part 11 compliance for audit trails
 */
export const logAuditEvent = functions
  .runWith({
    memory: '256MB',
    timeoutSeconds: 60
  })
  .https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be authenticated to log audit events'
    );
  }

  try {
    // Capture server-side metadata
    const serverMetadata = {
      serverTimestamp: new Date().toISOString(),
      authUid: context.auth.uid,
      authToken: context.auth.token,
      ipAddress: context.rawRequest.ip || 'unknown',
      userAgent: context.rawRequest.headers['user-agent'] || 'unknown',
      requestId: context.rawRequest.headers['x-request-id'] || generateRequestId()
    };

    // Construct the audit entry
    const auditEntry = {
      // User provided data
      userId: data.userId || context.auth.uid,
      userEmail: data.userEmail || context.auth.token.email,
      action: data.action,
      resourceType: data.resourceType,
      resourceId: data.resourceId,
      details: data.details,
      clientMetadata: data.metadata,
      
      // Server captured data (tamper-proof)
      ...serverMetadata,
      
      // Compliance metadata
      compliance: {
        standard: '21CFR11',
        dataIntegrity: true,
        timeSource: 'server',
        immutable: true
      }
    };

    // Create the log entry
    const metadata = {
      ...AUDIT_METADATA,
      severity: data.severity || 'INFO',
      labels: {
        userId: auditEntry.userId,
        action: auditEntry.action,
        resourceType: auditEntry.resourceType
      }
    };

    const entry = log.entry(metadata, auditEntry);

    // Write to Cloud Logging (immutable)
    await log.write(entry);

    // Also store critical events in Firestore for quick access
    // (but Cloud Logging remains the source of truth)
    if (isCriticalEvent(data.action)) {
      await admin.firestore().collection('audit_summary').add({
        ...auditEntry,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    return { success: true, requestId: serverMetadata.requestId };
  } catch (error) {
    console.error('Failed to write audit log:', error);
    throw new functions.https.HttpsError(
      'internal',
      'Failed to write audit log'
    );
  }
});

/**
 * Cloud Function to query audit logs from Google Cloud Logging
 * Requires appropriate permissions
 */
export const queryAuditLogs = functions.https.onCall(async (data, context) => {
  // Verify authentication and permissions
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be authenticated to query audit logs'
    );
  }

  // Check user permissions (only admins and auditors can query logs)
  const userDoc = await admin.firestore()
    .collection('users')
    .doc(context.auth.uid)
    .get();
  
  const userData = userDoc.data();
  if (!userData || !['admin', 'auditor', 'monitor'].includes(userData.role)) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Insufficient permissions to query audit logs'
    );
  }

  try {
    // Build the query filter
    const filters = [];
    
    // Time range filter
    const startDate = data.startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Default: last 7 days
    const endDate = data.endDate || new Date();
    filters.push(`timestamp >= "${startDate.toISOString()}"`);
    filters.push(`timestamp <= "${endDate.toISOString()}"`);
    
    // User filter
    if (data.userId) {
      filters.push(`labels.userId="${data.userId}"`);
    }
    
    // Action filter
    if (data.action) {
      filters.push(`labels.action="${data.action}"`);
    }
    
    // Resource type filter
    if (data.resourceType) {
      filters.push(`labels.resourceType="${data.resourceType}"`);
    }
    
    // Severity filter
    if (data.severity) {
      filters.push(`severity="${data.severity}"`);
    }

    const filter = filters.join(' AND ');

    // Query Cloud Logging
    const [entries] = await log.getEntries({
      filter,
      pageSize: data.limit || 100,
      orderBy: 'timestamp desc'
    });

    // Format and return the results
    const results = entries.map(entry => ({
      id: entry.id,
      ...entry.data,
      timestamp: entry.metadata.timestamp
    }));

    // Log the query itself for audit purposes
    await logAuditEvent({
      action: 'AUDIT_LOG_QUERY',
      resourceType: 'AUDIT_LOGS',
      details: `User ${context.auth.uid} queried audit logs with filter: ${filter}`,
      metadata: { filter, resultCount: results.length }
    }, context);

    return results;
  } catch (error) {
    console.error('Failed to query audit logs:', error);
    throw new functions.https.HttpsError(
      'internal',
      'Failed to query audit logs'
    );
  }
});

/**
 * Scheduled function to export audit logs for long-term retention
 * Runs daily at 2 AM
 */
export const exportAuditLogs = functions.pubsub
  .schedule('0 2 * * *')
  .timeZone('America/New_York')
  .onRun(async () => {
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      const dateStr = yesterday.toISOString().split('T')[0];
      const exportPath = `gs://${process.env.GCLOUD_PROJECT}-audit-exports/${dateStr}/`;
      
      // Export logs to Cloud Storage for long-term retention
      await logging.sink('edc-audit-export').create({
        destination: exportPath,
        filter: `logName="projects/${process.env.GCLOUD_PROJECT}/logs/edc-audit-trail" AND timestamp >= "${yesterday.toISOString()}"`,
        outputVersionFormat: 'V2'
      });
      
      console.log(`Exported audit logs for ${dateStr} to ${exportPath}`);
    } catch (error) {
      console.error('Failed to export audit logs:', error);
    }
  });

/**
 * Helper function to determine if an event is critical
 */
function isCriticalEvent(action: string): boolean {
  const criticalActions = [
    'USER_DELETE',
    'DATA_DELETE',
    'ROLE_CHANGE',
    'PERMISSION_CHANGE',
    'ELECTRONIC_SIGNATURE',
    'COMPLIANCE_VIOLATION',
    'SECURITY_BREACH',
    'LOGIN_FAILED'
  ];
  
  return criticalActions.some(critical => action.includes(critical));
}

/**
 * Generate a unique request ID
 */
function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
