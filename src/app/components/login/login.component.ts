import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { EdcCompliantAuthService } from '../../services/edc-compliant-auth.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit, OnDestroy {
  private authService = inject(EdcCompliantAuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private fb = inject(FormBuilder);
  private destroy$ = new Subject<void>();

  loginForm!: FormGroup;

  isLoading = false;
  error: string | null = null;
  returnUrl: string = '/dashboard';

  ngOnInit(): void {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required]
    });

    // Get return URL from route parameters or default to '/'
    this.returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/dashboard';

    // Check if user is already authenticated
    this.authService.user$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(user => {
      if (user) {
        this.router.navigateByUrl(this.returnUrl);
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async onSubmit(): Promise<void> {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.isLoading = true;
    this.error = null;

    try {
      const { email, password } = this.loginForm.value;
      await this.authService.loginWithCredentials({ email, password });
      // Successful navigation is handled by the auth state subscription
    } catch (error: any) {
      this.error = error.message || 'An unexpected error occurred during login.';
      console.error('Login error:', error);
    } finally {
      this.isLoading = false;
    }
  }

  get emailControl() {
    return this.loginForm.get('email');
  }

  get passwordControl() {
    return this.loginForm.get('password');
  }

  async signInWithGoogle(): Promise<void> {
    this.isLoading = true;
    this.error = null;
    
    try {
      await this.authService.signInWithGoogle();
      // Navigation will be handled by the auth state subscription
    } catch (error: any) {
      // Don't show error for user-cancelled popups
      if (error.code !== 'auth/popup-closed-by-user' && 
          error.code !== 'auth/cancelled-popup-request') {
        this.error = error.message || 'An error occurred during Google sign-in.';
      }
      console.error('Google sign-in error:', error);
    } finally {
      this.isLoading = false;
    }
  }
}