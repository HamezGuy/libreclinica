import { Component, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilderComponent } from '../form-builder/form-builder.component';
import { FormTemplate } from '../../models/form-template.model';

@Component({
  selector: 'app-form-builder-modal',
  standalone: true,
  imports: [CommonModule, FormBuilderComponent],
  templateUrl: './form-builder-modal.component.html',
  styleUrls: ['./form-builder-modal.component.scss']
})
export class FormBuilderModalComponent {
  @Input() show = false;
  @Input() templateId?: string;
  @Input() initialTemplateData?: Partial<FormTemplate>;
  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<FormTemplate>();

  @ViewChild(FormBuilderComponent) formBuilder?: FormBuilderComponent;

  onClose(): void {
    // Check if form has unsaved changes
    if (this.formBuilder?.hasUnsavedChanges) {
      const confirmClose = confirm('You have unsaved changes. Are you sure you want to close without saving?');
      if (!confirmClose) {
        return;
      }
    }
    
    this.close.emit();
  }

  onFormSaved(template: FormTemplate): void {
    this.save.emit(template);
    this.close.emit();
  }

  onFormCancelled(): void {
    this.onClose();
  }

  // Prevent closing by clicking outside
  onBackdropClick(event: MouseEvent): void {
    event.stopPropagation();
    // Do nothing - modal can only be closed via X button or cancel
  }
}
