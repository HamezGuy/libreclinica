import { Injectable, inject } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Auth } from '@angular/fire/auth';
import { Observable, from } from 'rxjs';
import { IAuditService, AuditEvent, AuditLog, AuditFilters } from '../core/interfaces';

export interface AuditLogEntry {
  userId: string;
  userEmail: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details: string;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  metadata?: Record<string, any>;
}

export interface ComplianceAuditEntry extends AuditLogEntry {
  regulatoryContext: '21CFR11' | 'HIPAA' | 'GDPR' | 'INDIA_DPB';
  dataIntegrity: {
    checksumBefore?: string;
    checksumAfter?: string;
    fieldsModified?: string[];
  };
  electronicSignature?: {
    signatureHash: string;
    signedAt: Date;
    signatureMethod: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class CloudAuditService implements IAuditService {
  private functions = inject(Functions);
  private auth = inject(Auth);

  /**
   * Log an event to the audit trail (IAuditService implementation)
   */
  logEvent(event: AuditEvent): Observable<void> {
    const auditEntry: Partial<AuditLogEntry> = {
      action: event.action,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      details: event.details || '',
      severity: 'INFO',
      metadata: {
        ...event.metadata,
        oldValue: event.oldValue,
        newValue: event.newValue,
        compliance: event.compliance
      }
    };
    return from(this.logAuditEvent(auditEntry));
  }

  /**
   * Query audit logs (IAuditService implementation)
   */
  queryLogs(filters: AuditFilters): Observable<AuditLog[]> {
    const queryAuditLogs = httpsCallable<AuditFilters, AuditLog[]>(this.functions, 'queryAuditLogs');
    return from(queryAuditLogs(filters).then(result => result.data));
  }

  /**
   * Export audit logs (IAuditService implementation)
   */
  exportLogs(startDate: Date, endDate: Date): Observable<string> {
    const exportAuditLogs = httpsCallable<{startDate: string, endDate: string}, {url: string}>(
      this.functions, 
      'exportAuditLogs'
    );
    return from(
      exportAuditLogs({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      }).then(result => result.data.url)
    );
  }

  /**
   * Log an audit entry to Google Cloud Logging
   * This creates an immutable audit trail as required by 21 CFR Part 11
   */
  async logAuditEvent(entry: Partial<AuditLogEntry>): Promise<void> {
    try {
      const user = this.auth.currentUser;
      if (!user && !entry.userId) {
        console.error('No user context for audit log');
        return;
      }

      // Prepare the audit log entry
      const auditEntry: AuditLogEntry = {
        userId: entry.userId || user?.uid || 'system',
        userEmail: entry.userEmail || user?.email || 'system',
        action: entry.action || 'UNKNOWN_ACTION',
        resourceType: entry.resourceType || 'UNKNOWN',
        resourceId: entry.resourceId,
        details: entry.details || '',
        ipAddress: entry.ipAddress || await this.getClientIP(),
        userAgent: entry.userAgent || navigator.userAgent,
        timestamp: new Date(),
        severity: entry.severity || 'INFO',
        metadata: {
          ...entry.metadata,
          clientTimestamp: new Date().toISOString(),
          clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        }
      };

      // Call the Cloud Function to write to Cloud Logging
      const logAudit = httpsCallable(this.functions, 'logAuditEvent');
      await logAudit(auditEntry);
    } catch (error) {
      // Never throw errors from audit logging - log to console instead
      console.error('Failed to log audit event:', error);
      // In production, you might want to send this to a backup logging service
    }
  }

  /**
   * Log a compliance-specific audit entry with additional regulatory metadata
   */
  async logComplianceEvent(entry: Partial<ComplianceAuditEntry>): Promise<void> {
    const complianceEntry: Partial<AuditLogEntry> = {
      ...entry,
      metadata: {
        ...entry.metadata,
        regulatoryContext: entry.regulatoryContext,
        dataIntegrity: entry.dataIntegrity,
        electronicSignature: entry.electronicSignature,
        complianceVersion: '21CFR11-2024'
      }
    };

    await this.logAuditEvent(complianceEntry);
  }

  /**
   * Log authentication events
   */
  async logAuthEvent(
    action: 'LOGIN' | 'LOGOUT' | 'LOGIN_FAILED' | 'SESSION_TIMEOUT' | 'MFA_REQUIRED' | 'MFA_COMPLETED',
    details: string,
    severity: 'INFO' | 'WARNING' | 'ERROR' = 'INFO'
  ): Promise<void> {
    await this.logAuditEvent({
      action: `AUTH_${action}`,
      resourceType: 'AUTHENTICATION',
      details,
      severity,
      metadata: {
        authMethod: 'GOOGLE_OAUTH',
        sessionId: this.generateSessionId()
      }
    });
  }

  /**
   * Log data access events
   */
  async logDataAccess(
    action: 'VIEW' | 'CREATE' | 'UPDATE' | 'DELETE' | 'EXPORT',
    resourceType: string,
    resourceId: string,
    details: string
  ): Promise<void> {
    await this.logAuditEvent({
      action: `DATA_${action}`,
      resourceType,
      resourceId,
      details,
      severity: action === 'DELETE' ? 'WARNING' : 'INFO'
    });
  }

  /**
   * Log user management events
   */
  async logUserManagement(
    action: 'CREATE_USER' | 'UPDATE_USER' | 'DEACTIVATE_USER' | 'CHANGE_ROLE' | 'RESET_PASSWORD',
    targetUserId: string,
    details: string
  ): Promise<void> {
    await this.logAuditEvent({
      action: `USER_${action}`,
      resourceType: 'USER_ACCOUNT',
      resourceId: targetUserId,
      details,
      severity: 'WARNING'
    });
  }

  /**
   * Log compliance events
   */
  async logComplianceAction(
    action: 'TERMS_ACCEPTED' | 'TRAINING_COMPLETED' | 'CONSENT_GIVEN' | 'CONSENT_WITHDRAWN',
    details: string
  ): Promise<void> {
    await this.logAuditEvent({
      action: `COMPLIANCE_${action}`,
      resourceType: 'COMPLIANCE',
      details,
      severity: 'INFO'
    });
  }

  /**
   * Log electronic signature events (21 CFR Part 11)
   */
  async logElectronicSignature(
    documentId: string,
    documentType: string,
    signatureHash: string,
    details: string
  ): Promise<void> {
    await this.logComplianceEvent({
      action: 'ELECTRONIC_SIGNATURE',
      resourceType: documentType,
      resourceId: documentId,
      details,
      severity: 'INFO',
      regulatoryContext: '21CFR11',
      electronicSignature: {
        signatureHash,
        signedAt: new Date(),
        signatureMethod: 'SHA256_WITH_TIMESTAMP'
      }
    });
  }

  /**
   * Get client IP address (will be properly captured server-side)
   */
  private async getClientIP(): Promise<string> {
    // This is a placeholder - actual IP will be captured server-side
    // Client-side IP detection is unreliable and can be spoofed
    return 'CLIENT_IP_PENDING';
  }

  /**
   * Generate a unique session ID for tracking user sessions
   */
  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Query audit logs (requires appropriate permissions)
   * This will call a Cloud Function that queries Cloud Logging
   */
  async queryAuditLogs(filters: {
    userId?: string;
    startDate?: Date;
    endDate?: Date;
    action?: string;
    resourceType?: string;
    severity?: string;
  }): Promise<AuditLogEntry[]> {
    try {
      const queryLogs = httpsCallable<any, AuditLogEntry[]>(this.functions, 'queryAuditLogs');
      const result = await queryLogs(filters);
      return result.data;
    } catch (error) {
      console.error('Failed to query audit logs:', error);
      return [];
    }
  }
}
