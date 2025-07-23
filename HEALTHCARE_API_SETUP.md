# Google Cloud Healthcare API Setup for EDC System

## Architecture Overview

This EDC system uses a **hybrid architecture** for optimal compliance and performance:

### Data Separation Strategy

1. **PHI (Protected Health Information) → Google Healthcare API**
   - Patient demographics
   - Clinical data (diagnoses, medications, lab results)
   - Medical images
   - All HIPAA-defined identifiers
   - Stored in FHIR format for interoperability

2. **Non-PHI Data → Firebase Firestore**
   - Study metadata
   - Form templates
   - User accounts and roles
   - System configuration
   - De-identified analytics

### Why This Architecture?

- **Healthcare API**: HIPAA-compliant, BAA available, built-in encryption
- **Firebase**: Fast, real-time, cost-effective for non-sensitive data
- **Separation**: Minimizes PHI exposure, reduces compliance scope

## Setup Steps

### 1. Enable Healthcare API

```bash
# Enable the Healthcare API
gcloud services enable healthcare.googleapis.com

# Enable required dependencies
gcloud services enable cloudresourcemanager.googleapis.com
gcloud services enable iam.googleapis.com
```

### 2. Create Healthcare Dataset

```bash
# Create a dataset for your EDC system
gcloud healthcare datasets create edc-clinical-data \
  --location=us-central1

# Set IAM policy for the dataset
gcloud healthcare datasets add-iam-policy-binding edc-clinical-data \
  --location=us-central1 \
  --member=serviceAccount:YOUR-SERVICE-ACCOUNT@YOUR-PROJECT.iam.gserviceaccount.com \
  --role=roles/healthcare.datasetAdmin
```

### 3. Create FHIR Store

```bash
# Create FHIR store for clinical data
gcloud healthcare fhir-stores create edc-fhir-store \
  --dataset=edc-clinical-data \
  --location=us-central1 \
  --version=R4 \
  --enable-update-create \
  --disable-referential-integrity \
  --enable-history-modifications

# Configure FHIR store settings
gcloud healthcare fhir-stores update edc-fhir-store \
  --dataset=edc-clinical-data \
  --location=us-central1 \
  --pubsub-topic=projects/YOUR-PROJECT/topics/fhir-notifications
```

### 4. Create Consent Store

```bash
# Create consent store for patient consent management
gcloud healthcare consent-stores create edc-consent-store \
  --dataset=edc-clinical-data \
  --location=us-central1 \
  --default-consent-ttl=365d \
  --enable-consent-create-on-update
```

### 5. Create DICOM Store (if medical imaging needed)

```bash
# Create DICOM store for medical images
gcloud healthcare dicom-stores create edc-dicom-store \
  --dataset=edc-clinical-data \
  --location=us-central1 \
  --notification-pubsub-topic=projects/YOUR-PROJECT/topics/dicom-notifications
```

### 6. Set Up Service Account

```bash
# Create service account for Healthcare API access
gcloud iam service-accounts create edc-healthcare-sa \
  --display-name="EDC Healthcare Service Account"

# Grant necessary roles
gcloud projects add-iam-policy-binding YOUR-PROJECT \
  --member=serviceAccount:edc-healthcare-sa@YOUR-PROJECT.iam.gserviceaccount.com \
  --role=roles/healthcare.fhirResourceEditor

gcloud projects add-iam-policy-binding YOUR-PROJECT \
  --member=serviceAccount:edc-healthcare-sa@YOUR-PROJECT.iam.gserviceaccount.com \
  --role=roles/healthcare.consentEditor

# Create and download key
gcloud iam service-accounts keys create ./functions/service-account.json \
  --iam-account=edc-healthcare-sa@YOUR-PROJECT.iam.gserviceaccount.com
```

### 7. Configure Access Controls

```bash
# Set up fine-grained access controls
# Data Entry users - can create but not delete
gcloud healthcare fhir-stores add-iam-policy-binding edc-fhir-store \
  --dataset=edc-clinical-data \
  --location=us-central1 \
  --member=group:data-entry@yourdomain.com \
  --role=roles/healthcare.fhirResourceEditor

# Monitors - read-only access
gcloud healthcare fhir-stores add-iam-policy-binding edc-fhir-store \
  --dataset=edc-clinical-data \
  --location=us-central1 \
  --member=group:monitors@yourdomain.com \
  --role=roles/healthcare.fhirResourceReader

# Admins - full access
gcloud healthcare fhir-stores add-iam-policy-binding edc-fhir-store \
  --dataset=edc-clinical-data \
  --location=us-central1 \
  --member=group:admins@yourdomain.com \
  --role=roles/healthcare.fhirStoreAdmin
```

## FHIR Resources for EDC

### Patient Resource
```json
{
  "resourceType": "Patient",
  "identifier": [{
    "system": "https://your-edc-system.com/patient-id",
    "value": "12345"
  }],
  "name": [{
    "use": "official",
    "family": "Doe",
    "given": ["John", "A"]
  }],
  "gender": "male",
  "birthDate": "1980-01-15",
  "address": [{
    "use": "home",
    "line": ["123 Main St"],
    "city": "Mumbai",
    "state": "Maharashtra",
    "postalCode": "400001",
    "country": "IN"
  }]
}
```

### Observation Resource (for clinical data)
```json
{
  "resourceType": "Observation",
  "status": "final",
  "code": {
    "coding": [{
      "system": "http://loinc.org",
      "code": "8302-2",
      "display": "Body height"
    }]
  },
  "subject": {
    "reference": "Patient/12345"
  },
  "effectiveDateTime": "2024-01-15T10:30:00+05:30",
  "valueQuantity": {
    "value": 175,
    "unit": "cm",
    "system": "http://unitsofmeasure.org",
    "code": "cm"
  }
}
```

### Consent Resource
```json
{
  "resourceType": "Consent",
  "status": "active",
  "scope": {
    "coding": [{
      "system": "http://terminology.hl7.org/CodeSystem/consentscope",
      "code": "research"
    }]
  },
  "category": [{
    "coding": [{
      "system": "http://loinc.org",
      "code": "59284-0",
      "display": "Consent Document"
    }]
  }],
  "patient": {
    "reference": "Patient/12345"
  },
  "dateTime": "2024-01-15T09:00:00+05:30",
  "policy": [{
    "uri": "https://your-edc-system.com/privacy-policy"
  }],
  "provision": {
    "type": "permit",
    "period": {
      "start": "2024-01-15",
      "end": "2025-01-15"
    }
  }
}
```

## Security Best Practices

### 1. Encryption
- **At Rest**: Automatic AES-256 encryption
- **In Transit**: TLS 1.2+ required
- **Field-level**: Use Cloud KMS for additional encryption

### 2. Access Logging
```bash
# Enable audit logs for Healthcare API
gcloud logging sinks create healthcare-audit-sink \
  storage.googleapis.com/YOUR-AUDIT-BUCKET \
  --log-filter='protoPayload.serviceName="healthcare.googleapis.com"'
```

### 3. VPC Service Controls
```bash
# Create VPC perimeter for Healthcare API
gcloud access-context-manager perimeters create edc-healthcare-perimeter \
  --resources=projects/YOUR-PROJECT-NUMBER \
  --restricted-services=healthcare.googleapis.com \
  --title="EDC Healthcare Perimeter"
```

### 4. Data Residency
- Choose appropriate region for data residency requirements
- For India: Use `asia-south1` (Mumbai) or `asia-south2` (Delhi)

## Monitoring and Compliance

### 1. Set Up Monitoring
```bash
# Create alerts for unauthorized access
gcloud alpha monitoring policies create \
  --notification-channels=YOUR-CHANNEL \
  --display-name="Healthcare API Unauthorized Access" \
  --condition-display-name="403 Errors" \
  --condition-filter='resource.type="healthcare.googleapis.com/FhirStore"
  AND protoPayload.status.code=403'
```

### 2. Export for Compliance
```bash
# Export FHIR data for audits
gcloud healthcare fhir-stores export gcs edc-fhir-store \
  --dataset=edc-clinical-data \
  --location=us-central1 \
  --gcs-uri=gs://YOUR-EXPORT-BUCKET/fhir-export/
```

### 3. Backup Strategy
```bash
# Create automated backups
gcloud scheduler jobs create http fhir-backup \
  --schedule="0 2 * * *" \
  --uri="https://healthcare.googleapis.com/v1/projects/YOUR-PROJECT/locations/us-central1/datasets/edc-clinical-data/fhirStores/edc-fhir-store:export" \
  --http-method=POST \
  --message-body='{"gcsDestination":{"uriPrefix":"gs://YOUR-BACKUP-BUCKET/backup/"}}'
```

## Cost Optimization

### Estimated Costs (per month)
- **FHIR Operations**: $0.32 per 1,000 operations
- **Storage**: $0.39 per GB
- **Consent Store**: $0.50 per 1,000 consents

### Cost Saving Tips
1. Use batch operations for bulk imports
2. Enable request coalescing
3. Implement client-side caching
4. Use Firebase for non-PHI queries

## Integration with Firebase

### Hybrid Queries
```typescript
// Example: Get study participants with demographics
async getStudyParticipants(studyId: string) {
  // 1. Get participant IDs from Firebase (non-PHI)
  const participants = await getFirebaseParticipants(studyId);
  
  // 2. Get demographics from Healthcare API (PHI)
  const demographics = await Promise.all(
    participants.map(p => getPatientFromHealthcareAPI(p.patientId))
  );
  
  // 3. Combine and return
  return participants.map((p, i) => ({
    ...p,
    demographics: demographics[i]
  }));
}
```

## Compliance Checklist

- [ ] Sign BAA with Google Cloud
- [ ] Configure data residency requirements
- [ ] Enable audit logging
- [ ] Set up access controls
- [ ] Configure consent management
- [ ] Implement data retention policies
- [ ] Set up automated backups
- [ ] Configure monitoring and alerts
- [ ] Document data flow for audits
- [ ] Test disaster recovery procedures

## Support and Resources

- [Healthcare API Documentation](https://cloud.google.com/healthcare-api/docs)
- [FHIR R4 Specification](https://www.hl7.org/fhir/)
- [HIPAA Compliance Guide](https://cloud.google.com/security/compliance/hipaa)
- [Healthcare API Pricing](https://cloud.google.com/healthcare-api/pricing)
