# EDC System Deployment Guide

## Overview

This guide walks through deploying the complete EDC system with:
- Angular frontend on Firebase Hosting
- Cloud Functions for backend logic
- Google Cloud Healthcare API for PHI data
- Firebase Firestore for non-PHI data
- Google Cloud Logging for audit trails

## Prerequisites

1. **Google Cloud Account** with billing enabled
2. **Firebase Project** created (data-entry-project-465905)
3. **Node.js** (v18+) and npm installed
4. **Firebase CLI** installed (`npm install -g firebase-tools`)
5. **Google Cloud SDK** installed

## Step 1: Google Cloud Setup

### 1.1 Enable Required APIs

```bash
# Login to Google Cloud
gcloud auth login

# Set your project
gcloud config set project data-entry-project-465905

# Enable required APIs
gcloud services enable healthcare.googleapis.com
gcloud services enable logging.googleapis.com
gcloud services enable cloudfunctions.googleapis.com
gcloud services enable cloudscheduler.googleapis.com
```

### 1.2 Create Healthcare Dataset and Stores

```bash
# Create Healthcare dataset
gcloud healthcare datasets create edc-clinical-data \
  --location=us-central1

# Create FHIR store
gcloud healthcare fhir-stores create edc-fhir-store \
  --dataset=edc-clinical-data \
  --location=us-central1 \
  --version=R4

# Create Consent store
gcloud healthcare consent-stores create edc-consent-store \
  --dataset=edc-clinical-data \
  --location=us-central1
```

### 1.3 Create Service Account

```bash
# Create service account
gcloud iam service-accounts create edc-healthcare-sa \
  --display-name="EDC Healthcare Service Account"

# Grant Healthcare API permissions
gcloud projects add-iam-policy-binding data-entry-project-465905 \
  --member=serviceAccount:edc-healthcare-sa@data-entry-project-465905.iam.gserviceaccount.com \
  --role=roles/healthcare.fhirResourceEditor

# Grant Logging permissions
gcloud projects add-iam-policy-binding data-entry-project-465905 \
  --member=serviceAccount:edc-healthcare-sa@data-entry-project-465905.iam.gserviceaccount.com \
  --role=roles/logging.logWriter

# Create and download key
gcloud iam service-accounts keys create ./functions/service-account.json \
  --iam-account=edc-healthcare-sa@data-entry-project-465905.iam.gserviceaccount.com
```

### 1.4 Configure Cloud Logging

```bash
# Create log sink for audit logs
gcloud logging sinks create edc-audit-sink \
  storage.googleapis.com/edc-audit-logs \
  --log-filter='logName="projects/data-entry-project-465905/logs/edc-audit"'

# Create bucket for audit log exports
gsutil mb -p data-entry-project-465905 -c STANDARD -l us-central1 gs://edc-audit-logs

# Set retention policy (7 years for FDA compliance)
gsutil retention set 2555d gs://edc-audit-logs
```

## Step 2: Firebase Setup

### 2.1 Initialize Firebase

```bash
# Login to Firebase
firebase login

# Initialize Firebase (if not already done)
firebase init
```

### 2.2 Configure Firebase Authentication

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project (data-entry-project-465905)
3. Go to Authentication → Sign-in method
4. Enable Google provider
5. Add authorized domains (your-domain.com)

### 2.3 Configure Firestore

1. Go to Firestore Database
2. Create database in production mode
3. Choose us-central1 location

### 2.4 Set Firestore Security Rules

```javascript
// firestore.rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Helper functions
    function isAuthenticated() {
      return request.auth != null;
    }
    
    function hasRole(role) {
      return isAuthenticated() && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == role;
    }
    
    function isActive() {
      return isAuthenticated() && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.status == 'ACTIVE';
    }
    
    // User profiles
    match /users/{userId} {
      allow read: if isAuthenticated() && isActive();
      allow write: if hasRole('SUPER_ADMIN') || hasRole('ADMIN');
    }
    
    // Studies (non-PHI)
    match /studies/{studyId} {
      allow read: if isAuthenticated() && isActive();
      allow create: if hasRole('SUPER_ADMIN') || hasRole('ADMIN') || hasRole('INVESTIGATOR');
      allow update: if hasRole('SUPER_ADMIN') || hasRole('ADMIN') || hasRole('INVESTIGATOR') || hasRole('DATA_ENTRY');
      allow delete: if hasRole('SUPER_ADMIN');
    }
    
    // Form templates
    match /formTemplates/{templateId} {
      allow read: if isAuthenticated() && isActive();
      allow write: if hasRole('SUPER_ADMIN') || hasRole('ADMIN');
    }
    
    // Audit logs (critical events only)
    match /auditLogs/{logId} {
      allow read: if hasRole('SUPER_ADMIN') || hasRole('ADMIN') || hasRole('MONITOR');
      allow write: if false; // Only Cloud Functions can write
    }
  }
}
```

## Step 3: Deploy Cloud Functions

### 3.1 Install Dependencies

```bash
cd functions
npm install
```

### 3.2 Set Environment Variables

```bash
# Set Healthcare API configuration
firebase functions:config:set healthcare.project_id="data-entry-project-465905"
firebase functions:config:set healthcare.location="us-central1"
firebase functions:config:set healthcare.dataset_id="edc-clinical-data"
firebase functions:config:set healthcare.fhir_store_id="edc-fhir-store"
firebase functions:config:set healthcare.consent_store_id="edc-consent-store"
```

### 3.3 Deploy Functions

```bash
# Build TypeScript
npm run build

# Deploy all functions
firebase deploy --only functions

# Or deploy specific functions
firebase deploy --only functions:logAuditEvent,functions:createPatient
```

## Step 4: Deploy Angular Application

### 4.1 Update Environment Files

Create `src/environments/environment.prod.ts`:

```typescript
export const environment = {
  production: true,
  firebase: {
    projectId: 'data-entry-project-465905',
    appId: 'YOUR_APP_ID',
    storageBucket: 'data-entry-project-465905.firebasestorage.app',
    apiKey: 'YOUR_API_KEY',
    authDomain: 'data-entry-project-465905.firebaseapp.com',
    messagingSenderId: 'YOUR_SENDER_ID',
  },
  functionsUrl: 'https://us-central1-data-entry-project-465905.cloudfunctions.net'
};
```

### 4.2 Build Angular App

```bash
# Install dependencies
npm install

# Build for production
npm run build -- --configuration production
```

### 4.3 Deploy to Firebase Hosting

```bash
# Deploy hosting
firebase deploy --only hosting
```

## Step 5: Post-Deployment Configuration

### 5.1 Create Initial Super Admin

1. Have the super admin sign in with Google
2. Manually update their Firestore document:

```bash
# Using Firebase Admin SDK or Firestore console
{
  "role": "SUPER_ADMIN",
  "status": "ACTIVE",
  "termsAcceptedAt": Timestamp.now(),
  "privacyAcceptedAt": Timestamp.now(),
  "trainingCompleted": true,
  "trainingCompletedAt": Timestamp.now()
}
```

### 5.2 Configure Monitoring

```bash
# Create alert for failed authentications
gcloud alpha monitoring policies create \
  --notification-channels=YOUR-CHANNEL-ID \
  --display-name="EDC Failed Authentication Alert" \
  --condition-filter='resource.type="cloud_function"
    AND metric.type="cloudfunctions.googleapis.com/function/execution_count"
    AND resource.label.function_name="logAuditEvent"
    AND metric.label.status="error"'
```

### 5.3 Set Up Scheduled Exports

```bash
# Create daily audit log export
gcloud scheduler jobs create http audit-export \
  --location=us-central1 \
  --schedule="0 2 * * *" \
  --uri="https://us-central1-data-entry-project-465905.cloudfunctions.net/exportAuditLogs" \
  --http-method=POST \
  --oidc-service-account-email=edc-healthcare-sa@data-entry-project-465905.iam.gserviceaccount.com
```

## Step 6: Verification Checklist

### 6.1 Authentication
- [ ] Google Sign-In works
- [ ] Session timeout after 30 minutes
- [ ] Audit logs created for login/logout

### 6.2 Healthcare API
- [ ] Can create patients in FHIR store
- [ ] Can retrieve patient data
- [ ] PHI data properly separated

### 6.3 Audit Logging
- [ ] Logs appear in Cloud Logging
- [ ] Critical events in Firestore
- [ ] Export to Cloud Storage works

### 6.4 Security
- [ ] Firestore rules enforced
- [ ] Role-based access working
- [ ] HTTPS enforced on all endpoints

## Step 7: Compliance Documentation

### 7.1 Generate Compliance Reports

```bash
# Export audit logs for compliance review
gsutil cp -r gs://edc-audit-logs/2024-* ./compliance-reports/

# Generate user access report
firebase firestore:export gs://edc-compliance-exports/users
```

### 7.2 Document for FDA Inspection

Create the following documents:
1. System Architecture Diagram
2. Data Flow Diagram (PHI vs non-PHI)
3. User Access Matrix
4. Audit Trail Validation Report
5. Disaster Recovery Plan

## Troubleshooting

### Common Issues

1. **Healthcare API Permission Denied**
   - Check service account has correct roles
   - Verify API is enabled
   - Check dataset/store names match

2. **Cloud Functions Timeout**
   - Increase timeout in function configuration
   - Check for infinite loops
   - Verify external API connectivity

3. **Audit Logs Not Appearing**
   - Check Cloud Logging API enabled
   - Verify service account permissions
   - Check log filter syntax

### Debug Commands

```bash
# View function logs
firebase functions:log

# Test Healthcare API connection
gcloud healthcare fhir-stores describe edc-fhir-store \
  --dataset=edc-clinical-data \
  --location=us-central1

# Check service account permissions
gcloud projects get-iam-policy data-entry-project-465905 \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:edc-healthcare-sa@*"
```

## Maintenance

### Regular Tasks

1. **Weekly**
   - Review audit logs for anomalies
   - Check system performance metrics
   - Verify backup completion

2. **Monthly**
   - Update dependencies
   - Review user access
   - Test disaster recovery

3. **Quarterly**
   - Security audit
   - Compliance review
   - Performance optimization

## Support

For issues or questions:
1. Check logs in Cloud Console
2. Review error messages in browser console
3. Contact: support@your-edc-system.com
