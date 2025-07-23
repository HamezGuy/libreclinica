import { Injectable, inject, NgZone } from '@angular/core';
import { Router } from '@angular/router';
import {
  Auth,
  GoogleAuthProvider,
  User,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from '@angular/fire/auth';
import {
  Firestore,
  DocumentReference,
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from '@angular/fire/firestore';
import { Observable, from, of, BehaviorSubject } from 'rxjs';
import { map, switchMap, catchError } from 'rxjs/operators';
import { UserProfile, UserPermissions } from '../models/user-profile.model';
import {
  IEventBus,
  UserLoginEvent,
  UserLogoutEvent,
  AuthenticationFailedEvent,
  UserCreatedEvent,
} from '../core/interfaces';
import { EVENT_BUS_TOKEN } from '../core/injection-tokens';
import {
  AccessLevel,
  ComplianceRegion,
  UserStatus,
} from '../enums/access-levels.enum';

@Injectable({
  providedIn: 'root',
})
export class EdcCompliantAuthService {
  private firestore: Firestore = inject(Firestore);
  private auth: Auth = inject(Auth);
  private zone: NgZone = inject(NgZone);
  private router: Router = inject(Router);
  private eventBus: IEventBus = inject(EVENT_BUS_TOKEN);

  private authStateSubject = new BehaviorSubject<User | null>(null);
  user$ = this.authStateSubject.asObservable();

  private currentSessionId: string | null = null;
  private sessionTimer: any;

  private readonly SESSION_TIMEOUT = 30 * 60 * 1000;

  // Allowed email domains for registration/login
  private readonly ALLOWED_DOMAINS = ['example.com', 'clinic.com', 'research.org']; // Example domains

  isAuthenticated$: Observable<boolean> = this.user$.pipe(map((user) => !!user));

  currentUserProfile$: Observable<UserProfile | null> = this.user$.pipe(
    switchMap((user) => {
      if (!user) {
        return of(null);
      }
      return from(this.getUserProfile(user.uid)).pipe(
        map((profile) => profile ?? null),
        catchError((error) => {
          console.error('Error fetching user profile in stream:', error);
          return of(null);
        })
      );
    })
  );

  constructor() {
    // Monitor auth state changes
    this.auth.onAuthStateChanged((user) => {
      this.authStateSubject.next(user);
      if (user) {
        this.startSessionTimer();
      } else {
        this.clearSessionTimer();
        this.currentSessionId = null;
      }
    });
  }

  async signInWithGoogle(): Promise<void> {
    const provider = new GoogleAuthProvider();
    try {
      const credential = await signInWithPopup(this.auth, provider);
      const user = credential.user;

      if (!this.isEmailAllowed(user.email!)) {
        await this.signOut('forced');
        throw new Error('Email domain is not allowed.');
      }

      let userProfile = await this.getUserProfile(user.uid);

      if (!userProfile) {
        userProfile = await this.createUserProfile(user);
        this.publishUserCreatedEvent(userProfile);
      } else {
        await this.updateLastLogin(user.uid);
      }

      if (userProfile.status !== UserStatus.ACTIVE) {
        const reason = `Account is not active. Status: ${userProfile.status}`;
        this.publishAuthFailedEvent(user.uid, user.email!, reason);
        await this.signOut('forced');
        throw new Error(reason);
      }

      this.currentSessionId = this.generateSessionId();
      this.publishLoginEvent(userProfile);
      this.zone.run(() => this.router.navigate(['/dashboard']));
    } catch (error: any) {
      console.error('Google Sign-In failed:', error);
      this.publishAuthFailedEvent(error.code, error.email, error.message);
      throw error;
    }
  }

  async register(registrationData: any): Promise<void> {
    if (!this.isEmailAllowed(registrationData.email)) {
        throw new Error('Email domain is not allowed.');
    }
    try {
      const credential = await createUserWithEmailAndPassword(
        this.auth,
        registrationData.email,
        registrationData.password
      );
      const user = credential.user;
      const userProfile = await this.createUserProfile(user, registrationData);
      this.publishUserCreatedEvent(userProfile);
      this.zone.run(() => this.router.navigate(['/login']));
    } catch (error: any) {
      console.error('Registration failed:', error);
      this.publishAuthFailedEvent('N/A', registrationData.email, error.message);
      if (error.code === 'auth/email-already-in-use') {
        throw new Error('This email address is already registered.');
      } else if (error.code === 'auth/weak-password') {
        throw new Error('The password is too weak. Please choose a stronger password.');
      }
      throw new Error('An unexpected error occurred during registration.');
    }
  }

  // Login with email and password
  async loginWithCredentials(credentials: any): Promise<void> {
    return this.zone.run(async () => {
      try {
        const userCredential = await signInWithEmailAndPassword(this.auth, credentials.email, credentials.password);
        const user = userCredential.user;

        const userProfile = await this.getUserProfile(user.uid);

        if (!userProfile) {
          // This case should ideally not happen if registration is enforced
          await this.signOut('forced');
          throw new Error('User profile not found. Please contact support.');
        }

        if (userProfile.status === UserStatus.SUSPENDED || userProfile.status === UserStatus.INACTIVE) {
          await this.signOut('forced');
          throw new Error(`Your account is ${userProfile.status}. Please contact an administrator.`);
        }

        await this.updateLastLogin(user.uid);

        this.currentSessionId = this.generateSessionId();
        if(userProfile) {
            this.publishLoginEvent(userProfile, 'password');
        }

      } catch (error: any) {
        console.error('Login error:', error);
        const failedEvent: AuthenticationFailedEvent = {
          id: `auth_failed_${Date.now()}`,
          type: 'AUTHENTICATION_FAILED',
          timestamp: new Date(),
          userId: 'unknown', // User ID is not available on failed login
          userEmail: credentials.email,
          authMethod: 'password',
          reason: error.message,
          ipAddress: await this.getClientIP(),
          userAgent: navigator.userAgent
        };
        this.eventBus.publish(failedEvent);

        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
          throw new Error('Invalid email or password.');
        }
        throw new Error('An unexpected error occurred during login.');
      }
    });
  }

  // Sign out with audit logging
  async signOut(reason: 'manual' | 'timeout' | 'forced' = 'manual'): Promise<void> {
    try {
      const user = this.auth.currentUser;
      if (user) {
        this.publishLogoutEvent(user, reason);
      }

      await signOut(this.auth);
      this.clearSessionTimer();
      this.currentSessionId = null;
    } catch (error) {
      console.error('Error signing out:', error);
    }
  }

  // Session management methods
  private startSessionTimer(): void {
    this.clearSessionTimer();
    this.sessionTimer = this.zone.runOutsideAngular(() =>
      setTimeout(() => {
        this.zone.run(async () => {
          if (this.auth.currentUser) {
            console.log('Session timeout. Signing out...');
            await this.signOut('timeout');
          }
        });
      }, this.SESSION_TIMEOUT)
    );
  }

  private clearSessionTimer(): void {
    if (this.sessionTimer) {
      clearTimeout(this.sessionTimer);
      this.sessionTimer = null;
    }
  }

  resetSessionTimer(): void {
    if (this.auth.currentUser) {
      this.startSessionTimer();
    }
  }

  private isEmailAllowed(email: string): boolean {
    if (!email) return false;
    const domain = email.split('@')[1];
    return this.ALLOWED_DOMAINS.includes(domain);
  }

  private async getUserProfile(uid: string): Promise<UserProfile | undefined> {
    const userRef = doc(this.firestore, `users/${uid}`) as DocumentReference<UserProfile>;
    const userDoc = await getDoc(userRef);
    return userDoc.exists() ? userDoc.data() : undefined;
  }

  private async createUserProfile(user: User, registrationData?: any): Promise<UserProfile> {
    const userRef = doc(this.firestore, `users/${user.uid}`);
    const userProfile: UserProfile = {
      uid: user.uid,
      email: user.email!,
      displayName: registrationData?.displayName || user.displayName || 'Anonymous User',
      photoURL: user.photoURL ?? "",
      username: registrationData?.username,
      organization: registrationData?.organization,
      accessLevel: registrationData?.role || AccessLevel.DATA_ENTRY, // Default role
      status: UserStatus.PENDING_APPROVAL,
      complianceRegion: ComplianceRegion.GLOBAL,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastLoginAt: new Date(),
      agreedToTerms: registrationData?.agreedToTerms || false,
      trainingCompleted: false,
      passwordExpiresAt: null,
      mfaEnabled: false,
      permissions: this.getDefaultPermissions(registrationData?.role || AccessLevel.DATA_ENTRY)
    };

    await setDoc(doc(this.firestore, `users/${user.uid}`), userProfile);
    return userProfile;
  }

  private async updateLastLogin(uid: string): Promise<void> {
    const userRef = doc(this.firestore, `users/${uid}`);
    return updateDoc(userRef, { 
      lastLoginAt: new Date(),
      updatedAt: new Date()
    });
  }

  private async getClientIP(): Promise<string> {
    return 'CLIENT_IP_PLACEHOLDER';
  }

  private generateSessionId(): string {
    return `SESSION_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getDefaultPermissions(accessLevel: AccessLevel): UserPermissions {
    const allFalse: UserPermissions = { 
      canCreateStudy: false, 
      canEditStudy: false, 
      canDeleteStudy: false, 
      canViewAllData: false, 
      canExportData: false, 
      canManageUsers: false, 
      canViewAuditLogs: false, 
      canApproveChanges: false 
    };
    
    switch (accessLevel) {
      case AccessLevel.SUPER_ADMIN: 
        return { ...allFalse, canCreateStudy: true, canEditStudy: true, canDeleteStudy: true, canViewAllData: true, canExportData: true, canManageUsers: true, canViewAuditLogs: true, canApproveChanges: true };
      case AccessLevel.ADMIN: 
        return { ...allFalse, canCreateStudy: true, canEditStudy: true, canViewAllData: true, canExportData: true, canManageUsers: true, canViewAuditLogs: true, canApproveChanges: true };
      case AccessLevel.INVESTIGATOR: 
        return { ...allFalse, canEditStudy: true, canExportData: true };
      case AccessLevel.MONITOR: 
        return { ...allFalse, canViewAllData: true, canViewAuditLogs: true };
      case AccessLevel.DATA_ENTRY: 
        return { ...allFalse, canEditStudy: true };
      case AccessLevel.VIEWER: 
      default: 
        return allFalse;
    }
  }

  async getCurrentUserProfile(): Promise<UserProfile | null> {
    const currentUser = this.auth.currentUser;
    if (!currentUser) return null;
    const profile = await this.getUserProfile(currentUser.uid);
    return profile ?? null;
  }

  async checkComplianceRequirements(userId: string): Promise<any> {
    const profile = await this.getUserProfile(userId);
    if (!profile) throw new Error('User profile not found');

    const passwordExpired = profile.passwordExpiresAt ? new Date() > profile.passwordExpiresAt : false;

    return {
      needsTermsAcceptance: !profile.agreedToTerms,
      needsTraining: !profile.trainingCompleted,
      needsPasswordChange: passwordExpired,
      needsMFA: !profile.mfaEnabled
    };
  }

  // Event Publishing Methods
  private async publishLoginEvent(userProfile: UserProfile, authMethod: 'google' | 'password' = 'google'): Promise<void> {
    const loginEvent: UserLoginEvent = {
      id: `login_${Date.now()}`,
      type: 'USER_LOGIN',
      timestamp: new Date(),
      userId: userProfile.uid,
      userEmail: userProfile.email,
      authMethod: authMethod,
      ipAddress: await this.getClientIP(),
      userAgent: navigator.userAgent,
      sessionId: this.currentSessionId!
    };
    this.eventBus.publish(loginEvent);
  }

  private async publishLogoutEvent(user: User, reason: 'manual' | 'timeout' | 'forced'): Promise<void> {
     const logoutEvent: UserLogoutEvent = {
          id: `logout_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'USER_LOGOUT',
          timestamp: new Date(),
          userId: user.uid,
          userEmail: user.email!,
          sessionId: this.currentSessionId!,
          reason: reason,
          clientInfo: {
            ipAddress: await this.getClientIP(),
            userAgent: navigator.userAgent
          },
          compliance: {
            region: ComplianceRegion.GLOBAL,
            is21CFRPart11Compliant: true,
            isHIPAACompliant: true
          }
        };
        this.eventBus.publish(logoutEvent);
  }

  private async publishAuthFailedEvent(userId: string, userEmail: string, reason: string): Promise<void> {
    const failedEvent: AuthenticationFailedEvent = {
      id: `auth_failed_${Date.now()}`,
      type: 'AUTHENTICATION_FAILED',
      timestamp: new Date(),
      userId: userId,
      userEmail: userEmail,
      authMethod: 'password',
      reason: reason,
      ipAddress: await this.getClientIP(),
      userAgent: navigator.userAgent
    };
    this.eventBus.publish(failedEvent);
  }

  private publishUserCreatedEvent(userProfile: UserProfile): void {
    const userCreatedEvent: UserCreatedEvent = {
      id: `user_created_${Date.now()}`,
      type: 'USER_CREATED',
      timestamp: new Date(),
      userId: userProfile.uid,
      userEmail: userProfile.email,
      userProfile: userProfile,
      createdBy: userProfile.uid, // Or system/admin ID if applicable
      registrationMethod: 'google'
    };
    this.eventBus.publish(userCreatedEvent);
  }
}