import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService, Toast } from '../../services/toast.service';
import { Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-container">
      <div *ngFor="let toast of toasts" 
           class="toast"
           [ngClass]="'toast-' + toast.type">
        <i class="material-icons">{{ getIcon(toast.type) }}</i>
        <span class="toast-message">{{ toast.message }}</span>
        <button class="toast-close" (click)="removeToast(toast)">
          <i class="material-icons">close</i>
        </button>
      </div>
    </div>
  `,
  styleUrls: ['./toast.component.scss']
})
export class ToastComponent implements OnInit, OnDestroy {
  toasts: Toast[] = [];
  private destroy$ = new Subject<void>();
  
  constructor(private toastService: ToastService) {}
  
  ngOnInit() {
    this.toastService.toast$
      .pipe(takeUntil(this.destroy$))
      .subscribe(toast => {
        this.toasts.push(toast);
        
        // Auto remove after duration
        if (toast.duration) {
          setTimeout(() => {
            this.removeToast(toast);
          }, toast.duration);
        }
      });
  }
  
  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
  
  removeToast(toast: Toast) {
    const index = this.toasts.indexOf(toast);
    if (index > -1) {
      this.toasts.splice(index, 1);
    }
  }
  
  getIcon(type: string): string {
    switch (type) {
      case 'success': return 'check_circle';
      case 'error': return 'error';
      case 'warning': return 'warning';
      case 'info': return 'info';
      default: return 'info';
    }
  }
}
