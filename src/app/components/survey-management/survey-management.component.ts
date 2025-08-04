import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Survey, SurveyStatus, SurveyType } from '../../models/survey.model';
import { SurveyService } from '../../services/survey.service';
import { ToastService } from '../../services/toast.service';
import { SurveyEditorComponent } from '../survey-editor/survey-editor.component';
import { SurveyPopupComponent } from '../survey-popup/survey-popup.component';

@Component({
  selector: 'app-survey-management',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, SurveyEditorComponent, SurveyPopupComponent],
  templateUrl: './survey-management.component.html',
  styleUrls: ['./survey-management.component.scss']
})
export class SurveyManagementComponent implements OnInit {
  surveys: Survey[] = [];
  filteredSurveys: Survey[] = [];
  isLoading = false;
  
  // Filters
  statusFilter: SurveyStatus | 'all' = 'all';
  typeFilter: SurveyType | 'all' = 'all';
  searchQuery = '';
  
  // Editor state
  showEditor = false;
  editingSurvey: Survey | null = null;
  
  // Preview state
  selectedSurveyForPreview: Survey | null = null;
  
  // Pagination
  currentPage = 1;
  pageSize = 10;
  
  constructor(
    private surveyService: SurveyService,
    private toastService: ToastService
  ) {}
  
  ngOnInit() {
    this.loadSurveys();
  }
  
  async loadSurveys() {
    this.isLoading = true;
    try {
      this.surveys = await this.surveyService.getSurveys();
      this.applyFilters();
    } catch (error) {
      console.error('Error loading surveys:', error);
      this.toastService.error('Failed to load surveys');
    } finally {
      this.isLoading = false;
    }
  }
  
  applyFilters() {
    this.filteredSurveys = this.surveys.filter(survey => {
      // Status filter
      if (this.statusFilter !== 'all' && survey.status !== this.statusFilter) {
        return false;
      }
      
      // Type filter
      if (this.typeFilter !== 'all' && survey.type !== this.typeFilter) {
        return false;
      }
      
      // Search filter
      if (this.searchQuery) {
        const query = this.searchQuery.toLowerCase();
        return survey.title.toLowerCase().includes(query) ||
               survey.description?.toLowerCase().includes(query);
      }
      
      return true;
    });
  }
  
  createSurvey() {
    this.editingSurvey = null;
    this.showEditor = true;
  }
  
  editSurvey(survey: Survey) {
    this.editingSurvey = survey;
    this.showEditor = true;
  }
  
  async duplicateSurvey(survey: Survey) {
    try {
      const duplicated = await this.surveyService.duplicateSurvey(survey.id!);
      this.toastService.success('Survey duplicated successfully');
      await this.loadSurveys();
      this.editSurvey(duplicated);
    } catch (error) {
      console.error('Error duplicating survey:', error);
      this.toastService.error('Failed to duplicate survey');
    }
  }
  
  async deleteSurvey(survey: Survey) {
    if (!confirm(`Are you sure you want to delete "${survey.title}"?`)) {
      return;
    }
    
    try {
      await this.surveyService.deleteSurvey(survey.id!);
      this.toastService.success('Survey deleted successfully');
      await this.loadSurveys();
    } catch (error) {
      console.error('Error deleting survey:', error);
      this.toastService.error('Failed to delete survey');
    }
  }
  
  async toggleSurveyStatus(survey: Survey) {
    const newStatus = survey.status === 'active' ? 'paused' : 'active';
    try {
      await this.surveyService.updateSurvey(survey.id!, { 
        status: newStatus,
        isActive: newStatus === 'active'
      });
      this.toastService.success(`Survey ${newStatus === 'active' ? 'activated' : 'paused'}`);
      await this.loadSurveys();
    } catch (error) {
      console.error('Error updating survey status:', error);
      this.toastService.error('Failed to update survey status');
    }
  }
  
  previewSurvey(survey: Survey) {
    this.selectedSurveyForPreview = survey;
  }
  
  viewAnalytics(survey: Survey) {
    // TODO: Navigate to analytics view
    console.log('View analytics for survey:', survey.id);
  }
  
  async onSurveySaved(survey: Survey) {
    this.showEditor = false;
    this.editingSurvey = null;
    await this.loadSurveys();
    this.toastService.success(survey.id ? 'Survey updated successfully' : 'Survey created successfully');
  }
  
  onEditorClose() {
    this.showEditor = false;
    this.editingSurvey = null;
  }
  
  onPreviewClose() {
    this.selectedSurveyForPreview = null;
  }
  
  onPreviewComplete(response: any) {
    console.log('Preview response:', response);
    this.toastService.info('This is a preview - response not saved');
  }
  
  // Helper method for template
  getCompletionTimeInMinutes(seconds: number | undefined): number {
    return seconds ? Math.ceil(seconds / 60) : 0;
  }
  
  // Pagination
  get paginatedSurveys(): Survey[] {
    const start = (this.currentPage - 1) * this.pageSize;
    const end = start + this.pageSize;
    return this.filteredSurveys.slice(start, end);
  }
  
  get totalPages(): number {
    return Math.ceil(this.filteredSurveys.length / this.pageSize);
  }
  
  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
    }
  }
  
  previousPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
    }
  }
  
  // Helpers
  getSurveyTypeLabel(type: SurveyType): string {
    const labels: Record<SurveyType, string> = {
      feedback: 'Feedback',
      satisfaction: 'Satisfaction',
      nps: 'NPS',
      research: 'Research',
      screening: 'Screening',
      custom: 'Custom'
    };
    return labels[type] || type;
  }
  
  getSurveyStatusClass(status: SurveyStatus): string {
    const classes: Record<SurveyStatus, string> = {
      draft: 'badge-secondary',
      active: 'badge-success',
      paused: 'badge-warning',
      completed: 'badge-info',
      archived: 'badge-dark'
    };
    return classes[status] || 'badge-secondary';
  }
  
  getSurveyIcon(type: SurveyType): string {
    const icons: Record<SurveyType, string> = {
      feedback: 'fas fa-comment-dots',
      satisfaction: 'fas fa-smile',
      nps: 'fas fa-chart-line',
      research: 'fas fa-microscope',
      screening: 'fas fa-clipboard-check',
      custom: 'fas fa-cog'
    };
    return icons[type] || 'fas fa-poll';
  }
}
