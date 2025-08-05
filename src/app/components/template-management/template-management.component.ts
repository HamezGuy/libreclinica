import { Component, EventEmitter, Input, Output, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FormTemplate } from '../../models/form-template.model';
import { FormPermissions } from '../dashboard/dashboard.component';

@Component({
  selector: 'app-template-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './template-management.component.html',
  styleUrls: ['./template-management.component.scss']
})
export class TemplateManagementComponent implements OnInit {
  @Input() templates: FormTemplate[] = [];
  @Input() permissions: FormPermissions = {
    canView: false,
    canCreate: false,
    canEdit: false,
    canDelete: false,
    canPublish: false
  };
  @Input() isVisible = false;
  
  @Output() close = new EventEmitter<void>();
  @Output() createTemplate = new EventEmitter<void>();
  @Output() editTemplate = new EventEmitter<FormTemplate>();
  @Output() deleteTemplate = new EventEmitter<FormTemplate>();
  @Output() publishTemplate = new EventEmitter<FormTemplate>();
  @Output() duplicateTemplate = new EventEmitter<FormTemplate>();
  @Output() exportTemplate = new EventEmitter<FormTemplate>();
  @Output() fillTemplate = new EventEmitter<FormTemplate>();
  
  // Component state
  selectedTemplate: FormTemplate | null = null;
  viewMode: 'details' | 'preview' = 'details';
  templateSearchTerm = '';
  templateFilter: 'all' | 'draft' | 'published' = 'all';
  filteredTemplates: FormTemplate[] = [];
  
  ngOnInit(): void {
    this.filterTemplates();
  }
  
  ngOnChanges(): void {
    this.filterTemplates();
  }
  
  filterTemplates(): void {
    let filtered = [...this.templates];
    
    // Apply search filter
    if (this.templateSearchTerm) {
      const searchLower = this.templateSearchTerm.toLowerCase();
      filtered = filtered.filter(template => 
        template.name.toLowerCase().includes(searchLower) ||
        (template.description && template.description.toLowerCase().includes(searchLower)) ||
        (template.category && template.category.toLowerCase().includes(searchLower))
      );
    }
    
    // Apply status filter
    if (this.templateFilter !== 'all') {
      filtered = filtered.filter(template => template.status === this.templateFilter);
    }
    
    this.filteredTemplates = filtered;
  }
  
  setTemplateFilter(filter: 'all' | 'draft' | 'published'): void {
    this.templateFilter = filter;
    this.filterTemplates();
  }
  
  selectTemplate(template: FormTemplate): void {
    this.selectedTemplate = template;
    this.viewMode = 'details';
  }
  
  setViewMode(mode: 'details' | 'preview'): void {
    this.viewMode = mode;
  }
  
  previewTemplate(template: FormTemplate): void {
    this.selectedTemplate = template;
    this.viewMode = 'preview';
  }
  
  onEditTemplate(template: FormTemplate): void {
    this.editTemplate.emit(template);
  }
  
  onDeleteTemplate(template: FormTemplate): void {
    this.deleteTemplate.emit(template);
  }
  
  onPublishTemplate(template: FormTemplate): void {
    this.publishTemplate.emit(template);
  }
  
  onDuplicateTemplate(template: FormTemplate): void {
    this.duplicateTemplate.emit(template);
  }
  
  onExportTemplate(template: FormTemplate): void {
    this.exportTemplate.emit(template);
  }
  
  onFillTemplate(template: FormTemplate): void {
    this.fillTemplate.emit(template);
  }
  
  onCreateTemplate(): void {
    this.createTemplate.emit();
  }
  
  onClose(): void {
    this.close.emit();
  }
  
  getTemplateCountByStatus(status: 'draft' | 'published'): number {
    return this.templates.filter(t => t.status === status).length;
  }
  
  getFieldIcon(fieldType: string): string {
    const iconMap: { [key: string]: string } = {
      'text': 'text_fields',
      'number': 'pin',
      'date': 'calendar_today',
      'time': 'schedule',
      'datetime': 'event',
      'select': 'list',
      'multiselect': 'checklist',
      'radio': 'radio_button_checked',
      'checkbox': 'check_box',
      'textarea': 'notes',
      'file': 'attach_file',
      'signature': 'draw',
      'calculated': 'calculate',
      'hidden': 'visibility_off'
    };
    return iconMap[fieldType] || 'help_outline';
  }
  
  trackTemplate(index: number, template: FormTemplate): string {
    return template.id || index.toString();
  }
  
  trackField(index: number, field: any): string {
    return field.id || index.toString();
  }
  
  convertTimestampToDate(timestamp: any): Date | null {
    if (!timestamp) return null;
    
    // Handle Firestore Timestamp objects
    if (timestamp && typeof timestamp.toDate === 'function') {
      return timestamp.toDate();
    }
    
    // Handle already converted Date objects
    if (timestamp instanceof Date) {
      return timestamp;
    }
    
    // Handle string dates
    if (typeof timestamp === 'string') {
      return new Date(timestamp);
    }
    
    // Handle timestamp numbers (milliseconds)
    if (typeof timestamp === 'number') {
      return new Date(timestamp);
    }
    
    return null;
  }
}
