import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { Subject, combineLatest } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { StudyService } from '../../services/study.service';
import { PatientService } from '../../services/patient.service';
// Services that may need to be created or imported from core
// import { FormService } from '../../services/form.service';
// import { UserService } from '../../services/user.service';
// import { AuthService } from '../../services/auth.service';
// import { AuditService } from '../../services/audit.service';
import { Chart, ChartConfiguration, ChartType, registerables } from 'chart.js';

// Register Chart.js components
Chart.register(...registerables);
import { FormInstanceService } from '../../services/form-instance.service';
import { SurveyService } from '../../services/survey.service';
import { CloudAuditService } from '../../services/cloud-audit.service';
import { EdcCompliantAuthService } from '../../services/edc-compliant-auth.service';
import { Study, StudyStatus, PatientStudyEnrollment, StudyPhase as ModelStudyPhase } from '../../models/study.model';

type StudyPhase = Exclude<ModelStudyPhase, 'preclinical'>;

interface StudyMetrics {
  studyId: string;
  studyName: string;
  protocolNumber: string;
  phase: StudyPhase;
  status: StudyStatus;
  targetEnrollment: number;
  actualEnrollment: number;
  enrollmentPercentage: number;
  activePatients: number;
  completedPatients: number;
  withdrawnPatients: number;
  screenFailures: number;
  averageCompletionRate: number;
  dataEntryBacklog: number;
  queriesOpen: number;
  queriesResolved: number;
  averageQueryResolutionTime: number;
  siteCount: number;
  lastActivityDate: Date;
  averageDataEntryTime?: number;
  queryResponseTime?: number;
  systemUptime?: number;
  averageTimeToEnroll?: number;
  averageTimeToComplete?: number;
  dataQualityScore?: number;
  protocolDeviations?: number;
  adverseEvents?: number;
}

interface SiteMetrics {
  siteId: string;
  siteName: string;
  country: string;
  enrolledPatients: number;
  activePatients: number;
  screeningPatients: number;
  completionRate: number;
  queryRate: number;
  deviationRate: number;
  lastVisit: Date;
  actualEnrollment?: number;
  targetEnrollment?: number;
}

interface FormMetrics {
  formName: string;
  totalInstances: number;
  completedInstances: number;
  inProgressInstances: number;
  averageCompletionTime: number;
  errorRate: number;
  mostCommonErrors: string[];
}

interface UserActivityMetrics {
  userId: string;
  userName: string;
  role: string;
  lastLogin: Date;
  formsCompleted: number;
  dataEntriesThisWeek: number;
  averageTimePerForm: number;
  errorRate: number;
}

interface DataQualityMetrics {
  totalDataPoints: number;
  completenessRate: number;
  accuracyRate: number;
  consistencyRate: number;
  timelinesRate: number;
  queryRate: number;
  autoQueryRate: number;
  manualQueryRate: number;
}

interface ComplianceMetrics {
  protocolAdherence: number;
  consentCompliance: number;
  dataPrivacyCompliance: number;
  auditReadiness: number;
  signatureCompliance: number;
  sourceDocumentVerification: number;
}

@Component({
  selector: 'app-reports-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './reports-dashboard.component.html',
  styleUrls: ['./reports-dashboard.component.scss']
})
export class ReportsDashboardComponent implements OnInit, OnDestroy, AfterViewInit {
  private destroy$ = new Subject<void>();

  // View Controls
  selectedTimeRange: string = '30days';
  selectedStudy: string = 'all';
  selectedView: 'overview' | 'enrollment' | 'data-quality' | 'compliance' | 'performance' | 'user-activity' = 'overview';

  // Date Range
  startDate: Date = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  endDate: Date = new Date();

  // Loading States
  isLoading = true;
  isExporting = false;

  // Overview Metrics
  totalStudies = 0;
  activeStudies = 0;
  totalPatients = 0;
  totalEnrollment = 0;
  overallScreeningRate = 0;
  overallCompletionRate = 0;
  totalForms = 0;
  completedForms = 0;
  pendingForms = 0;
  pendingQueries = 0;
  resolvedQueries = 0;

  // User Activity
  userActivities: any[] = [];

  // Study-specific Metrics
  studyMetrics: StudyMetrics[] = [];
  selectedStudyMetrics: StudyMetrics | null = null;

  // Site Metrics
  siteMetrics: SiteMetrics[] = [];
  topPerformingSites: SiteMetrics[] = [];
  underperformingSites: SiteMetrics[] = [];

  // Form Metrics
  formMetrics: FormMetrics[] = [];
  formCompletionTrend: any[] = [];

  // User Activity
  userActivityMetrics: UserActivityMetrics[] = [];
  activeUsers = 0;
  totalLogins = 0;

  // Data Quality
  dataQualityMetrics: DataQualityMetrics = {
    totalDataPoints: 0,
    completenessRate: 0,
    accuracyRate: 0,
    consistencyRate: 0,
    timelinesRate: 0,
    queryRate: 0,
    autoQueryRate: 0,
    manualQueryRate: 0
  };

  // Compliance
  complianceMetrics: ComplianceMetrics = {
    protocolAdherence: 0,
    consentCompliance: 0,
    dataPrivacyCompliance: 0,
    auditReadiness: 0,
    signatureCompliance: 0,
    sourceDocumentVerification: 0
  };

  // Chart data
  enrollmentChartData: any = {};
  completionChartData: any = {};
  queryChartData: any = {};
  dataQualityChartData: any = {};

  // Chart instances
  private enrollmentChart: Chart | null = null;
  private completionChart: Chart | null = null;
  private queryChart: Chart | null = null;
  private dataQualityChart: Chart | null = null;
  private sitePerformanceChart: Chart | null = null;
  private userActivityChart: Chart | null = null;

  @ViewChild('enrollmentCanvas', { static: false }) enrollmentCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('completionCanvas', { static: false }) completionCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('queryCanvas', { static: false }) queryCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('dataQualityCanvas', { static: false }) dataQualityCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('sitePerformanceCanvas', { static: false }) sitePerformanceCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('userActivityCanvas', { static: false }) userActivityCanvas!: ElementRef<HTMLCanvasElement>;

  // Enrollment Trends
  enrollmentTrend: { date: Date; count: number; cumulative: number }[] = [];

  // Alerts & Notifications
  criticalAlerts: any[] = [];
  upcomingMilestones: any[] = [];

  // Additional properties
  averageTimeToEnroll: number = 14;
  averageTimeToComplete: number = 180;
  averageQueryResolutionTime: number = 48;
  dataEntryLag: number = 2;
  enrollmentProjection: any[] = [];

  // Available Studies for Filter
  availableStudies: Study[] = [];

  // Data Collections
  studies: Study[] = [];
  patients: any[] = [];
  alerts: any[] = [];
  milestones: any[] = [];

  constructor(
    private studyService: StudyService,
    private patientService: PatientService
  ) {
    this.loadData();
    this.setupRealtimeUpdates();
  }

  ngOnInit() {
    // Initialization handled in constructor
  }

  ngAfterViewInit() {
    if (this.enrollmentChartData) {
      this.prepareChartData();
    }
    setTimeout(() => {
      this.initializeCharts();
    }, 100);
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();

    // Destroy chart instances
    if (this.enrollmentChart) this.enrollmentChart.destroy();
    if (this.completionChart) this.completionChart.destroy();
    if (this.queryChart) this.queryChart.destroy();
    if (this.dataQualityChart) this.dataQualityChart.destroy();
    if (this.sitePerformanceChart) this.sitePerformanceChart.destroy();
    if (this.userActivityChart) this.userActivityChart.destroy();
  }

  private async loadDashboardData(): Promise<void> {
    this.isLoading = true;

    try {
      // Load all studies - convert Observable to Promise
      const studies = await this.studyService.getStudies().toPromise() || [];
      this.availableStudies = studies;
      this.totalStudies = studies.length;
      this.activeStudies = studies.filter((s: Study) =>
        ['active', 'recruiting'].includes(s.status)
      ).length;

      // Load all patients
      const patients = await this.loadAllPatients();
      this.totalPatients = patients.length;

      // Calculate metrics based on selected filters
      await this.calculateMetrics(studies, patients);

      // Load form metrics
      await this.loadFormMetrics();

      // Load user activity
      await this.loadUserActivity();

      // Load data quality metrics
      await this.calculateDataQualityMetrics();

      // Load compliance metrics
      await this.calculateComplianceMetrics();

      // Generate chart data
      this.prepareChartData();

    } catch (error) {
      console.error('Error loading dashboard data:', error);
      // Fall back to mock data if real data fails
      this.loadMockData();
    } finally {
      this.isLoading = false;
    }
  }

  private loadMockDashboardData(): void {
    this.isLoading = true;

    // Generate mock studies
    this.availableStudies = this.generateMockStudies();
    this.totalStudies = this.availableStudies.length;
    this.activeStudies = this.availableStudies.filter(s =>
      ['active', 'recruiting'].includes(s.status)
    ).length;

    // Generate mock patients
    const mockPatients = this.generateMockPatients();
    this.totalPatients = mockPatients.length;
    this.totalEnrollment = mockPatients.filter(p => p.enrollmentStatus === 'enrolled').length;

    // Calculate overview metrics
    this.overallScreeningRate = 78.5;
    this.overallCompletionRate = 82.3;
    this.totalForms = 4567;
    this.completedForms = 3892;
    this.pendingForms = 675;
    this.pendingQueries = 234;
    this.resolvedQueries = 1876;

    // Generate study metrics
    this.studyMetrics = this.generateMockStudyMetrics();

    // Generate site metrics
    this.siteMetrics = this.generateMockSiteMetrics();
    this.topPerformingSites = this.siteMetrics.slice(0, 3);
    this.underperformingSites = this.siteMetrics.slice(-3);

    // Generate form metrics
    this.formMetrics = this.generateMockFormMetrics();

    // Generate user activity metrics
    this.userActivityMetrics = this.generateMockUserActivityMetrics();
    this.activeUsers = this.userActivityMetrics.length;
    this.totalLogins = 2345;

    // Generate data quality metrics
    this.dataQualityMetrics = {
      totalDataPoints: 156789,
      completenessRate: 94.5,
      accuracyRate: 97.2,
      consistencyRate: 93.8,
      timelinesRate: 89.4,
      queryRate: 12.3,
      autoQueryRate: 8.7,
      manualQueryRate: 3.6
    };

    // Generate compliance metrics
    this.complianceMetrics = {
      protocolAdherence: 96.5,
      consentCompliance: 99.2,
      dataPrivacyCompliance: 98.7,
      auditReadiness: 94.3,
      signatureCompliance: 97.8,
      sourceDocumentVerification: 92.1
    };

    // Generate enrollment trend
    this.enrollmentTrend = this.generateMockEnrollmentTrend();
    this.enrollmentProjection = this.generateMockEnrollmentProjection();

    // Generate performance metrics
    this.averageTimeToEnroll = 14.5;
    this.averageTimeToComplete = 186.3;
    this.averageQueryResolutionTime = 3.2;
    this.dataEntryLag = 1.8;

    // Generate alerts and milestones
    this.criticalAlerts = this.generateMockAlerts();
    this.upcomingMilestones = this.generateMockMilestones();

    // Generate chart data
    this.prepareChartData();

    setTimeout(() => {
      this.isLoading = false;
    }, 500);
  }

  private generateMockStudies(): Study[] {
    return [
      {
        id: 'study-001',
        title: 'Cardiovascular Disease Prevention Study',
        protocolNumber: 'CVD-2024-001',
        phase: 'phase_iii' as ModelStudyPhase,
        status: 'active' as const,
        plannedEnrollment: 500,
        actualEnrollment: 342,
        description: 'A multi-center, randomized, double-blind study',
        therapeuticArea: 'Cardiology',
        indication: 'Hypertension',
        studyType: 'interventional',
        version: '1.0',
        enrollmentStatus: 'enrolling',
        startDate: new Date('2024-01-15'),
        endDate: new Date('2025-06-30'),
        createdAt: new Date('2023-12-01'),
        updatedAt: new Date('2024-03-15'),
        createdBy: 'admin',
        updatedBy: 'admin',
        sites: ['Site A', 'Site B', 'Site C'],
        investigators: ['Dr. Smith', 'Dr. Johnson'],
        sections: [],
        phases: [],
        formTemplates: [],
        visitSchedule: [],
        inclusionCriteria: [],
        exclusionCriteria: [],
        adverseEventReporting: {
          enabled: true,
          severityLevels: ['mild', 'moderate', 'severe'],
          reportingTimeline: 24
        },
        dataMonitoring: {
          enabled: true,
          frequency: 'monthly',
          lastReview: new Date('2024-03-01')
        },
        regulatoryApprovals: [],
        consentForms: [],
        patientIds: [],
        phaseIds: [],
        phaseTransitionRules: [],
        substudies: [],
        randomizationSettings: null,
        blindingLevel: 'double',
        safetyParameters: [],
        dataCollectionMethods: [],
        statisticalDesign: null,
        interimAnalyses: [],
        protocolDeviations: [],
        amendments: [],
        trainingRequirements: [],
        monitoringPlan: null,
        auditSchedule: [],
        closeoutProcedures: null,
        archivingRequirements: null,
        communicationPlan: null
      } as unknown as Study,
      {
        id: 'study-002',
        title: 'Diabetes Management Clinical Trial',
        protocolNumber: 'DM-2024-002',
        phase: 'phase_ii' as ModelStudyPhase,
        status: 'recruiting' as const,
        plannedEnrollment: 300,
        actualEnrollment: 125,
        description: 'An open-label study evaluating new diabetes management protocols',
        therapeuticArea: 'Endocrinology',
        indication: 'Type 2 Diabetes',
        studyType: 'observational',
        version: '2.1',
        enrollmentStatus: 'recruiting',
        startDate: new Date('2024-02-01'),
        endDate: new Date('2025-08-31'),
        createdAt: new Date('2023-11-15'),
        updatedAt: new Date('2024-03-10'),
        createdBy: 'admin',
        updatedBy: 'coordinator',
        sites: ['Site D', 'Site E'],
        investigators: ['Dr. Brown', 'Dr. Davis'],
        sections: [],
        phases: [],
        formTemplates: [],
        visitSchedule: [],
        inclusionCriteria: [],
        exclusionCriteria: [],
        adverseEventReporting: {
          enabled: true,
          severityLevels: ['mild', 'moderate', 'severe', 'life-threatening'],
          reportingTimeline: 48
        },
        dataMonitoring: {
          enabled: true,
          frequency: 'quarterly',
          lastReview: new Date('2024-02-15')
        },
        regulatoryApprovals: [],
        consentForms: [],
        patientIds: [],
        phaseIds: [],
        phaseTransitionRules: [],
        substudies: [],
        randomizationSettings: null,
        blindingLevel: 'open',
        safetyParameters: [],
        dataCollectionMethods: [],
        statisticalDesign: null,
        interimAnalyses: [],
        protocolDeviations: [],
        amendments: [],
        trainingRequirements: [],
        monitoringPlan: null,
        auditSchedule: [],
        closeoutProcedures: null,
        archivingRequirements: null,
        communicationPlan: null
      } as unknown as Study,
      {
        id: 'study-003',
        title: 'Oncology Immunotherapy Research',
        protocolNumber: 'ONC-2024-003',
        phase: 'phase_i' as ModelStudyPhase,
        status: 'active' as const,
        plannedEnrollment: 150,
        actualEnrollment: 89,
        description: 'Early phase immunotherapy combination study',
        therapeuticArea: 'Oncology',
        indication: 'Non-Small Cell Lung Cancer',
        studyType: 'interventional',
        version: '1.3',
        enrollmentStatus: 'enrolling',
        startDate: new Date('2024-03-01'),
        endDate: new Date('2025-12-31'),
        createdAt: new Date('2024-01-10'),
        updatedAt: new Date('2024-03-20'),
        createdBy: 'admin',
        updatedBy: 'admin',
        sites: ['Site F', 'Site G', 'Site H', 'Site I'],
        investigators: ['Dr. Wilson', 'Dr. Martinez', 'Dr. Lee'],
        sections: [],
        phases: [],
        formTemplates: [],
        visitSchedule: [],
        inclusionCriteria: [],
        exclusionCriteria: [],
        adverseEventReporting: {
          enabled: true,
          severityLevels: ['grade1', 'grade2', 'grade3', 'grade4', 'grade5'],
          reportingTimeline: 24
        },
        dataMonitoring: {
          enabled: true,
          frequency: 'monthly',
          lastReview: new Date('2024-03-15')
        },
        regulatoryApprovals: [],
        consentForms: [],
        patientIds: [],
        phaseIds: [],
        phaseTransitionRules: [],
        substudies: [],
        randomizationSettings: null,
        blindingLevel: 'single',
        safetyParameters: [],
        dataCollectionMethods: [],
        statisticalDesign: null,
        interimAnalyses: [],
        protocolDeviations: [],
        amendments: [],
        trainingRequirements: [],
        monitoringPlan: null,
        auditSchedule: [],
        closeoutProcedures: null,
        archivingRequirements: null,
        communicationPlan: null
      } as unknown as Study
    ];
  }

  private generateMockPatients(): any[] {
    const patients: any[] = [];
    const statuses = ['screening', 'enrolled', 'active', 'completed', 'withdrawn'];

    for (let i = 1; i <= 50; i++) {
      patients.push({
        id: `patient-${i}`,
        patientNumber: `PAT-${String(i).padStart(4, '0')}`,
        studyId: this.availableStudies[i % 3]?.id || 'study-001',
        enrollmentStatus: statuses[Math.floor(Math.random() * statuses.length)],
        enrollmentDate: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000),
        dateOfBirth: new Date(1950 + Math.floor(Math.random() * 50), Math.floor(Math.random() * 12), Math.floor(Math.random() * 28)),
        gender: Math.random() > 0.5 ? 'male' : 'female',
        initials: `${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}`,
        siteId: `site-${Math.floor(Math.random() * 10) + 1}`,
        studyProgress: {
          overallCompletionPercentage: Math.floor(Math.random() * 100),
          currentPhase: `Phase ${Math.floor(Math.random() * 3) + 1}`,
          completedVisits: Math.floor(Math.random() * 10),
          totalVisits: 12,
          nextVisitDate: new Date(Date.now() + Math.random() * 30 * 24 * 60 * 60 * 1000),
          lastVisitDate: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000)
        },
        activeAlerts: [],
        protocolDeviations: [],
        createdAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000),
        lastModifiedAt: new Date()
      });
    }

    return patients;
  }

  private generateMockStudyMetrics(): StudyMetrics[] {
    return this.availableStudies.map(study => ({
      studyId: study.id || '',
      studyName: study.title,
      protocolNumber: study.protocolNumber,
      phase: (study.phase === 'preclinical' ? 'phase_i' : study.phase) as StudyPhase,
      status: study.status,
      targetEnrollment: study.plannedEnrollment,
      actualEnrollment: study.actualEnrollment,
      enrollmentPercentage: (study.actualEnrollment / study.plannedEnrollment) * 100,
      activePatients: Math.floor(study.actualEnrollment * 0.7),
      completedPatients: Math.floor(study.actualEnrollment * 0.2),
      withdrawnPatients: Math.floor(study.actualEnrollment * 0.05),
      screenFailures: Math.floor(study.actualEnrollment * 0.05),
      averageCompletionRate: 75 + Math.random() * 20,
      dataEntryBacklog: Math.floor(Math.random() * 50),
      queriesOpen: Math.floor(Math.random() * 100),
      queriesResolved: Math.floor(Math.random() * 500),
      averageQueryResolutionTime: 24 + Math.random() * 72,
      siteCount: 5 + Math.floor(Math.random() * 15),
      lastActivityDate: study.lastModifiedAt,
      averageDataEntryTime: 10 + Math.random() * 20,
      queryResponseTime: 24 + Math.random() * 48,
      systemUptime: 99 + Math.random(),
      averageTimeToEnroll: 7 + Math.random() * 21,
      averageTimeToComplete: 90 + Math.random() * 180,
      dataQualityScore: 85 + Math.random() * 15,
      protocolDeviations: Math.floor(Math.random() * 10),
      adverseEvents: Math.floor(Math.random() * 20)
    }));
  }

  private generateMockSiteMetrics(): SiteMetrics[] {
    const countries = ['USA', 'Canada', 'UK', 'Germany', 'France', 'Spain', 'Italy', 'Japan', 'Australia', 'Brazil'];
    const cities = ['New York', 'Toronto', 'London', 'Berlin', 'Paris', 'Madrid', 'Rome', 'Tokyo', 'Sydney', 'São Paulo'];

    return countries.map((country, index) => ({
      siteId: `site-${index + 1}`,
      siteName: `${cities[index]} Medical Center`,
      country: country,
      enrolledPatients: Math.floor(Math.random() * 50) + 10,
      activePatients: Math.floor(Math.random() * 30) + 5,
      screeningPatients: Math.floor(Math.random() * 10),
      completionRate: 70 + Math.random() * 30,
      queryRate: Math.random() * 20,
      deviationRate: Math.random() * 10,
      lastVisit: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
      actualEnrollment: Math.floor(Math.random() * 50) + 10,
      targetEnrollment: Math.floor(Math.random() * 100) + 20
    }));
  }

  private generateMockFormMetrics(): FormMetrics[] {
    const formTypes = [
      'Demographics', 'Medical History', 'Vital Signs', 'Laboratory Results',
      'Adverse Events', 'Concomitant Medications', 'Study Drug Administration',
      'Efficacy Assessment', 'Quality of Life', 'End of Study'
    ];

    return formTypes.map(formName => ({
      formName,
      totalInstances: Math.floor(Math.random() * 500) + 100,
      completedInstances: Math.floor(Math.random() * 400) + 50,
      inProgressInstances: Math.floor(Math.random() * 50) + 10,
      averageCompletionTime: Math.random() * 30 + 5,
      errorRate: Math.random() * 5,
      mostCommonErrors: ['Missing required field', 'Out of range value', 'Invalid date format']
    }));
  }

  private generateMockUserActivityMetrics(): UserActivityMetrics[] {
    const roles = ['Clinical Research Coordinator', 'Data Manager', 'Principal Investigator', 'Study Monitor', 'Site Coordinator'];
    const names = ['Sarah Johnson', 'Michael Chen', 'Emily Davis', 'Robert Wilson', 'Lisa Anderson'];

    return names.map((name, index) => ({
      userId: `user-${index + 1}`,
      userName: name,
      role: roles[index],
      lastLogin: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000),
      formsCompleted: Math.floor(Math.random() * 100) + 20,
      dataEntriesThisWeek: Math.floor(Math.random() * 50) + 10,
      averageTimePerForm: Math.random() * 20 + 5,
      errorRate: Math.random() * 3
    }));
  }

  private generateMockEnrollmentTrend(): { date: Date; count: number; cumulative: number }[] {
    const trend = [];
    let cumulative = 0;
    const startDate = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);

    for (let i = 0; i < 180; i++) {
      const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
      const count = Math.floor(Math.random() * 5) + (i < 90 ? 1 : 2);
      cumulative += count;
      trend.push({ date, count, cumulative });
    }

    return trend;
  }

  private generateMockEnrollmentProjection(): { date: Date; projected: number; actual?: number }[] {
    const projection = [];
    const today = new Date();
    let projectedTotal = 1155; // Current cumulative

    for (let i = 0; i <= 90; i += 7) {
      const projDate = new Date(today.getTime() + i * 24 * 60 * 60 * 1000);
      projectedTotal += Math.floor(Math.random() * 20) + 15;
      projection.push({
        date: projDate,
        projected: projectedTotal,
        actual: i === 0 ? 1155 : undefined
      });
    }

    return projection;
  }

  private generateMockAlerts(): any[] {
    return [
      { type: 'critical', message: 'Site 003 has not enrolled patients for 30+ days', timestamp: new Date() },
      { type: 'warning', message: '15 queries pending resolution for >7 days', timestamp: new Date() },
      { type: 'info', message: 'Monthly monitoring visit due for Site 007', timestamp: new Date() }
    ];
  }

  private generateMockMilestones(): any[] {
    // Set additional metrics
    this.averageTimeToEnroll = 14;
    this.averageTimeToComplete = 180;
    this.averageQueryResolutionTime = 48;
    this.dataEntryLag = 2;

    // Generate enrollment projection
    this.enrollmentProjection = [
      { date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), count: 450, label: '1 Month' },
      { date: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), count: 520, label: '2 Months' },
      { date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), count: 600, label: '3 Months' }
    ];

    return [
      { name: '50% Enrollment', date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), status: 'upcoming' },
      { name: 'Interim Analysis', date: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), status: 'upcoming' },
      { name: 'Database Lock', date: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000), status: 'planned' }
    ];
  }

  private async loadAllPatients(): Promise<any[]> {
    // Load patients from all studies or selected study
    if (this.selectedStudy === 'all') {
      const allPatients: any[] = [];
      for (const study of this.availableStudies) {
        const patients = await this.patientService.getPatientsByStudy(study.id || '') || [];
        allPatients.push(...patients);
      }
      return allPatients;
    } else {
      const patients = await this.patientService.getPatientsByStudy(this.selectedStudy) || [];
      return patients;
    }
  }

  private async calculateMetrics(studies: Study[] = [], patients: any[] = []): Promise<void> {
    this.studyMetrics = [];

    for (const study of studies) {
      if (this.selectedStudy !== 'all' && study.id !== this.selectedStudy) {
        continue;
      }

      const studyPatients = patients.filter((p: any) => p.studyId === study.id);
      const activePatients = studyPatients.filter((p: any) =>
        ['enrolled', 'active'].includes(p.enrollmentStatus)
      ).length;
      const completedPatients = studyPatients.filter((p: any) =>
        p.enrollmentStatus === 'completed'
      ).length;
      const withdrawnPatients = studyPatients.filter((p: any) =>
        ['withdrawn', 'discontinued'].includes(p.enrollmentStatus)
      ).length;
      const screenFailures = studyPatients.filter((p: any) =>
        p.enrollmentStatus === 'screening'
      ).length;

      // Calculate average completion rate
      const completedWithDates = studyPatients.filter((p: any) =>
        p.studyProgress?.overallCompletionPercentage || 0
      );
      const avgCompletionRate = completedWithDates.length > 0
        ? completedWithDates.reduce((sum: number, p: any) => sum + p.studyProgress?.overallCompletionPercentage || 0, 0) / completedWithDates.length
        : 0;

      // Count queries and deviations
      const queriesOpen = studyPatients.reduce((sum: number, p: any) =>
        sum + (p.activeAlerts?.filter((a: any) => a.type === 'missing_data').length || 0), 0
      );
      const protocolDeviations = studyPatients.reduce((sum: number, p: any) =>
        sum + (p.protocolDeviations?.length || 0), 0
      );
      const adverseEvents = studyPatients.reduce((sum: number, p: any) =>
        sum + (p.activeAlerts?.filter((a: any) => a.type === 'adverse_event').length || 0), 0
      );

      const metric: StudyMetrics = {
        studyId: study.id || '',
        studyName: study.title,
        protocolNumber: study.protocolNumber,
        phase: (study.phase === 'preclinical' ? 'phase_i' : study.phase) as StudyPhase,
        status: study.status,
        targetEnrollment: study.plannedEnrollment,
        actualEnrollment: studyPatients.length,
        enrollmentPercentage: (studyPatients.length / study.plannedEnrollment) * 100,
        activePatients,
        completedPatients,
        withdrawnPatients,
        screenFailures,
        averageCompletionRate: avgCompletionRate,
        dataEntryBacklog: 0,
        queriesOpen,
        queriesResolved: 0,
        averageQueryResolutionTime: 0,
        siteCount: 0,
        lastActivityDate: study.lastModifiedAt,
        averageDataEntryTime: 15,
        queryResponseTime: 48,
        systemUptime: 99.5,
        averageTimeToEnroll: 14,
        averageTimeToComplete: avgCompletionRate,
        dataQualityScore: 90,
        protocolDeviations,
        adverseEvents
      };

      this.studyMetrics.push(metric);
    }

    // Calculate overall metrics
    this.totalEnrollment = this.studyMetrics.reduce((sum, m) => sum + m.actualEnrollment, 0);
    this.overallCompletionRate = this.studyMetrics.length > 0
      ? this.studyMetrics.reduce((sum, m) => sum + m.averageCompletionRate, 0) / this.studyMetrics.length
      : 0;
    this.pendingQueries = this.studyMetrics.reduce((sum, m) => sum + m.queriesOpen, 0);

    // Calculate enrollment trend
    const last30Days = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      last30Days.push({
        date,
        count: Math.floor(Math.random() * 10) + 5,
        cumulative: this.totalEnrollment - (i * 3)
      });
    }
    this.enrollmentTrend = last30Days;
  }

  private async loadFormMetrics(): Promise<void> {
    try {
      // Load form metrics for selected study
      // Mock form instances for now
      const formInstances: any[] = [];

      // Group by form template
      const formGroups = new Map<string, any[]>();
      formInstances.forEach((instance: any) => {
        const key = instance.templateId;
        if (!formGroups.has(key)) {
          formGroups.set(key, []);
        }
        formGroups.get(key)!.push(instance);
      });

      this.formMetrics = Array.from(formGroups.entries()).map(([templateId, instances]) => {
        const completedInstances = instances.filter((i: any) => i.status === 'completed');
        const inProgressInstances = instances.filter((i: any) => i.status === 'in_progress');

        // Calculate average completion time
        const avgCompletionTime = completedInstances
          .filter((i: any) => i.completedAt && i.createdAt)
          .reduce((sum: number, i: any) => {
            const created = i.createdAt instanceof Date ? i.createdAt : (i.createdAt as any).toDate();
            const completed = i.completedAt instanceof Date ? i.completedAt : (i.completedAt as any).toDate();
            return completed.getTime() - created.getTime();
          }, 0);

        return {
          formName: templateId,
          totalInstances: instances.length,
          completedInstances: completedInstances.length,
          inProgressInstances: inProgressInstances.length,
          averageCompletionTime: avgCompletionTime / (1000 * 60),
          errorRate: 0,
          mostCommonErrors: []
        };
      });

      this.totalForms = formInstances.length;
      this.completedForms = formInstances.filter((f: any) => f.status === 'completed').length;
      this.pendingForms = formInstances.filter((f: any) =>
        f.status === 'in_progress' || f.status === 'not_started'
      ).length;
    } catch (error) {
      console.error('Error loading form metrics:', error);
    }
  }

  private async loadUserActivity(): Promise<void> {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);

      // Mock audit logs for now
      const auditLogs: any[] = [];

      this.userActivities = auditLogs.map((log: any) => ({
        user: log.userId || 'Unknown',
        action: log.action,
        timestamp: log.timestamp instanceof Date ? log.timestamp : new Date(log.timestamp),
        details: log.details || ''
      }));

      // Group by user
      const userMap = new Map<string, any[]>();
      this.userActivities.forEach((log: any) => {
        if (!userMap.has(log.user)) {
          userMap.set(log.user, []);
        }
        userMap.get(log.user)!.push(log);
      });

      this.userActivityMetrics = Array.from(userMap.entries()).map(([userId, logs]) => {
        const formLogs = logs.filter((l: any) => l.action.includes('form'));
        const thisWeek = logs.filter((l: any) => {
          const logDate = l.timestamp instanceof Date ? l.timestamp : l.timestamp.toDate();
          const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          return logDate > weekAgo;
        });

        return {
          userId,
          userName: logs[0]?.userEmail || 'Unknown User',
          role: logs[0]?.metadata?.role || 'Unknown',
          lastLogin: logs[logs.length - 1]?.timestamp || new Date(),
          formsCompleted: formLogs.length,
          dataEntriesThisWeek: thisWeek.length,
          averageTimePerForm: formLogs.length > 0 ? 15 : 0,
          errorRate: 0
        };
      });

      this.activeUsers = this.userActivityMetrics.length;
      this.totalLogins = auditLogs.filter((l: any) => l.action === 'login').length;
    } catch (error) {
      console.error('Error loading user activity:', error);
    }
  }

  private async calculateDataQualityMetrics(): Promise<void> {
    try {
      // Get form instances for the study
      const formInstances: any[] = [];

      // Calculate total data points (all form fields)
      this.dataQualityMetrics.totalDataPoints = formInstances.reduce((sum: number, instance: any) => {
        return sum + (instance.formData ? Object.keys(instance.formData).length : 0);
      }, 0);

      // Calculate completeness (filled vs total fields)
      let filledFields = 0;
      let totalFields = 0;
      formInstances.forEach((instance: any) => {
        if (instance.formData) {
          Object.values(instance.formData).forEach((value: any) => {
            totalFields++;
            if (value !== null && value !== undefined && value !== '') {
              filledFields++;
            }
          });
        }
      });
      this.dataQualityMetrics.completenessRate = totalFields > 0
        ? (filledFields / totalFields) * 100
        : 0;

      // Estimate other metrics (would need more sophisticated tracking)
      this.dataQualityMetrics.accuracyRate = 95 + Math.random() * 5;
      this.dataQualityMetrics.consistencyRate = 92 + Math.random() * 8;
      this.dataQualityMetrics.timelinesRate = 88 + Math.random() * 12;

      // Query rates
      const totalForms = formInstances.length;
      const formsWithQueries = formInstances.filter((i: any) =>
        i.validationErrors && i.validationErrors.length > 0
      ).length;
      this.dataQualityMetrics.queryRate = totalForms > 0
        ? (formsWithQueries / totalForms) * 100
        : 0;

      this.dataQualityMetrics.autoQueryRate = this.dataQualityMetrics.queryRate * 0.7;
      this.dataQualityMetrics.manualQueryRate = this.dataQualityMetrics.queryRate * 0.3;
    } catch (error) {
      console.error('Error calculating data quality metrics:', error);
    }
  }

  private async calculateComplianceMetrics(): Promise<void> {
    // Calculate compliance metrics (these would need actual implementation)
    this.complianceMetrics = {
      protocolAdherence: 94 + Math.random() * 6,
      consentCompliance: 98 + Math.random() * 2,
      dataPrivacyCompliance: 96 + Math.random() * 4,
      auditReadiness: 91 + Math.random() * 9,
      signatureCompliance: 93 + Math.random() * 7,
      sourceDocumentVerification: 89 + Math.random() * 11
    };
  }

  prepareChartData(): void {
    // Enrollment Chart Data
    this.enrollmentChartData = {
      labels: this.enrollmentTrend.slice(-30).map(t => this.formatDate(t.date)),
      datasets: [
        {
          label: 'Daily Enrollment',
          data: this.enrollmentTrend.slice(-30).map(t => t.count),
          type: 'bar'
        },
        {
          label: 'Cumulative',
          data: this.enrollmentTrend.slice(-30).map(t => t.cumulative),
          type: 'line'
        }
      ]
    };

    // Completion Chart Data
    this.completionChartData = {
      labels: this.studyMetrics.map(m => m.studyName),
      datasets: [{
        label: 'Completion Rate (%)',
        data: this.studyMetrics.map(m => m.averageCompletionRate)
      }]
    };

    // Query Chart Data
    this.queryChartData = {
      labels: ['Open Queries', 'Resolved Queries', 'Auto Queries', 'Manual Queries'],
      datasets: [{
        data: [
          this.pendingQueries,
          this.resolvedQueries,
          Math.round(this.pendingQueries * 0.6),
          Math.round(this.pendingQueries * 0.4)
        ]
      }]
    };

    // Data Quality Chart
    this.dataQualityChartData = {
      labels: ['Completeness', 'Accuracy', 'Consistency', 'Timeliness'],
      datasets: [{
        label: 'Quality Score (%)',
        data: [
          this.dataQualityMetrics.completenessRate,
          this.dataQualityMetrics.accuracyRate,
          this.dataQualityMetrics.consistencyRate,
          this.dataQualityMetrics.timelinesRate
        ]
      }]
    };
  }

  private setupRealtimeUpdates(): void {
    // Set up real-time updates for critical metrics
    combineLatest([
      this.studyService.studies$,
      this.patientService.patients$
    ]).pipe(
      takeUntil(this.destroy$)
    ).subscribe(([studies, patients]) => {
      // Update metrics when data changes
      if (!this.isLoading) {
        this.calculateMetrics(studies, patients);
        this.prepareChartData();
      }
    });
  }

  onTimeRangeChange(): void {
    // Update date range based on selection
    const now = new Date();
    switch (this.selectedTimeRange) {
      case '7days':
        this.startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30days':
        this.startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90days':
        this.startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '1year':
        this.startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      case 'all':
        this.startDate = new Date(2020, 0, 1); // Arbitrary old date
        break;
    }
    this.endDate = now;
    this.loadDashboardData();
  }

  onStudyFilterChange(): void {
    this.loadDashboardData();
  }

  selectView(view: typeof this.selectedView): void {
    this.selectedView = view;
  }

  exportReport(format: 'pdf' | 'excel' | 'csv'): void {
    this.isExporting = true;

    // Prepare data for export
    const reportData = {
      generatedAt: new Date(),
      timeRange: `${this.formatDate(this.startDate)} - ${this.formatDate(this.endDate)}`,
      overview: {
        totalStudies: this.totalStudies,
        activeStudies: this.activeStudies,
        totalPatients: this.totalPatients,
        totalEnrollment: this.totalEnrollment,
        completionRate: this.overallCompletionRate,
        pendingQueries: this.pendingQueries
      },
      studyMetrics: this.studyMetrics,
      formMetrics: this.formMetrics,
      dataQuality: this.dataQualityMetrics,
      compliance: this.complianceMetrics,
      userActivity: this.userActivityMetrics
    };

    // Simulate export (would implement actual export logic)
    setTimeout(() => {
      console.log(`Exporting report as ${format}:`, reportData);
      this.isExporting = false;
      // Show success message
    }, 2000);
  }

  refreshData(): void {
    this.loadDashboardData();
  }

  formatDate(date: Date | string | null): string {
    if (!date) return 'N/A';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  private initializeCharts() {
    // Initialize enrollment trend chart
    if (this.enrollmentCanvas?.nativeElement) {
      this.createEnrollmentChart();
    }

    // Initialize completion rate chart
    if (this.completionCanvas?.nativeElement) {
      this.createCompletionChart();
    }

    // Initialize query resolution chart
    if (this.queryCanvas?.nativeElement) {
      this.createQueryChart();
    }

    // Initialize data quality chart
    if (this.dataQualityCanvas?.nativeElement) {
      this.createDataQualityChart();
    }

    // Initialize site performance chart
    if (this.sitePerformanceCanvas?.nativeElement) {
      this.createSitePerformanceChart();
    }

    // Initialize user activity chart
    if (this.userActivityCanvas?.nativeElement) {
      this.createUserActivityChart();
    }
  }

  private createEnrollmentChart() {
    const ctx = this.enrollmentCanvas.nativeElement.getContext('2d');
    if (!ctx) return;

    // Destroy existing chart if any
    if (this.enrollmentChart) {
      this.enrollmentChart.destroy();
    }

    const config: ChartConfiguration = {
      type: 'line' as ChartType,
      data: {
        labels: this.enrollmentChartData.labels || [],
        datasets: [
          {
            label: 'Actual Enrollment',
            data: this.enrollmentChartData.datasets?.[0]?.data || [],
            borderColor: '#4CAF50',
            backgroundColor: 'rgba(76, 175, 80, 0.1)',
            tension: 0.4,
            fill: true
          },
          {
            label: 'Target Enrollment',
            data: this.enrollmentChartData.datasets?.[1]?.data || [],
            borderColor: '#2196F3',
            backgroundColor: 'rgba(33, 150, 243, 0.1)',
            borderDash: [5, 5],
            tension: 0.4,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'top'
          },
          title: {
            display: true,
            text: 'Enrollment Trend Over Time'
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Number of Patients'
            }
          },
          x: {
            title: {
              display: true,
              text: 'Date'
            }
          }
        }
      }
    };

    this.enrollmentChart = new Chart(ctx, config);
  }

  private createCompletionChart() {
    const ctx = this.completionCanvas.nativeElement.getContext('2d');
    if (!ctx) return;

    if (this.completionChart) {
      this.completionChart.destroy();
    }

    const config: ChartConfiguration = {
      type: 'bar' as ChartType,
      data: {
        labels: this.completionChartData.labels || [],
        datasets: [{
          label: 'Completion Rate (%)',
          data: this.completionChartData.datasets?.[0]?.data || [],
          backgroundColor: [
            'rgba(76, 175, 80, 0.8)',
            'rgba(33, 150, 243, 0.8)',
            'rgba(255, 193, 7, 0.8)',
            'rgba(156, 39, 176, 0.8)',
            'rgba(255, 87, 34, 0.8)'
          ],
          borderColor: [
            '#4CAF50',
            '#2196F3',
            '#FFC107',
            '#9C27B0',
            '#FF5722'
          ],
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          },
          title: {
            display: true,
            text: 'Form Completion Rates by Study'
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            title: {
              display: true,
              text: 'Completion Rate (%)'
            }
          }
        }
      }
    };

    this.completionChart = new Chart(ctx, config);
  }

  private createQueryChart() {
    const ctx = this.queryCanvas.nativeElement.getContext('2d');
    if (!ctx) return;

    if (this.queryChart) {
      this.queryChart.destroy();
    }

    const config: ChartConfiguration = {
      type: 'doughnut' as ChartType,
      data: {
        labels: ['Open', 'Resolved', 'Pending Review', 'Closed'],
        datasets: [{
          data: [
            this.pendingQueries,
            this.resolvedQueries,
            Math.floor(this.pendingQueries * 0.3),
            Math.floor(this.resolvedQueries * 0.8)
          ],
          backgroundColor: [
            'rgba(244, 67, 54, 0.8)',
            'rgba(76, 175, 80, 0.8)',
            'rgba(255, 193, 7, 0.8)',
            'rgba(158, 158, 158, 0.8)'
          ],
          borderColor: [
            '#F44336',
            '#4CAF50',
            '#FFC107',
            '#9E9E9E'
          ],
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'right'
          },
          title: {
            display: true,
            text: 'Query Status Distribution'
          }
        }
      }
    };

    this.queryChart = new Chart(ctx, config);
  }

  private createDataQualityChart() {
    const ctx = this.dataQualityCanvas.nativeElement.getContext('2d');
    if (!ctx) return;

    if (this.dataQualityChart) {
      this.dataQualityChart.destroy();
    }

    const config: ChartConfiguration = {
      type: 'radar' as ChartType,
      data: {
        labels: ['Completeness', 'Accuracy', 'Consistency', 'Timeliness', 'Validity'],
        datasets: [{
          label: 'Current',
          data: [
            this.dataQualityMetrics.completenessRate,
            this.dataQualityMetrics.accuracyRate,
            this.dataQualityMetrics.consistencyRate,
            this.dataQualityMetrics.timelinesRate,
            85 // Validity rate
          ],
          borderColor: '#4CAF50',
          backgroundColor: 'rgba(76, 175, 80, 0.2)',
          pointBackgroundColor: '#4CAF50',
          pointBorderColor: '#fff',
          pointHoverBackgroundColor: '#fff',
          pointHoverBorderColor: '#4CAF50'
        },
        {
          label: 'Target',
          data: [95, 95, 90, 90, 95],
          borderColor: '#2196F3',
          backgroundColor: 'rgba(33, 150, 243, 0.1)',
          borderDash: [5, 5],
          pointBackgroundColor: '#2196F3',
          pointBorderColor: '#fff',
          pointHoverBackgroundColor: '#fff',
          pointHoverBorderColor: '#2196F3'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'top'
          },
          title: {
            display: true,
            text: 'Data Quality Dimensions'
          }
        },
        scales: {
          r: {
            beginAtZero: true,
            max: 100,
            ticks: {
              stepSize: 20
            }
          }
        }
      }
    };

    this.dataQualityChart = new Chart(ctx, config);
  }

  private createSitePerformanceChart() {
    const ctx = this.sitePerformanceCanvas.nativeElement.getContext('2d');
    if (!ctx) return;

    if (this.sitePerformanceChart) {
      this.sitePerformanceChart.destroy();
    }

    const topSites = this.siteMetrics.slice(0, 10);

    const config: ChartConfiguration = {
      type: 'bar' as ChartType,
      data: {
        labels: topSites.map(s => s.siteName),
        datasets: [
          {
            label: 'Enrollment',
            data: topSites.map(s => s.actualEnrollment || 0),
            backgroundColor: 'rgba(76, 175, 80, 0.8)',
            borderColor: '#4CAF50',
            borderWidth: 1
          },
          {
            label: 'Target',
            data: topSites.map(s => s.targetEnrollment || 0),
            backgroundColor: 'rgba(33, 150, 243, 0.8)',
            borderColor: '#2196F3',
            borderWidth: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'top'
          },
          title: {
            display: true,
            text: 'Site Performance - Enrollment Status'
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Number of Patients'
            }
          },
          x: {
            title: {
              display: true,
              text: 'Site'
            }
          }
        }
      }
    };

    this.sitePerformanceChart = new Chart(ctx, config);
  }

  private createUserActivityChart() {
    const ctx = this.userActivityCanvas.nativeElement.getContext('2d');
    if (!ctx) return;

    if (this.userActivityChart) {
      this.userActivityChart.destroy();
    }

    // Generate last 7 days of activity data
    const last7Days = [];
    const activityData = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      last7Days.push(date.toLocaleDateString('en-US', { weekday: 'short' }));
      activityData.push(Math.floor(Math.random() * 50) + 20);
    }

    const config: ChartConfiguration = {
      type: 'line' as ChartType,
      data: {
        labels: last7Days,
        datasets: [{
          label: 'Active Users',
          data: activityData,
          borderColor: '#9C27B0',
          backgroundColor: 'rgba(156, 39, 176, 0.1)',
          tension: 0.4,
          fill: true,
          pointRadius: 5,
          pointHoverRadius: 7
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          },
          title: {
            display: true,
            text: 'Daily Active Users - Last 7 Days'
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Number of Users'
            }
          },
          x: {
            title: {
              display: true,
              text: 'Day'
            }
          }
        }
      }
    };

    this.userActivityChart = new Chart(ctx, config);
  }

  private loadMockData() {
    // Generate mock data for demonstration
    this.studies = this.generateMockStudies();
    this.patients = this.generateMockPatients();
    this.studyMetrics = this.generateMockStudyMetrics();
    this.siteMetrics = this.generateMockSiteMetrics();
    this.formMetrics = this.generateMockFormMetrics();
    this.userActivityMetrics = this.generateMockUserActivityMetrics();
    this.enrollmentTrend = this.generateMockEnrollmentTrend();
    this.alerts = this.generateMockAlerts();
    this.milestones = this.generateMockMilestones();

    this.calculateMetrics();
    this.prepareChartData();

    // Set loading to false after mock data is loaded
    this.isLoading = false;
  }

  private async loadData() {
    this.isLoading = true;

    try {
      // For now, just load mock data
      this.loadMockData();
    } catch (error) {
      console.error('Error loading data:', error);
      this.loadMockData();
    } finally {
      // Always set loading to false
      this.isLoading = false;
      // Initialize charts after data is loaded
      setTimeout(() => {
        this.initializeCharts();
      }, 100);
    }
  }

  getStatusColor(status: string): string {
    const colors: Record<string, string> = {
      'active': '#4CAF50',
      'recruiting': '#2196F3',
      'completed': '#9E9E9E',
      'closed': '#F44336'
    };
    return colors[status] || '#757575';
  }

  getTotalScreenFailures(): number {
    return this.studyMetrics.reduce((sum, m) => sum + m.screenFailures, 0);
  }

  getTotalWithdrawals(): number {
    return this.studyMetrics.reduce((sum, m) => sum + m.withdrawnPatients, 0);
  }

  getTotalActivePatients(): number {
    return this.studyMetrics.reduce((sum, m) => sum + m.activePatients, 0);
  }

  getTotalCompletedPatients(): number {
    return this.studyMetrics.reduce((sum, m) => sum + m.completedPatients, 0);
  }

  getMetricTrend(current: number, previous: number): 'up' | 'down' | 'stable' {
    if (current > previous * 1.05) return 'up';
    if (current < previous * 0.95) return 'down';
    return 'stable';
  }
}
