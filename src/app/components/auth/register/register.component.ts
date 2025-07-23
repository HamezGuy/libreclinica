import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { EdcCompliantAuthService } from '../../../services/edc-compliant-auth.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss']
})
export class RegisterComponent implements OnInit, OnDestroy {
  registerForm!: FormGroup;
  isLoading = false;
  errorMessage: string | null = null;
  successMessage: string | null = null;
  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private authService: EdcCompliantAuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    // Check if user is already authenticated
    this.authService.user$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(user => {
      if (user) {
        this.router.navigate(['/dashboard']);
      }
    });

    this.registerForm = this.fb.group({
      displayName: ['', [Validators.required, Validators.minLength(2)]],
      username: ['', [Validators.required, Validators.minLength(3), Validators.pattern(/^[a-zA-Z0-9_]+$/)]],
      email: ['', [Validators.required, Validators.email]],
      role: ['', [Validators.required]],
      organization: ['', [Validators.required]],
      password: ['', [Validators.required, Validators.minLength(8), this.strongPasswordValidator]],
      confirmPassword: ['', [Validators.required]]
    }, { validators: this.passwordMatchValidator });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  strongPasswordValidator(control: AbstractControl): ValidationErrors | null {
    const value = control.value;
    if (!value) return null;

    const hasNumber = /[0-9]/.test(value);
    const hasUpper = /[A-Z]/.test(value);
    const hasLower = /[a-z]/.test(value);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(value);

    const valid = hasNumber && hasUpper && hasLower && hasSpecial;
    
    if (!valid) {
      return { 
        strongPassword: {
          hasNumber,
          hasUpper,
          hasLower,
          hasSpecial
        }
      };
    }
    return null;
  }

  passwordMatchValidator(group: AbstractControl): ValidationErrors | null {
    const password = group.get('password')?.value;
    const confirmPassword = group.get('confirmPassword')?.value;
    
    if (password && confirmPassword && password !== confirmPassword) {
      return { passwordMismatch: true };
    }
    return null;
  }

  async onSubmit(): Promise<void> {
    if (this.registerForm.invalid) {
      Object.keys(this.registerForm.controls).forEach(key => {
        this.registerForm.get(key)?.markAsTouched();
      });
      return;
    }

    this.isLoading = true;
    this.errorMessage = null;
    this.successMessage = null;

    try {
      const formData = this.registerForm.value;
      
      await this.authService.register({ 
        displayName: formData.displayName.trim(), 
        username: formData.username.trim().toLowerCase(), 
        email: formData.email.trim().toLowerCase(), 
        password: formData.password,
        role: formData.role,
        organization: formData.organization.trim()
      });
      
      this.successMessage = 'Registration successful! Your account is pending approval. You will be notified once it is activated.';
      this.registerForm.reset();
      
      // Redirect to login after 5 seconds
      setTimeout(() => {
        this.router.navigate(['/login']);
      }, 5000);
      
    } catch (error: any) {
      this.errorMessage = error.message || 'An unexpected error occurred during registration.';
      console.error('Registration error:', error);
    } finally {
      this.isLoading = false;
    }
  }

  get displayNameControl() {
    return this.registerForm.get('displayName');
  }

  get usernameControl() {
    return this.registerForm.get('username');
  }

  get emailControl() {
    return this.registerForm.get('email');
  }

  get roleControl() {
    return this.registerForm.get('role');
  }

  get organizationControl() {
    return this.registerForm.get('organization');
  }

  get passwordControl() {
    return this.registerForm.get('password');
  }

  get confirmPasswordControl() {
    return this.registerForm.get('confirmPassword');
  }
}