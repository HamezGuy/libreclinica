# EDC System Architecture - Class Diagrams

## 1. Authentication & User Management System

```mermaid
classDiagram
    class EdcCompliantAuthService {
        -firestore: Firestore
        -auth: Auth
        -zone: NgZone
        -router: Router
        -auditService: CloudAuditService
        +currentUser$: Observable~User~
        +isAuthenticated$: Observable~boolean~
        +userRole$: Observable~string~
        +login(email, password): Promise~void~
        +logout(): Promise~void~
        +register(userData): Promise~void~
        +validateSession(): boolean
        +enforcePasswordPolicy(password): boolean
        +trackLoginAttempt(email, success): void
        +enforceAccountLockout(email): void
    }

    class UserManagementService {
        -firestore: Firestore
        -authService: EdcCompliantAuthService
        -auditService: CloudAuditService
        +getUsers(): Observable~User[]~
        +getUserById(id): Observable~User~
        +updateUser(id, data): Promise~void~
        +deleteUser(id): Promise~void~
        +assignRole(userId, role): Promise~void~
        +getUserPermissions(userId): Observable~Permission[]~
        +enforceDataAccess(userId, resource): boolean
    }

    class OrganizationService {
        -firestore: Firestore
        -authService: EdcCompliantAuthService
        +organizations$: Observable~Organization[]~
        +createOrganization(data): Promise~string~
        +updateOrganization(id, data): Promise~void~
        +getOrganizationUsers(orgId): Observable~User[]~
        +assignUserToOrganization(userId, orgId): Promise~void~
    }

    EdcCompliantAuthService --> UserManagementService
    UserManagementService --> OrganizationService
    EdcCompliantAuthService --> CloudAuditService
```

## 2. Patient Management System

```mermaid
classDiagram
    class PatientService {
        -firestore: Firestore
        -authService: EdcCompliantAuthService
        -auditService: CloudAuditService
        -phiEncryption: PhiEncryptionService
        +patients$: BehaviorSubject~Patient[]~
        +createPatient(data): Promise~string~
        +updatePatient(id, data): Promise~void~
        +getPatientById(id): Observable~Patient~
        +searchPatients(criteria): Observable~Patient[]~
        +enrollPatientInStudy(patientId, studyId): Promise~void~
        +getPatientForms(patientId): Observable~FormInstance[]~
        +exportPatientData(patientId): Promise~Blob~
    }

    class PhiEncryptionService {
        -http: HttpClient
        -baseUrl: string
        +encryptPHI(data): Promise~EncryptedData~
        +decryptPHI(encryptedData): Promise~any~
        +deidentifyData(data): Promise~DeidentifiedData~
        +reidentifyData(deidentifiedData): Promise~any~
        +generateEncryptionKey(): string
    }

    class DataSeparationService {
        -firestore: Firestore
        -healthcareApi: HealthcareApiService
        -auditService: CloudAuditService
        +separatePHI(patientData): SeparatedData
        +storePHI(phi): Promise~void~
        +storeNonPHI(data): Promise~void~
        +retrieveCompleteRecord(patientId): Promise~Patient~
        +enforceDataBoundaries(data): boolean
    }

    PatientService --> PhiEncryptionService
    PatientService --> DataSeparationService
    DataSeparationService --> HealthcareApiService
```

## 3. Form & Template Management System

```mermaid
classDiagram
    class FormTemplateService {
        -firestore: Firestore
        -authService: EdcCompliantAuthService
        -validationService: FormValidationService
        +templates$: Observable~FormTemplate[]~
        +createTemplate(data): Promise~string~
        +updateTemplate(id, data): Promise~void~
        +getTemplateById(id): Observable~FormTemplate~
        +duplicateTemplate(id): Promise~string~
        +validateTemplate(template): ValidationResult
        +publishTemplate(id): Promise~void~
    }

    class FormInstanceService {
        -firestore: Firestore
        -authService: EdcCompliantAuthService
        -templateService: FormTemplateService
        +instances$: Observable~FormInstance[]~
        +createInstance(templateId, patientId): Promise~string~
        +updateInstance(id, data): Promise~void~
        +submitForm(id, responses): Promise~void~
        +validateResponses(instance, responses): ValidationResult
        +getInstanceHistory(id): Observable~FormHistory[]~
        +lockForm(id): Promise~void~
    }

    class FormValidationService {
        +validateField(field, value): ValidationResult
        +validateForm(template, responses): ValidationResult
        +validateRequiredFields(fields, responses): boolean
        +validateConditionalLogic(template, responses): boolean
        +validateCalculatedFields(fields, responses): boolean
    }

    class FormSubmissionService {
        -eventBus: IEventBus
        -auditService: CloudAuditService
        +submitForm(formData): Promise~void~
        +validateSubmission(formData): boolean
        +processSubmission(formData): Promise~void~
        +notifySubmission(formId): void
    }

    FormTemplateService --> FormValidationService
    FormInstanceService --> FormTemplateService
    FormInstanceService --> FormValidationService
    FormInstanceService --> FormSubmissionService
```

## 4. Study Management System

```mermaid
classDiagram
    class StudyService {
        -firestore: Firestore
        -authService: EdcCompliantAuthService
        -auditService: CloudAuditService
        +studies$: BehaviorSubject~Study[]~
        +createStudy(data): Promise~string~
        +updateStudy(id, data): Promise~void~
        +getStudyById(id): Observable~Study~
        +enrollPatient(studyId, patientId): Promise~void~
        +getStudyPatients(studyId): Observable~Patient[]~
        +getStudyForms(studyId): Observable~FormTemplate[]~
        +closeStudy(id): Promise~void~
    }

    class StudyPhaseService {
        -firestore: Firestore
        +phases$: Observable~StudyPhase[]~
        +createPhase(studyId, data): Promise~string~
        +updatePhase(id, data): Promise~void~
        +getPhaseProgress(phaseId, patientId): Observable~Progress~
        +completePhase(phaseId, patientId): Promise~void~
        +getPhaseRequirements(phaseId): Observable~Requirement[]~
    }

    class SurveyService {
        -firestore: Firestore
        +surveys$: Observable~Survey[]~
        +createSurvey(data): Promise~string~
        +submitResponse(surveyId, response): Promise~void~
        +getSurveyResponses(surveyId): Observable~Response[]~
        +analyzeSurveyData(surveyId): Promise~Analysis~
    }

    StudyService --> StudyPhaseService
    StudyService --> SurveyService
    StudyPhaseService --> FormInstanceService
```

## 5. Audit & Compliance System

```mermaid
classDiagram
    class CloudAuditService {
        -functions: Functions
        -auth: Auth
        -firestore: Firestore
        +logAction(action, details): Promise~void~
        +logDataAccess(resource, action): Promise~void~
        +logSystemEvent(event): Promise~void~
        +getAuditLogs(filters): Observable~AuditLog[]~
        +exportAuditTrail(dateRange): Promise~Blob~
        +verifyIntegrity(logId): Promise~boolean~
    }

    class HealthcareApiService {
        -http: HttpClient
        -functions: Functions
        -auditService: CloudAuditService
        +createFHIRResource(resource): Promise~void~
        +updateFHIRResource(id, resource): Promise~void~
        +getFHIRResource(id): Observable~any~
        +validateFHIRCompliance(resource): boolean
        +exportToFHIR(data): Promise~FHIRBundle~
    }

    class DocumentService {
        -eventBus: IEventBus
        -firestore: Firestore
        +uploadDocument(file): Promise~string~
        +getDocument(id): Observable~Document~
        +validateDocument(doc): boolean
        +applyElectronicSignature(docId, signature): Promise~void~
        +trackDocumentVersion(docId): Promise~void~
    }

    CloudAuditService --> HealthcareApiService
    DocumentService --> CloudAuditService
```

## 6. OCR & Data Capture System

```mermaid
classDiagram
    class OcrProviderFactoryService {
        -currentProvider: OcrProvider
        -providerInstances: Map~OcrProvider, IOcrService~
        +getProvider(type): IOcrService
        +setProvider(type): void
        +getSupportedProviders(): OcrProvider[]
    }

    class TextractOcrService {
        -apiEndpoint: string
        -config: TextractConfig
        +analyzeDocument(file): Promise~OcrResult~
        +extractTables(file): Promise~TableData~
        +extractForms(file): Promise~FormData~
        +getConfidenceScore(result): number
    }

    class MicrosoftFormRecognizerService {
        -endpoint: string
        -apiKey: string
        +analyzeDocument(file): Promise~OcrResult~
        +trainModel(samples): Promise~ModelId~
        +recognizeCustomForm(file, modelId): Promise~FormData~
    }

    class OcrTemplateBuilderService {
        +buildFields(elements): FormField[]
        +mapOcrToTemplate(ocrResult, template): MappedData
        +validateMapping(mappedData): ValidationResult
        +generateTemplate(ocrResult): FormTemplate
    }

    OcrProviderFactoryService --> TextractOcrService
    OcrProviderFactoryService --> MicrosoftFormRecognizerService
    OcrTemplateBuilderService --> OcrProviderFactoryService
```

## 7. Core Infrastructure Services

```mermaid
classDiagram
    class EventBusService {
        -eventBus$: Subject~AppEvent~
        +emit(event): void
        +on(eventType): Observable~AppEvent~
        +registerHandler(eventType, handler): void
        +unregisterHandler(handlerId): void
    }

    class LanguageService {
        -languages: Language[]
        -currentLanguage: BehaviorSubject~string~
        +setLanguage(lang): void
        +getTranslation(key): string
        +getSupportedLanguages(): Language[]
        +translateForm(form, targetLang): Promise~Form~
    }

    class ExcelConversionService {
        +exportToExcel(data): Promise~Blob~
        +importFromExcel(file): Promise~any[]~
        +validateExcelFormat(file): boolean
        +mapExcelColumns(columns, template): ColumnMapping
    }

    class ToastService {
        -toastSubject: Subject~Toast~
        +toast$: Observable~Toast~
        +success(message): void
        +error(message): void
        +warning(message): void
        +info(message): void
    }

    class AwsConfigService {
        -config: AwsConfig
        +loadConfig(): Promise~void~
        +getRegion(): string
        +getCredentials(): AWSCredentials
        +validateConfig(): boolean
    }
```

## Key Architectural Patterns

### 1. **Service Layer Architecture**
- All business logic encapsulated in services
- Services use dependency injection
- Clear separation of concerns

### 2. **Data Flow**
```
User Interface → Components → Services → Firebase/Cloud Functions → Database
                                ↓
                          Audit Service → Audit Logs
```

### 3. **Security Layers**
- Authentication (EdcCompliantAuthService)
- Authorization (Role-based access)
- Encryption (PhiEncryptionService)
- Audit Trail (CloudAuditService)
- Data Separation (DataSeparationService)

### 4. **Compliance Gaps for CFR 21 Part 11**

#### Missing Components:
1. **Electronic Signature Service** - Needs biometric/cryptographic signatures
2. **Validation Service** - System validation documentation
3. **Change Control Service** - Track all system changes
4. **Training Management** - User training records
5. **System Access Control** - Time-based session management
6. **Data Integrity Service** - Checksums and integrity verification
7. **Backup & Recovery Service** - Automated backups with verification

#### Required Enhancements:
1. **Audit Trail** - Must be computer-generated, time-stamped, and tamper-proof
2. **User Authentication** - Needs two-factor authentication
3. **Electronic Records** - Must maintain complete history with no deletion
4. **System Validation** - Documented testing and validation protocols
5. **Change Management** - Version control for all system components

## Dependencies Graph

```mermaid
graph TD
    A[EdcCompliantAuthService] --> B[CloudAuditService]
    C[PatientService] --> A
    C --> D[PhiEncryptionService]
    C --> E[DataSeparationService]
    E --> F[HealthcareApiService]
    F --> B
    G[FormInstanceService] --> A
    G --> H[FormTemplateService]
    G --> I[FormValidationService]
    J[StudyService] --> A
    J --> B
    K[DocumentService] --> B
    L[UserManagementService] --> A
    M[OrganizationService] --> A
```

This architecture shows a modular system with clear separation of concerns, but lacks several critical components for CFR 21 Part 11 compliance.
