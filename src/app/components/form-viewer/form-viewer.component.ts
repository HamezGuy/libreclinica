import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { FormTemplate, FormField } from '../../models/form-template.model';
import { TranslatePipe } from '../../pipes/translate.pipe';

@Component({
  selector: 'app-form-viewer',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe],
  templateUrl: './form-viewer.component.html',
  styleUrls: ['./form-viewer.component.scss']
})
export class FormViewerComponent implements OnInit {
  @Input() template: FormTemplate | null = null;
  @Input() initialData: any = {};
  @Input() readOnly: boolean = false;
  @Output() formSubmit = new EventEmitter<any>();
  @Output() formSave = new EventEmitter<any>();
  
  form!: FormGroup;
  
  constructor(private fb: FormBuilder) {}
  
  ngOnInit() {
    this.buildForm();
  }
  
  buildForm() {
    if (!this.template) return;
    
    const formControls: any = {};
    
    this.template.fields.forEach(field => {
      const validators = [];
      if (field.required) {
        validators.push(Validators.required);
      }
      
      const initialValue = this.initialData[field.id] || field.defaultValue || '';
      formControls[field.id] = this.fb.control(
        { value: initialValue, disabled: this.readOnly },
        validators
      );
    });
    
    this.form = this.fb.group(formControls);
  }
  
  onSubmit() {
    if (this.form.valid && !this.readOnly) {
      this.formSubmit.emit(this.form.getRawValue());
    }
  }
  
  onSaveDraft() {
    if (!this.readOnly) {
      this.formSave.emit(this.form.getRawValue());
    }
  }
  
  getFieldType(field: FormField): string {
    switch (field.type) {
      case 'text':
      case 'number':
      case 'email':
      case 'date':
        return field.type;
      default:
        return 'text';
    }
  }
}
