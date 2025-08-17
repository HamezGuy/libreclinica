import { Component, EventEmitter, Input, Output, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormTemplate } from '../../models/form-template.model';
import { FormPreviewComponent } from '../form-preview/form-preview.component';
import { TranslatePipe } from '../../pipes/translate.pipe';

@Component({
  selector: 'app-template-gallery',
  standalone: true,
  imports: [CommonModule, FormPreviewComponent, TranslatePipe],
  templateUrl: './template-gallery.component.html',
  styleUrls: ['./template-gallery.component.scss']
})
export class TemplateGalleryComponent implements OnInit {
  @Input() templates: FormTemplate[] = [];
  @Input() selectedTemplates: string[] = [];
  @Output() templateSelected = new EventEmitter<FormTemplate>();
  
  showPreview = false;
  previewTemplate: FormTemplate | null = null;
  
  ngOnInit(): void {
    console.log('[TemplateGallery] Component initialized with templates:', this.templates);
  }
  
  ngOnChanges(): void {
    console.log('[TemplateGallery] Templates changed:', this.templates);
    console.log('[TemplateGallery] Selected templates:', this.selectedTemplates);
  }
  
  isSelected(templateId: string): boolean {
    return this.selectedTemplates.includes(templateId);
  }
  
  onTemplateClick(template: FormTemplate): void {
    this.previewTemplate = template;
    this.showPreview = true;
  }
  
  onSelectTemplate(template: FormTemplate): void {
    this.templateSelected.emit(template);
    this.showPreview = false;
  }
  
  closePreview(): void {
    this.showPreview = false;
    this.previewTemplate = null;
  }
  
  getTemplateIcon(template: FormTemplate): string {
    // Return appropriate icon based on template type
    if (template.isPatientTemplate) return 'person';
    if (template.isStudySubjectTemplate) return 'assignment_ind';
    if (template.isPatientTemplate || template.isStudySubjectTemplate) return 'security';
    return 'description';
  }
  
  getTemplateTypeLabel(template: FormTemplate): string {
    if (template.isPatientTemplate) return 'Patient Template';
    if (template.isStudySubjectTemplate) return 'Study Subject';
    if (template.templateType === 'form') return 'Standard Form';
    return 'Form Template';
  }
}
