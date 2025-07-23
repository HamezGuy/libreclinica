import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { EdcCompliantAuthService } from '../../services/edc-compliant-auth.service';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatTabsModule } from '@angular/material/tabs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'app-authentication',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatTabsModule,
    MatFormFieldModule,
    MatInputModule
  ],
  templateUrl: './authentication.component.html',
  styleUrls: ['./authentication.component.scss']
})
export class AuthenticationComponent implements OnInit {
  isLoading = false;
  errorMessage: string | null = null;
  loginForm!: FormGroup;
  registerForm!: FormGroup;
  hidePassword = true;
  activeTab: 'login' | 'register' = 'login';

  constructor(
    private authService: EdcCompliantAuthService,
    private router: Router,
    private fb: FormBuilder
  ) {}

  ngOnInit(): void {
    this.authService.user$.subscribe(user => {
      if (user) {
        this.router.navigate(['/dashboard']);
      }
    });

    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required]]
    });

    this.registerForm = this.fb.group({
      displayName: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]]
    });
  }

  async signInWithGoogle(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = null;
    try {
      await this.authService.signInWithGoogle();
    } catch (error: any) {
      this.errorMessage = error.message || 'An unknown error occurred during sign-in.';
      console.error('Google Sign-In failed:', error);
    } finally {
      this.isLoading = false;
    }
  }

  async signInWithEmail(): Promise<void> {
    if (this.loginForm.invalid) {
      return;
    }
    this.isLoading = true;
    this.errorMessage = null;
    try {
      const { email, password } = this.loginForm.value;
      await this.authService.loginWithCredentials({ email, password });
    } catch (error: any) {
      this.errorMessage = error.message || 'An unknown error occurred during sign-in.';
      console.error('Email Sign-In failed:', error);
    } finally {
      this.isLoading = false;
    }
  }

  async registerWithEmail(): Promise<void> {
    if (this.registerForm.invalid) {
      return;
    }
    this.isLoading = true;
    this.errorMessage = null;
    try {
      const { displayName, email, password } = this.registerForm.value;
      await this.authService.register({ displayName, email, password });
    } catch (error: any) {
      this.errorMessage = error.message || 'An unknown error occurred during registration.';
      console.error('Registration failed:', error);
    } finally {
      this.isLoading = false;
    }
  }
}
