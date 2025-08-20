import { Component, Inject, OnInit } from '@angular/core';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import * as XLSX from 'xlsx';
import { FormTemplate, FormField } from '../../models/form-template.model';
import { FormTemplateService } from '../../services/form-template.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatRadioModule } from '@angular/material/radio';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatCardModule } from '@angular/material/card';

export interface ExcelConversionDialogData {
  mode: 'import' | 'export';
  template?: FormTemplate;
  templates?: FormTemplate[];
}

interface FieldMapping {
  excelField: string;
  templateField: string;
  fieldType: string;
  matched: boolean;
}

@Component({
  selector: 'app-excel-conversion-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    TranslatePipe,
    MatDialogModule,
    MatSelectModule,
    MatTableModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatDividerModule,
    MatRadioModule,
    MatExpansionModule,
    MatCardModule
  ],
  templateUrl: './excel-conversion-dialog.component.html',
  styleUrls: ['./excel-conversion-dialog.component.scss']
})
export class ExcelConversionDialogComponent implements OnInit {
  form: FormGroup;
  
  // UI State
  currentStep: 'upload' | 'configure' | 'preview' | 'complete' = 'upload';
  isProcessing = false;
  
  // File handling
  selectedFile: File | null = null;
  excelData: any = null;
  
  // Conversion
  conversionResult: any = null;
  fieldMappings: any[] = [];
  selectedTemplate: FormTemplate | null = null;
  hasUniqueNames: boolean = true;
  duplicateNames: string[] = [];
  matchedTemplate: FormTemplate | null = null;
  templateMatchScore: number = 0;
  showTemplateSelector: boolean = false;
  exportOrientation: 'row' | 'column' = 'row';
  includeData = false;
  filteredFieldNames: string[] = [];
  metadataColumns: string[] = [];
  
  // Parse options
  parseOptions: any = {
    orientation: 'auto',
    headerRow: 0,
    headerColumn: 0,
    dataStartRow: 1,
    dataStartColumn: 1
  };
  
  // Preview data
  previewHeaders: string[] = [];
  previewRows: any[][] = [];
  
  constructor(
    public dialogRef: MatDialogRef<ExcelConversionDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    private fb: FormBuilder,
    private templateService: FormTemplateService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {
    this.form = this.fb.group({
      templateName: ['', Validators.required],
      templateDescription: [''],
      selectedTemplate: [null],
      orientation: ['auto'],
      headerRow: [0, [Validators.min(0)]],
      headerColumn: [0, [Validators.min(0)]],
      dataStartRow: [1, [Validators.min(0)]],
      dataStartColumn: [1, [Validators.min(0)]]
    });
  }

  ngOnInit(): void {
    if (this.data.mode === 'export' && this.data.template) {
      this.form.patchValue({
        selectedTemplate: this.data.template.id,
        templateName: this.data.template.name
      });
    }
  }

  onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      this.selectedFile = file;
      this.parseExcelFile();
    }
  }

  async parseExcelFile(): Promise<void> {
    if (!this.selectedFile) return;
    
    this.isProcessing = true;
    
    try {
      // Parse with current options
      const reader = new FileReader();
      reader.onload = (e: any) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        if (jsonData.length > 0) {
          this.excelData = {
            headers: jsonData[0] as string[],
            rows: jsonData.slice(1)
          };
          
          // Update preview
          this.updatePreview();
          
          // Move to configure step
          this.currentStep = 'configure';
        }
      };
      reader.readAsArrayBuffer(this.selectedFile);
      
      // Update preview
      this.updatePreview();
      
      // Move to configure step
      this.currentStep = 'configure';
      
    } catch (error) {
      console.error('Error parsing Excel file:', error);
      // Show error to user
    } finally {
      this.isProcessing = false;
    }
  }

  updatePreview(): void {
    if (!this.excelData) return;
    
    this.previewHeaders = this.excelData.headers;
    this.previewRows = this.excelData.rows.slice(0, 10); // Show first 10 rows
    
    // Identify metadata columns vs data fields
    this.identifyFieldTypes();
  }
  
  /**
   * Identify which columns are metadata vs actual data fields
   */
  private identifyFieldTypes(): void {
    const patientMetadataColumns = [
      'Patient Number', 'Patient Name', 'Patient ID', 'Subject ID',
      'Date of Birth', 'DOB', 'Age', 'Gender', 'Sex',
      'Study ID', 'Site ID', 'Site Name', 'Investigator',
      'Form Status', 'Completed Date', 'Completion Date',
      'Visit Date', 'Visit Number', 'Visit Name',
      'Created Date', 'Modified Date', 'Last Updated',
      'Entered By', 'Modified By', 'Reviewed By',
      'Row Number', 'Record ID', 'Sequence Number'
    ];
    
    this.metadataColumns = [];
    this.filteredFieldNames = [];
    
    this.previewHeaders.forEach(header => {
      const headerLower = header.toLowerCase().trim();
      const isMetadata = patientMetadataColumns.some(metaCol => 
        metaCol.toLowerCase() === headerLower
      );
      
      if (isMetadata) {
        this.metadataColumns.push(header);
      } else {
        this.filteredFieldNames.push(header);
      }
    });
  }

  onOrientationChange(): void {
    const orientation = this.form.get('orientation')?.value;
    if (orientation && orientation !== 'auto') {
      this.parseOptions.orientation = orientation;
      this.parseExcelFile();
    }
  }

  onParseOptionsChange(): void {
    // Update parse options from form
    this.parseOptions = {
      orientation: this.form.get('orientation')?.value || 'auto',
      headerRow: this.form.get('headerRow')?.value || 0,
      headerColumn: this.form.get('headerColumn')?.value || 0,
      dataStartRow: this.form.get('dataStartRow')?.value || 1,
      dataStartColumn: this.form.get('dataStartColumn')?.value || 1
    };
    
    this.parseExcelFile();
  }

  async convertExcelToTemplate(): Promise<void> {
    if (!this.selectedFile || !this.excelData) return;
    
    // Check for unique names first
    if (!this.hasUniqueNames) {
      this.showToast('Cannot proceed: Field names must be unique. Duplicate names found: ' + this.duplicateNames.join(', '), 'error');
      return;
    }
    
    this.isProcessing = true;
    
    try {
      const templateName = this.form.get('templateName')?.value;
      const selectedTemplateId = this.form.get('selectedTemplate')?.value;
      
      // Get existing template if selected
      let existingTemplate: FormTemplate | undefined;
      if (selectedTemplateId) {
        const template = await this.templateService.getTemplate(selectedTemplateId);
        existingTemplate = template || undefined;
      }
      
      // Convert Excel to template - create partial template for form builder
      const template: any = {
        id: '',
        name: templateName,
        description: this.form.get('templateDescription')?.value || '',
        version: 1.0,
        status: 'draft',
        fields: this.filteredFieldNames.map((fieldName, index) => ({
          id: this.generateFieldId(),
          name: fieldName,
          label: fieldName,
          type: 'text',
          required: false,
          readonly: false,
          placeholder: '',
          helpText: '',
          validationRules: [],
          options: [],
          conditionalLogic: undefined,
          hidden: false,
          isPhiField: false,
          auditRequired: false,
          order: index
        })),
        sections: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: '',
        phiDataFields: [],
        category: 'general',
        templateType: 'form',
        isPatientTemplate: false,
        isStudySubjectTemplate: false
      };
      
      this.conversionResult = {
        success: true,
        template: template,
        errors: [],
        warnings: []
      };
      
      if (this.conversionResult.success) {
        // Create field mappings for preview
        this.createFieldMappings();
        
        // Check for errors and warnings
        if (this.conversionResult.errors.length > 0) {
          // Show blocking errors
          this.showErrors(this.conversionResult.errors);
          return;
        }
        
        if (this.conversionResult.warnings.length > 0) {
          // Show warnings but allow to proceed
          this.showWarnings(this.conversionResult.warnings);
        }
        
        // Move to preview step
        this.currentStep = 'preview';
      } else {
        // Show errors
        this.showErrors(this.conversionResult.errors);
      }
      
    } catch (error) {
      console.error('Error converting to template:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  private generateFieldId(): string {
    return 'field_' + Math.random().toString(36).substr(2, 9);
  }

  private createFieldMappingsOld(): void {
    if (!this.conversionResult?.template || !this.excelData) return;
    
    this.fieldMappings = [];
    
    const template = this.conversionResult.template;
    const excelFieldNames = this.excelData.headers;
    
    // Create mappings
    for (const excelField of excelFieldNames) {
      const templateField = template.fields.find((f: FormField) => f.name === excelField);
      
      this.fieldMappings.push({
        excelField,
        templateField: templateField?.name || '',
        fieldType: templateField?.type || 'unknown',
        matched: !!templateField
      });
    }
    
    // Add template fields not in Excel
    for (const field of template.fields) {
      if (!excelFieldNames.includes(field.name)) {
        this.fieldMappings.push({
          excelField: '',
          templateField: field.name,
          fieldType: field.type,
          matched: false
        });
      }
    }
  }

  async exportToExcel(): Promise<void> {
    if (!this.data.template) return;
    
    this.isProcessing = true;
    
    try {
      // Export template to Excel
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(this.data.template.fields);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
      XLSX.writeFile(workbook, 'template.xlsx');
      
      // Close dialog
      this.dialogRef.close({ success: true });
      
    } catch (error) {
      console.error('Error exporting to Excel:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  async saveTemplate(): Promise<void> {
    if (!this.conversionResult?.template) return;
    
    this.isProcessing = true;
    
    try {
      const template = this.conversionResult.template;
      
      // Add description if provided
      const description = this.form.get('templateDescription')?.value;
      if (description) {
        template.description = description;
      }
      
      // Save template
      const savedTemplate = await this.templateService.createTemplate(template);
      
      // Close dialog with success
      this.dialogRef.close({ 
        success: true, 
        template: savedTemplate 
      });
      
    } catch (error) {
      console.error('Error saving template:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  showErrors(errors: string[]): void {
    // In a real implementation, show these in a snackbar or alert
    console.error('Conversion errors:', errors);
    alert('Conversion Errors:\n\n' + errors.join('\n'));
  }

  showWarnings(warnings: string[]): void {
    // In a real implementation, show these in a snackbar
    console.warn('Conversion warnings:', warnings);
    if (confirm('Warnings detected:\n\n' + warnings.join('\n') + '\n\nDo you want to continue?')) {
      // User chose to continue
    } else {
      // User chose to cancel
      this.currentStep = 'configure';
    }
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  // Helper methods
  get isImportMode(): boolean {
    return this.data.mode === 'import';
  }

  get isExportMode(): boolean {
    return this.data.mode === 'export';
  }

  get canProceed(): boolean {
    switch (this.currentStep) {
      case 'upload':
        return !!this.selectedFile && !!this.excelData;
      case 'configure':
        return this.form.valid && !!this.excelData;
      case 'preview':
        return !!this.conversionResult?.template;
      default:
        return false;
    }
  }

  get hasErrors(): boolean {
    return (this.conversionResult?.errors.length || 0) > 0;
  }

  get hasWarnings(): boolean {
    return (this.conversionResult?.warnings.length || 0) > 0;
  }

  get unmatchedFieldsCount(): number {
    return this.fieldMappings.filter(m => !m.matched).length;
  }

  getColumnHeaders(): string[] {
    if (!this.previewHeaders.length) return [];
    return this.previewHeaders.map((_, i) => `col${i}`);
  }

  getMatchedFieldsCount(): number {
    return this.fieldMappings.filter(m => m.matched).length;
  }

  /**
   * Check if field names are unique (excluding metadata columns)
   */
  checkUniqueNames(): void {
    // Only check uniqueness for actual data fields, not metadata
    const names = this.filteredFieldNames;
    const nameCount = new Map<string, number>();
    
    names.forEach(name => {
      const count = nameCount.get(name) || 0;
      nameCount.set(name, count + 1);
    });
    
    this.duplicateNames = [];
    nameCount.forEach((count, name) => {
      if (count > 1) {
        this.duplicateNames.push(name);
      }
    });
    
    this.hasUniqueNames = this.duplicateNames.length === 0;
    
    if (!this.hasUniqueNames && this.conversionResult) {
      this.conversionResult.errors.push({
        field: 'Field Names',
        message: `Duplicate field names found: ${this.duplicateNames.join(', ')}. Each field must have a unique name.`,
        severity: 'error'
      });
    }
    
    // Show info about filtered columns
    if (this.metadataColumns.length > 0) {
      this.showToast(
        `Detected ${this.metadataColumns.length} patient metadata column(s) that will be excluded from template. ` +
        `Template will use ${this.filteredFieldNames.length} unique field(s).`,
        'info'
      );
    }
  }

  /**
   * Find the best matching template based on field names
   */
  findMatchingTemplate(): void {
    if (!this.data.templates || this.data.templates.length === 0) return;
    
    // Use filtered field names only (exclude metadata)
    const excelFields = new Set(this.filteredFieldNames.map(h => h.toLowerCase().trim()));
    let bestMatch: FormTemplate | null = null;
    let bestScore = 0;
    
    this.data.templates.forEach((template: FormTemplate) => {
      if (!template.fields) return;
      
      const templateFields = new Set(template.fields.map(f => f.name.toLowerCase().trim()));
      
      // Calculate match score
      let matchCount = 0;
      templateFields.forEach(field => {
        if (excelFields.has(field)) {
          matchCount++;
        }
      });
      
      const score = templateFields.size > 0 ? (matchCount / templateFields.size) * 100 : 0;
      
      if (score > bestScore) {
        bestScore = score;
        bestMatch = template;
      }
    });
    
    this.matchedTemplate = bestMatch;
    this.templateMatchScore = bestScore;
    
    // Auto-select if perfect match
    if (bestScore === 100 && bestMatch) {
      this.selectedTemplate = bestMatch;
      this.showToast(`Perfect match found: ${(bestMatch as any).name}`, 'success');
    } else if (bestScore > 70 && bestMatch) {
      this.selectedTemplate = bestMatch;
      this.showToast(`Good match found: ${(bestMatch as any).name} (${Math.round(bestScore)}% match)`, 'info');
    } else if (bestScore > 0 && bestMatch) {
      this.showToast(`Partial match found: ${(bestMatch as any).name} (${Math.round(bestScore)}% match). Consider creating a new template.`, 'warning');
    }
  }

  /**
   * Toggle template selector visibility
   */
  toggleTemplateSelector(): void {
    this.showTemplateSelector = !this.showTemplateSelector;
  }

  /**
   * Select a template for mapping
   */
  selectTemplateForMapping(template: FormTemplate): void {
    this.selectedTemplate = template;
    this.showTemplateSelector = false;
    this.createFieldMappings();
  }

  /**
   * Create field mappings between Excel and selected template
   */
  private createFieldMappings(): void {
    if (!this.selectedTemplate || !this.filteredFieldNames) return;
    
    this.fieldMappings = [];
    // Only use filtered field names for mapping
    const excelFieldsLower = new Set(this.filteredFieldNames.map(h => h.toLowerCase().trim()));
    
    // Map template fields to Excel fields
    this.selectedTemplate.fields.forEach(templateField => {
      const fieldNameLower = templateField.name.toLowerCase().trim();
      const matched = excelFieldsLower.has(fieldNameLower);
      
      this.fieldMappings.push({
        templateField: templateField.name,
        excelField: matched ? this.previewHeaders.find(h => h.toLowerCase().trim() === fieldNameLower) : null,
        matched: matched,
        type: templateField.type
      });
    });
    
    // Add unmapped Excel fields (only data fields, not metadata)
    this.filteredFieldNames.forEach(excelField => {
      const fieldLower = excelField.toLowerCase().trim();
      const alreadyMapped = this.fieldMappings.some(m => 
        m.excelField && m.excelField.toLowerCase().trim() === fieldLower
      );
      
      if (!alreadyMapped) {
        this.fieldMappings.push({
          templateField: null,
          excelField: excelField,
          matched: false,
          type: 'text'
        });
      }
    });
  }

  createNewTemplate(): void {
    if (!this.conversionResult?.template) {
      this.showToast('No template data available', 'error');
      return;
    }

    // Store the template data
    const templateData = this.conversionResult.template;
    
    // Close the Excel conversion dialog
    this.dialogRef.close({
      action: 'create',
      template: templateData,
      openFormBuilder: true
    });
    
    // Show success message with metadata filtering info
    if (this.filteredFieldNames.length > 0) {
      const msg = `Template generated with ${this.filteredFieldNames.length} field(s). ` +
                  `${this.metadataColumns.length} patient metadata column(s) were excluded. Opening form builder...`;
      this.showToast(msg, 'success');
    }
  }

  /**
   * Create new template from Excel data
   */
  createNewTemplateFromExcel(): void {
    this.createNewTemplate();
  }

  /**
   * Show toast notification
   */
  private showToast(message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info'): void {
    const panelClass = type === 'error' ? 'error-snackbar' : 
                       type === 'success' ? 'success-snackbar' : 
                       type === 'warning' ? 'warning-snackbar' : 'info-snackbar';
    
    this.snackBar.open(message, 'Close', {
      duration: 5000,
      horizontalPosition: 'center',
      verticalPosition: 'top',
      panelClass: [panelClass]
    });
  }
}
