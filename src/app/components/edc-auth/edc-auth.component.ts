import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { EdcCompliantAuthService } from '../../services/edc-compliant-auth.service';

@Component({
  selector: 'app-edc-auth',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './edc-auth.component.html',
  styleUrls: ['./edc-auth.component.scss']
})
export class EdcAuthComponent {
  private authService = inject(EdcCompliantAuthService);
  private router = inject(Router);
  
  isLoading = false;
  error: string | null = null;
  buildDate = new Date().toISOString().split('T')[0];
  
  // Compliance information
  complianceStandards = [
    { name: 'HIPAA', icon: '🔒', description: 'Health Insurance Portability and Accountability Act' },
    { name: '21 CFR Part 11', icon: '📋', description: 'FDA Electronic Records & Signatures' },
    { name: 'GDPR', icon: '🇪🇺', description: 'General Data Protection Regulation' },
    { name: 'India Data Protection', icon: '🇮🇳', description: 'Personal Data Protection Bill' }
  ];
  
  securityFeatures = [
    'Enterprise Google Authentication',
    'Multi-Factor Authentication (MFA)',
    'Session Timeout (30 minutes)',
    'Comprehensive Audit Trail',
    'Role-Based Access Control',
    'IP Address Restrictions',
    'Password Expiry Policy',
    'Training & Compliance Tracking'
  ];

  async signInWithGoogle(): Promise<void> {
    this.isLoading = true;
    this.error = null;
    
    try {
      await this.authService.signInWithGoogle();
      
      // Check compliance requirements
      const user = await this.authService.user$.toPromise();
      if (user) {
        const compliance = await this.authService.checkComplianceRequirements(user.uid);
        
        if (compliance.needsTermsAcceptance || compliance.needsTraining) {
          // Redirect to compliance setup
          this.router.navigate(['/compliance-setup']);
        } else {
          // Redirect to dashboard
          this.router.navigate(['/dashboard']);
        }
      }
    } catch (error: any) {
      console.error('Authentication error:', error);
      this.error = this.getErrorMessage(error);
    } finally {
      this.isLoading = false;
    }
  }
  
  private getErrorMessage(error: any): string {
    if (error.message?.includes('domain not authorized')) {
      return 'Your email domain is not authorized for this system. Please contact your administrator.';
    }
    if (error.message?.includes('suspended')) {
      return 'Your account has been suspended. Please contact your administrator.';
    }
    if (error.message?.includes('inactive')) {
      return 'Your account is inactive. Please contact your administrator.';
    }
    if (error.code === 'auth/popup-closed-by-user') {
      return 'Sign-in cancelled. Please try again.';
    }
    if (error.code === 'auth/network-request-failed') {
      return 'Network error. Please check your connection and try again.';
    }
    return 'Authentication failed. Please try again or contact support.';
  }
}
