import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-unauthorized',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="unauthorized-container">
      <div class="unauthorized-content">
        <h1>Access Denied</h1>
        <p>You do not have permission to access this page.</p>
        <p>Please contact your administrator if you believe you should have access.</p>
        <a routerLink="/dashboard" class="back-link">Return to Dashboard</a>
      </div>
    </div>
  `,
  styles: [`
    .unauthorized-container {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f5f5f5;
    }

    .unauthorized-content {
      text-align: center;
      padding: 40px;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      max-width: 400px;
    }

    h1 {
      color: #f44336;
      margin: 0 0 16px;
    }

    p {
      color: #666;
      margin: 0 0 16px;
    }

    .back-link {
      display: inline-block;
      padding: 12px 24px;
      background: #2196f3;
      color: white;
      text-decoration: none;
      border-radius: 4px;
      margin-top: 16px;
      transition: background 0.3s ease;
    }

    .back-link:hover {
      background: #1976d2;
    }
  `]
})
export class UnauthorizedComponent {}
