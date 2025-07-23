import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { EdcCompliantAuthService } from '../../services/edc-compliant-auth.service';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="admin-container">
      <header class="admin-header">
        <h1>Admin Dashboard</h1>
        <nav>
          <a routerLink="/dashboard" class="nav-link">Back to Dashboard</a>
        </nav>
      </header>
      
      <main class="admin-content">
        <div class="admin-section">
          <h2>User Management</h2>
          <p>Manage user roles and permissions</p>
          <!-- User management functionality will be added here -->
        </div>
        
        <div class="admin-section">
          <h2>Study Management</h2>
          <p>Create and manage clinical studies</p>
          <!-- Study management functionality will be added here -->
        </div>
        
        <div class="admin-section">
          <h2>Compliance Settings</h2>
          <p>Configure compliance and regulatory settings</p>
          <!-- Compliance settings will be added here -->
        </div>
        
        <div class="admin-section">
          <h2>Audit Logs</h2>
          <p>View system audit trails</p>
          <!-- Audit log viewer will be added here -->
        </div>
      </main>
    </div>
  `,
  styles: [`
    .admin-container {
      min-height: 100vh;
      background: #f5f5f5;
    }

    .admin-header {
      background: white;
      padding: 20px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .admin-header h1 {
      margin: 0;
      color: #333;
    }

    .nav-link {
      color: #2196f3;
      text-decoration: none;
      padding: 8px 16px;
      border: 1px solid #2196f3;
      border-radius: 4px;
      transition: all 0.3s ease;
    }

    .nav-link:hover {
      background: #2196f3;
      color: white;
    }

    .admin-content {
      max-width: 1200px;
      margin: 0 auto;
      padding: 24px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 24px;
    }

    .admin-section {
      background: white;
      padding: 24px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
    }

    .admin-section h2 {
      margin: 0 0 12px;
      color: #333;
      font-size: 20px;
    }

    .admin-section p {
      margin: 0;
      color: #666;
    }
  `]
})
export class AdminComponent {
  private authService = inject(EdcCompliantAuthService);
}
