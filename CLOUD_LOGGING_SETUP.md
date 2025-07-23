# Google Cloud Logging Setup for EDC Audit Trail

## Why Cloud Logging for Audit Trails?

For **21 CFR Part 11 compliance**, audit trails MUST be:
- **Immutable**: Cannot be modified or deleted
- **Secure**: Protected from tampering
- **Time-stamped**: Server-side timestamps
- **Complete**: Capture all relevant actions
- **Accessible**: Available for FDA inspection

Firebase Firestore does NOT meet these requirements because:
- Documents can be updated/deleted
- Client-side timestamps can be manipulated
- No built-in tamper protection

**Google Cloud Logging** provides:
- Immutable log entries
- Cryptographic integrity
- Server-side timestamps
- Long-term retention
- Export capabilities
- FDA-compliant audit trails

## Setup Steps

### 1. Enable Required APIs

```bash
# Enable Cloud Logging API
gcloud services enable logging.googleapis.com

# Enable Cloud Functions API
gcloud services enable cloudfunctions.googleapis.com

# Enable Cloud Scheduler API (for log exports)
gcloud services enable cloudscheduler.googleapis.com
```

### 2. Set Up Service Account Permissions

```bash
# Create a service account for Cloud Functions
gcloud iam service-accounts create edc-audit-logger \
  --display-name="EDC Audit Logger"

# Grant necessary permissions
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:edc-audit-logger@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/logging.logWriter"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:edc-audit-logger@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/logging.viewer"
```

### 3. Deploy Cloud Functions

```bash
# Initialize Firebase Functions
cd functions
npm install

# Install Cloud Logging dependencies
npm install @google-cloud/logging firebase-functions firebase-admin

# Deploy the audit logging functions
firebase deploy --only functions:logAuditEvent,functions:queryAuditLogs,functions:exportAuditLogs
```

### 4. Create Log Sink for Long-term Storage

```bash
# Create a Cloud Storage bucket for audit exports
gsutil mb -p YOUR_PROJECT_ID -c STANDARD -l US gs://YOUR_PROJECT_ID-audit-exports

# Create a log sink
gcloud logging sinks create edc-audit-export \
  storage.googleapis.com/YOUR_PROJECT_ID-audit-exports \
  --log-filter='logName="projects/YOUR_PROJECT_ID/logs/edc-audit-trail"'
```

### 5. Set Retention Policy

```bash
# Set 7-year retention for audit logs (FDA requirement)
gcloud logging buckets update _Default \
  --location=global \
  --retention-days=2555
```

### 6. Configure Log-based Metrics

Create metrics for monitoring critical events:

```bash
# Failed login attempts
gcloud logging metrics create failed_logins \
  --description="Failed login attempts" \
  --log-filter='resource.type="cloud_function"
  AND jsonPayload.action="AUTH_LOGIN_FAILED"'

# Data deletions
gcloud logging metrics create data_deletions \
  --description="Data deletion events" \
  --log-filter='resource.type="cloud_function"
  AND jsonPayload.action=~"DATA_DELETE"'
```

### 7. Set Up Alerts

```bash
# Create alert for suspicious activity
gcloud alpha monitoring policies create \
  --notification-channels=YOUR_CHANNEL_ID \
  --display-name="Suspicious EDC Activity" \
  --condition-display-name="Multiple failed logins" \
  --condition-filter='metric.type="logging.googleapis.com/user/failed_logins"
  AND resource.type="cloud_function"'
```

## Integration with Angular App

### Update Environment Files

Add Cloud Functions URL to your environment:

```typescript
export const environment = {
  production: false,
  firebase: {
    // ... existing config
  },
  cloudFunctions: {
    url: 'https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net'
  }
};
```

### Update App Module

```typescript
import { provideFunctions, getFunctions } from '@angular/fire/functions';

export const appConfig: ApplicationConfig = {
  providers: [
    // ... existing providers
    provideFunctions(() => getFunctions()),
  ]
};
```

## Audit Log Schema

Each audit log entry contains:

```typescript
{
  // User Context
  userId: string;
  userEmail: string;
  authUid: string;
  
  // Action Details
  action: string;
  resourceType: string;
  resourceId?: string;
  details: string;
  
  // Metadata
  timestamp: string;        // Server-side ISO timestamp
  ipAddress: string;       // Captured server-side
  userAgent: string;       // Browser info
  requestId: string;       // Unique request ID
  
  // Compliance
  compliance: {
    standard: '21CFR11';
    dataIntegrity: true;
    timeSource: 'server';
    immutable: true;
  }
}
```

## Compliance Verification

### 1. Test Immutability

```bash
# Try to delete a log entry (should fail)
gcloud logging entries delete \
  --log-filter='logName="projects/YOUR_PROJECT_ID/logs/edc-audit-trail"'
# This will prompt for confirmation but entries older than 7 days cannot be deleted
```

### 2. Verify Retention

```bash
# Check retention settings
gcloud logging buckets describe _Default --location=global
```

### 3. Export Audit Trail

```bash
# Export logs for FDA inspection
gcloud logging read \
  'logName="projects/YOUR_PROJECT_ID/logs/edc-audit-trail" 
  AND timestamp>="2024-01-01T00:00:00Z"' \
  --format=json > audit_trail_export.json
```

## Monitoring Dashboard

Create a dashboard in Cloud Console:

1. Go to Cloud Logging → Logs Explorer
2. Create saved queries for:
   - Authentication events
   - Data modifications
   - User management
   - Compliance actions
3. Pin to dashboard

## Cost Optimization

- First 50 GB/month of logs ingestion: Free
- Additional ingestion: $0.50/GB
- Storage: $0.01/GB/month
- Exports to Cloud Storage: Free

Estimate for typical EDC system:
- 1000 users × 50 actions/day × 1 KB/entry = 50 MB/day
- Monthly: ~1.5 GB = ~$0.75/month

## Security Best Practices

1. **Encryption**: All logs encrypted at rest and in transit
2. **Access Control**: Use IAM roles to restrict access
3. **VPC Service Controls**: Restrict API access
4. **Audit Log Access**: Log all queries to audit logs
5. **Regular Reviews**: Monthly audit log reviews

## FDA Inspection Readiness

Prepare these for FDA inspections:

1. **Audit Trail Report**: Export last 12 months
2. **Access Log**: Who accessed audit trails
3. **Integrity Verification**: Cryptographic proof
4. **Retention Policy**: 7-year retention documentation
5. **Security Controls**: IAM policies and access logs
