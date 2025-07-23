import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { EdcCompliantAuthService } from '../../services/edc-compliant-auth.service';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';

@Component({
  selector: 'app-authentication',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule
  ],
  templateUrl: './authentication.component.html',
  styleUrls: ['./authentication.component.scss']
})
export class AuthenticationComponent implements OnInit {
  isLoading = false;
  errorMessage: string | null = null;

  constructor(
    private authService: EdcCompliantAuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    // Check if user is already logged in
    this.authService.user$.subscribe(user => {
      if (user) {
        this.router.navigate(['/dashboard']);
      }
    });
  }

  async signInWithGoogle(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = null;
    try {
      await this.authService.signInWithGoogle();
      // The auth guard will redirect to the correct page after login
    } catch (error: any) {
      this.errorMessage = error.message || 'An unknown error occurred during sign-in.';
      console.error('Google Sign-In failed:', error);
    } finally {
      this.isLoading = false;
    }
  }
}
