import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { EdcCompliantAuthService } from '../../services/edc-compliant-auth.service';
import { EventBusService } from '../../services/event-bus.service';
import { ComplianceTermsAcceptedEvent, ComplianceTrainingCompletedEvent } from '../../models/compliance-events.model';
import { Firestore, doc, updateDoc } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';

@Component({
  selector: 'app-compliance-setup',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './compliance-setup.component.html',
  styleUrls: ['./compliance-setup.component.scss']
})
export class ComplianceSetupComponent implements OnInit {
  private authService = inject(EdcCompliantAuthService);
  private firestore = inject(Firestore);
  private auth = inject(Auth);
  private router = inject(Router);
  private eventBus = inject(EventBusService);
  
  // Compliance requirements
  requirements = {
    needsTermsAcceptance: false,
    needsTraining: false,
    needsPasswordChange: false,
    needsMFA: false
  };
  
  // User actions
  termsAccepted = false;
  privacyAccepted = false;
  trainingCompleted = false;
  
  // UI state
  isLoading = true;
  isSaving = false;
  error: string | null = null;
  currentStep = 1;
  
  // Terms and privacy content
  termsContent = `
    <h3>Terms of Service - Electronic Data Capture System</h3>
    <p><strong>Effective Date:</strong> ${new Date().toLocaleDateString()}</p>
    
    <h4>1. Acceptance of Terms</h4>
    <p>By accessing and using this Electronic Data Capture (EDC) system, you agree to comply with and be bound by these Terms of Service.</p>
    
    <h4>2. Compliance Requirements</h4>
    <p>This system is designed to meet the following regulatory standards:</p>
    <ul>
      <li>HIPAA (Health Insurance Portability and Accountability Act)</li>
      <li>21 CFR Part 11 (FDA Electronic Records and Electronic Signatures)</li>
      <li>GDPR (General Data Protection Regulation)</li>
      <li>India Personal Data Protection Bill</li>
    </ul>
    
    <h4>3. User Responsibilities</h4>
    <ul>
      <li>Maintain the confidentiality of your authentication credentials</li>
      <li>Report any suspected security breaches immediately</li>
      <li>Complete all required training before accessing clinical data</li>
      <li>Follow all standard operating procedures (SOPs)</li>
      <li>Ensure data accuracy and integrity</li>
    </ul>
    
    <h4>4. Data Security</h4>
    <p>All data entered into this system is encrypted and stored securely. Access is logged and monitored for compliance purposes.</p>
    
    <h4>5. Audit Trail</h4>
    <p>All actions within the system are recorded in an immutable audit trail as required by 21 CFR Part 11.</p>
  `;
  
  privacyContent = `
    <h3>Privacy Policy & Data Protection</h3>
    <p><strong>Last Updated:</strong> ${new Date().toLocaleDateString()}</p>
    
    <h4>1. Data Collection</h4>
    <p>We collect only the minimum necessary data required for clinical trial management and regulatory compliance.</p>
    
    <h4>2. Data Usage</h4>
    <p>Your data is used solely for:</p>
    <ul>
      <li>Clinical trial management</li>
      <li>Regulatory compliance</li>
      <li>System security and audit purposes</li>
    </ul>
    
    <h4>3. Data Protection</h4>
    <p>We implement industry-standard security measures including:</p>
    <ul>
      <li>End-to-end encryption</li>
      <li>Role-based access control</li>
      <li>Regular security audits</li>
      <li>Data backup and disaster recovery</li>
    </ul>
    
    <h4>4. Your Rights</h4>
    <p>Under applicable data protection laws, you have the right to:</p>
    <ul>
      <li>Access your personal data</li>
      <li>Request corrections to your data</li>
      <li>Request data portability</li>
      <li>Lodge a complaint with supervisory authorities</li>
    </ul>
  `;
  
  trainingModules = [
    {
      id: 'module1',
      title: 'Introduction to GCP and Clinical Trials',
      duration: '15 minutes',
      completed: false
    },
    {
      id: 'module2',
      title: '21 CFR Part 11 Compliance',
      duration: '20 minutes',
      completed: false
    },
    {
      id: 'module3',
      title: 'Data Privacy and HIPAA',
      duration: '15 minutes',
      completed: false
    },
    {
      id: 'module4',
      title: 'System Navigation and Features',
      duration: '10 minutes',
      completed: false
    },
    {
      id: 'module5',
      title: 'Audit Trail and Data Integrity',
      duration: '15 minutes',
      completed: false
    }
  ];
  
  async ngOnInit() {
    try {
      const user = this.auth.currentUser;
      if (!user) {
        this.router.navigate(['/login']);
        return;
      }
      
      this.requirements = await this.authService.checkComplianceRequirements(user.uid);
      this.isLoading = false;
      
      // Determine starting step
      if (this.requirements.needsTermsAcceptance) {
        this.currentStep = 1;
      } else if (this.requirements.needsTraining) {
        this.currentStep = 2;
      } else {
        // All requirements met, go to dashboard
        this.router.navigate(['/dashboard']);
      }
    } catch (error) {
      console.error('Error checking compliance requirements:', error);
      this.error = 'Failed to load compliance requirements. Please try again.';
      this.isLoading = false;
    }
  }
  
  get canProceed(): boolean {
    if (this.currentStep === 1) {
      return this.termsAccepted && this.privacyAccepted;
    } else if (this.currentStep === 2) {
      return this.trainingModules.every(m => m.completed);
    }
    return false;
  }
  
  async nextStep() {
    if (this.currentStep === 1 && this.canProceed) {
      await this.saveTermsAcceptance();
      if (this.requirements.needsTraining) {
        this.currentStep = 2;
      } else {
        await this.completeSetup();
      }
    } else if (this.currentStep === 2 && this.canProceed) {
      await this.saveTrainingCompletion();
      await this.completeSetup();
    }
  }
  
  async saveTermsAcceptance() {
    try {
      const user = this.auth.currentUser;
      if (!user) return;
      
      const userRef = doc(this.firestore, 'users', user.uid);
      await updateDoc(userRef, {
        agreedToTerms: true,
        agreedToTermsDate: new Date(),
        dataPrivacyConsent: true,
        dataPrivacyConsentDate: new Date(),
        updatedAt: new Date()
      });
      
      const event: ComplianceTermsAcceptedEvent = {
        type: 'COMPLIANCE_TERMS_ACCEPTED',
        userId: user.uid,
        ipAddress: 'UNKNOWN', // Placeholder, should be captured server-side
        userAgent: window.navigator.userAgent,
        timestamp: new Date()
      };
      this.eventBus.publish(event);
    } catch (error) {
      console.error('Error saving terms acceptance:', error);
      throw error;
    }
  }
  
  async saveTrainingCompletion() {
    try {
      const user = this.auth.currentUser;
      if (!user) return;
      
      const userRef = doc(this.firestore, 'users', user.uid);
      await updateDoc(userRef, {
        trainingCompleted: true,
        trainingCompletedDate: new Date(),
        updatedAt: new Date()
      });
      
      const event: ComplianceTrainingCompletedEvent = {
        type: 'COMPLIANCE_TRAINING_COMPLETED',
        userId: user.uid,
        modulesCompleted: this.trainingModules.length,
        timestamp: new Date()
      };
      this.eventBus.publish(event);
    } catch (error) {
      console.error('Error saving training completion:', error);
      throw error;
    }
  }
  
  async completeSetup() {
    this.isSaving = true;
    this.error = null;
    
    try {
      // Navigate to dashboard
      this.router.navigate(['/dashboard']);
    } catch (error) {
      console.error('Error completing setup:', error);
      this.error = 'Failed to complete setup. Please try again.';
    } finally {
      this.isSaving = false;
    }
  }
  
  completeModule(moduleId: string) {
    const module = this.trainingModules.find(m => m.id === moduleId);
    if (module) {
      module.completed = true;
    }
  }
  
  async logout() {
    await this.authService.signOut();
    this.router.navigate(['/login']);
  }
}
