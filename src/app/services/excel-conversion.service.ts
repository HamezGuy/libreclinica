import { Injectable } from '@angular/core';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { FormTemplate, FormField, FormFieldType } from '../models/form-template.model';
import { Patient } from '../models/patient.model';

export interface ExcelData {
  headers: string[];
  rows: any[][];
  orientation?: 'row' | 'column';
  fieldNames?: string[];
  dataStartRow?: number;
  dataStartColumn?: number;
}

export interface ConversionResult {
  success: boolean;
  template?: FormTemplate;
  errors: string[];
  warnings: string[];
  fieldMapping?: Map<string, string>;
}

export interface ExcelParseOptions {
  orientation?: 'row' | 'column' | 'auto';
  headerRow?: number;
  headerColumn?: number;
  dataStartRow?: number;
  dataStartColumn?: number;
  sheetName?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ExcelConversionService {

  constructor() { }

  /**
   * Parse Excel file with auto-detection of orientation and structure
   */
  async parseExcelFile(file: File, options: ExcelParseOptions = {}): Promise<ExcelData> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e: any) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          
          // Get the first sheet or specified sheet
          const sheetName = options.sheetName || workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          
          // Convert to JSON
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });
          
          // Auto-detect orientation if not specified
          let orientation = options.orientation;
          if (orientation === 'auto' || !orientation) {
            orientation = this.detectOrientation(jsonData as any[][]);
          }
          
          // Parse based on orientation
          const result = orientation === 'column' 
            ? this.parseColumnOriented(jsonData as any[][], options)
            : this.parseRowOriented(jsonData as any[][], options);
          
          resolve(result);
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = (error) => reject(error);
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Auto-detect whether data is row or column oriented
   */
  private detectOrientation(data: any[][]): 'row' | 'column' {
    if (!data || data.length === 0) return 'row';
    
    // Check first row vs first column for field-like names
    const firstRow = data[0] || [];
    const firstColumn = data.map(row => row[0]).filter(val => val !== null && val !== undefined);
    
    // Count text-like values that could be field names
    const rowTextCount = firstRow.filter(val => 
      typeof val === 'string' && val.length > 0 && val.length < 50
    ).length;
    
    const colTextCount = firstColumn.filter(val => 
      typeof val === 'string' && val.length > 0 && val.length < 50
    ).length;
    
    // If first row has more text values, likely row-oriented
    // If first column has more text values, likely column-oriented
    if (rowTextCount > colTextCount) {
      return 'row';
    } else if (colTextCount > rowTextCount) {
      return 'column';
    }
    
    // Default to row-oriented
    return 'row';
  }

  /**
   * Parse row-oriented Excel data (headers in first row)
   */
  private parseRowOriented(data: any[][], options: ExcelParseOptions): ExcelData {
    const headerRow = options.headerRow || 0;
    const dataStartRow = options.dataStartRow || headerRow + 1;
    
    const headers = data[headerRow] || [];
    const rows = data.slice(dataStartRow);
    
    // Extract field names (non-empty headers)
    const fieldNames = headers
      .filter(h => h !== null && h !== undefined && h !== '')
      .map(h => String(h).trim());
    
    return {
      headers: headers.map(h => String(h || '')),
      rows,
      orientation: 'row',
      fieldNames,
      dataStartRow,
      dataStartColumn: 0
    };
  }

  /**
   * Parse column-oriented Excel data (headers in first column)
   */
  private parseColumnOriented(data: any[][], options: ExcelParseOptions): ExcelData {
    const headerColumn = options.headerColumn || 0;
    const dataStartColumn = options.dataStartColumn || headerColumn + 1;
    
    // Extract headers from first column
    const headers = data.map(row => row[headerColumn] || '');
    
    // Transpose data for easier processing
    const transposedRows: any[][] = [];
    for (let col = dataStartColumn; col < Math.max(...data.map(row => row.length)); col++) {
      const rowData = data.map(row => row[col] || null);
      transposedRows.push(rowData);
    }
    
    // Extract field names (non-empty headers)
    const fieldNames = headers
      .filter(h => h !== null && h !== undefined && h !== '')
      .map(h => String(h).trim());
    
    return {
      headers: headers.map(h => String(h || '')),
      rows: transposedRows,
      orientation: 'column',
      fieldNames,
      dataStartRow: 0,
      dataStartColumn
    };
  }

  /**
   * Convert Excel to template using field names as unique identifiers
   */
  async convertExcelToTemplate(
    excelData: ExcelData,
    templateName: string,
    existingTemplate?: FormTemplate
  ): Promise<ConversionResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const fieldMapping = new Map<string, string>();
    
    // Validate Excel data
    if (!excelData.headers || excelData.headers.length === 0) {
      errors.push('No headers found in Excel file');
      return { success: false, errors, warnings };
    }
    
    // Define patient-specific metadata columns to exclude
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
    
    // Filter out patient-specific columns (case-insensitive)
    const fieldNames = excelData.headers.filter(header => {
      const headerLower = header.toLowerCase().trim();
      return !patientMetadataColumns.some(metaCol => 
        metaCol.toLowerCase() === headerLower
      );
    });
    
    // Check if any fields remain after filtering
    if (fieldNames.length === 0) {
      errors.push('No data fields found after filtering patient metadata. Only patient-specific columns were detected.');
      warnings.push('Ensure your Excel file contains actual form fields, not just patient tracking data.');
      return { success: false, errors, warnings };
    }
    
    // Check for duplicate field names
    const duplicates = fieldNames.filter((name, index) => 
      fieldNames.indexOf(name) !== index
    );
    if (duplicates.length > 0) {
      errors.push(`Duplicate field names found: ${duplicates.join(', ')}`);
      warnings.push('Each field must have a unique name for proper template generation.');
      return { success: false, errors, warnings };
    }
    
    // Warn if many columns were filtered
    const filteredCount = excelData.headers.length - fieldNames.length;
    if (filteredCount > 0) {
      warnings.push(`Filtered out ${filteredCount} patient-specific columns. Template will use ${fieldNames.length} unique field(s).`);
    }
    
    // Create form fields using field names as both ID and name
    const fields: FormField[] = [];
    
    fieldNames.forEach((fieldName, index) => {
      // Get column index in original data
      const colIndex = excelData.headers.indexOf(fieldName);
      const columnData = excelData.rows.map(row => row[colIndex]);
      
      // Get unique values only (remove patient-specific duplicates)
      const uniqueData = this.getUniqueValues(columnData);
      
      // Infer field type from unique values only
      const fieldType = this.inferFieldType(uniqueData);
      
      // Use field name as the unique identifier
      const field: FormField = {
        id: fieldName, // Use field name as ID
        name: fieldName, // Field name is the identifier
        type: fieldType,
        label: fieldName, // Display name is the same
        description: '',
        required: false,
        readonly: false,
        hidden: false,
        validationRules: [],
        isPhiField: this.isPotentialPHI(fieldName),
        auditRequired: false,
        order: index,
        section: 'main'
      };
      
      // Add options for select fields if we can detect them
      if (uniqueData.length > 1 && uniqueData.length <= 20 && fieldType === 'text') {
        // Likely a select/dropdown field with limited options
        field.type = 'select';
        field.options = uniqueData.map(val => ({
          value: val,
          label: String(val)
        }));
        warnings.push(`Field '${fieldName}' detected as dropdown with ${uniqueData.length} options.`);
      } else if (uniqueData.length === 1) {
        // Only one unique value across all patients - might be a default
        warnings.push(`Field '${fieldName}' has only one unique value: '${uniqueData[0]}'. Consider if this should be a default value.`);
      }
      
      fields.push(field);
      fieldMapping.set(fieldName, fieldName); // Map field name to itself since we use names as IDs
    });
    
    // Create the template
    const template: FormTemplate = existingTemplate ? {
      ...existingTemplate,
      fields,
      updatedAt: new Date()
    } : {
      name: templateName,
      description: `Template created from Excel file`,
      version: 1,
      templateType: 'form',
      isPatientTemplate: false,
      isStudySubjectTemplate: false,
      fields,
      sections: [{
        id: 'main',
        name: 'Main',
        description: 'Main section',
        order: 0,
        collapsible: false,
        defaultExpanded: true,
        fields: fields.map(f => f.id)
      }],
      childTemplateIds: [],
      linkedTemplates: [],
      phiDataFields: fields.filter(f => f.isPhiField).map(f => f.id),
      hipaaCompliant: false,
      gdprCompliant: false,
      status: 'draft',
      createdBy: '',
      lastModifiedBy: '',
      requiresElectronicSignature: false,
      phiEncryptionEnabled: false,
      phiAccessLogging: false,
      phiDataMinimization: false,
      allowSavePartial: true,
      requiresReview: false,
      allowEditing: true,
      tags: ['excel-import'],
      category: 'imported',
      complianceRegions: [],
      childFormIds: [],
      changeHistory: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    return {
      success: true,
      template,
      errors,
      warnings,
      fieldMapping
    };
  }

  /**
   * Export multiple patient forms to a single Excel table
   * Uses field names as column headers for easy data analysis
   */
  async exportMultiplePatientFormsToExcel(
    patients: Patient[],
    templateId: string,
    templateName: string
  ): Promise<void> {
    const wb = XLSX.utils.book_new();
    
    // Collect all form data across patients
    const allFormData: any[] = [];
    const fieldNames = new Set<string>();
    
    patients.forEach(patient => {
      // Find forms matching the template from patient phases
      const patientForms: any[] = [];
      patient.phases?.forEach(phase => {
        const matchingTemplates = phase.templates?.filter((t: any) => 
          t.templateId === templateId || t.name === templateName
        ) || [];
        patientForms.push(...matchingTemplates);
      });
      
      patientForms.forEach(form => {
        const rowData: any = {
          'Patient Number': patient.patientNumber,
          'Patient Name': `${patient.demographics?.firstName || ''} ${patient.demographics?.lastName || ''}`.trim() || 'N/A',
          'Date of Birth': patient.demographics?.dateOfBirth ? new Date(patient.demographics.dateOfBirth).toLocaleDateString() : '',
          'Study ID': patient.studyId,
          'Site ID': patient.siteId || '',
          'Form Status': form.status || 'draft',
          'Completed Date': form.completedAt ? new Date(form.completedAt).toLocaleDateString() : ''
        };
        
        // Add form field data using field names as keys
        if (form.data) {
          Object.entries(form.data).forEach(([fieldName, value]) => {
            fieldNames.add(fieldName);
            rowData[fieldName] = this.formatCellValue(value);
          });
        } else if (form.fields) {
          // Fallback to fields array if data object doesn't exist
          form.fields.forEach((field: any) => {
            const name = field.label || field.name;
            fieldNames.add(name);
            rowData[name] = this.formatCellValue(field.value);
          });
        }
        
        allFormData.push(rowData);
      });
    });
    
    // Create headers - patient info first, then form fields
    const headers = [
      'Patient Number',
      'Patient Name', 
      'Date of Birth',
      'Study ID',
      'Site ID',
      'Form Status',
      'Completed Date',
      ...Array.from(fieldNames).sort()
    ];
    
    // Create worksheet data
    const wsData: any[][] = [headers];
    
    // Add data rows
    allFormData.forEach(row => {
      const dataRow = headers.map(header => row[header] || '');
      wsData.push(dataRow);
    });
    
    // Create worksheet
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    
    // Auto-size columns
    const colWidths = headers.map(header => ({
      wch: Math.max(header.length, 15)
    }));
    ws['!cols'] = colWidths;
    
    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Patient Forms');
    
    // Generate Excel file
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { 
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    });
    
    // Save file
    const timestamp = new Date().toISOString().split('T')[0];
    const fileName = `${templateName}_AllPatients_${timestamp}.xlsx`;
    saveAs(blob, fileName);
  }
  
  /**
   * Export single patient data with templates to Excel
   */
  async exportPatientDataToExcel(
    patient: Patient,
    includeMetadata: boolean = true,
    selectedPhases?: string[]
  ): Promise<void> {
    const wb = XLSX.utils.book_new();
    
    // Create patient info sheet
    if (includeMetadata) {
      const patientInfoSheet = this.createPatientInfoSheet(patient);
      XLSX.utils.book_append_sheet(wb, patientInfoSheet, 'Patient Info');
    }
    
    // Export phases and forms data
    if (patient.phases && patient.phases.length > 0) {
      const phasesToExport = selectedPhases 
        ? patient.phases.filter(p => selectedPhases.includes(p.id))
        : patient.phases;
      
      for (const phase of phasesToExport) {
        const phaseSheet = this.createPhaseDataSheet(phase, phase.templates || []);
        const sheetName = this.sanitizeSheetName(phase.phaseName || `Phase_${phase.id}`);
        XLSX.utils.book_append_sheet(wb, phaseSheet, sheetName);
      }
    }
    
    
    // Generate Excel file
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { 
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    });
    
    // Save file with patient number and timestamp
    const timestamp = new Date().toISOString().split('T')[0];
    const fileName = `Patient_${patient.patientNumber}_${timestamp}.xlsx`;
    saveAs(blob, fileName);
  }

  /**
   * Create patient information sheet
   */
  private createPatientInfoSheet(patient: Patient): XLSX.WorkSheet {
    const data: any[][] = [
      ['Patient Information'],
      [],
      ['Patient Number', patient.patientNumber],
      ['Study ID', patient.studyId],
      ['Site ID', patient.siteId || 'N/A'],
      ['Enrollment Date', patient.enrollmentDate ? new Date(patient.enrollmentDate).toLocaleDateString() : 'N/A'],
      ['Enrollment Status', patient.enrollmentStatus],
      ['Treatment Arm', patient.treatmentArm || 'N/A'],
      [],
      ['Demographics'],
      ['First Name', patient.demographics?.firstName || 'N/A'],
      ['Last Name', patient.demographics?.lastName || 'N/A'],
      ['Date of Birth', patient.demographics?.dateOfBirth ? new Date(patient.demographics.dateOfBirth).toLocaleDateString() : 'N/A'],
      ['Gender', patient.demographics?.gender || 'N/A'],
      [],
      ['Study Progress'],
      ['Total Visits', patient.studyProgress?.totalVisits || 0],
      ['Completed Visits', patient.studyProgress?.completedVisits || 0],
      ['Overall Completion', `${patient.studyProgress?.overallCompletionPercentage || 0}%`],
      [],
      ['Consent Status'],
      ['Has Valid Consent', patient.hasValidConsent ? 'Yes' : 'No'],
      ['Consent Expiration', patient.consentExpirationDate ? new Date(patient.consentExpirationDate).toLocaleDateString() : 'N/A']
    ];
    
    return XLSX.utils.aoa_to_sheet(data);
  }

  /**
   * Create phase data sheet with forms
   */
  private createPhaseDataSheet(phase: any, forms: any[]): XLSX.WorkSheet {
    const data: any[][] = [];
    
    // Phase header
    data.push(['Phase Information']);
    data.push([]);
    data.push(['Phase Name', phase.name]);
    data.push(['Phase Type', phase.type || 'Standard']);
    data.push(['Status', phase.status]);
    data.push(['Completion', `${phase.completionPercentage || 0}%`]);
    data.push([]);
    data.push(['Form Data']);
    data.push([]);
    
    // Get forms for this phase
    const phaseForms = forms.filter(f => 
      f.phaseId === phase.id || f.originalPhaseId === phase.id
    );
    
    if (phaseForms.length > 0) {
      // Create headers from all unique fields across forms
      const allFields = new Set<string>();
      const fieldInfo = new Map<string, any>();
      
      phaseForms.forEach(form => {
        if (form.fields) {
          form.fields.forEach((field: any) => {
            allFields.add(field.name || field.label);
            fieldInfo.set(field.name || field.label, field);
          });
        }
      });
      
      // Add headers
      const headers = ['Form Name', 'Form Status', 'Completed Date', ...Array.from(allFields)];
      data.push(headers);
      
      // Add form data rows
      phaseForms.forEach(form => {
        const row: any[] = [
          form.name || form.templateName || 'Unnamed Form',
          form.status || 'not_started',
          form.completedAt ? new Date(form.completedAt).toLocaleDateString() : ''
        ];
        
        // Add field values
        allFields.forEach(fieldName => {
          const field = form.fields?.find((f: any) => 
            f.name === fieldName || f.label === fieldName
          );
          const value = form.responses?.[field?.id] || 
                       form.responses?.[field?.name] || 
                       '';
          row.push(this.formatValueForExcel(value, field?.type || 'text'));
        });
        
        data.push(row);
      });
    } else {
      data.push(['No forms available for this phase']);
    }
    
    return XLSX.utils.aoa_to_sheet(data);
  }

  /**
   * Create visit subcomponent data sheet
   */
  private createVisitDataSheet(visit: any): XLSX.WorkSheet {
    const data: any[][] = [];
    
    data.push(['Visit Information']);
    data.push([]);
    data.push(['Visit Name', visit.name]);
    data.push(['Visit Type', visit.type]);
    data.push(['Status', visit.status]);
    data.push(['Completion', `${visit.completionPercentage || 0}%`]);
    data.push([]);
    
    if (visit.formTemplates && visit.formTemplates.length > 0) {
      data.push(['Form Templates']);
      data.push(['Template Name', 'Required', 'Status']);
      
      visit.formTemplates.forEach((template: any) => {
        data.push([
          template.name || 'Unnamed Template',
          template.required ? 'Yes' : 'No',
          template.status || 'not_started'
        ]);
      });
    }
    
    return XLSX.utils.aoa_to_sheet(data);
  }

  /**
   * Sanitize sheet name for Excel
   */
  private sanitizeSheetName(name: string): string {
    // Excel sheet names have restrictions
    let sanitized = name
      .replace(/[\[\]\*\?\/\\:]/g, '_') // Remove invalid characters
      .substring(0, 31); // Max 31 characters
    
    // Ensure unique by adding number if needed
    if (this.usedSheetNames.has(sanitized)) {
      let counter = 1;
      let uniqueName = `${sanitized.substring(0, 28)}_${counter}`;
      while (this.usedSheetNames.has(uniqueName)) {
        counter++;
        uniqueName = `${sanitized.substring(0, 28)}_${counter}`;
      }
      sanitized = uniqueName;
    }
    
    this.usedSheetNames.add(sanitized);
    return sanitized;
  }
  
  private usedSheetNames = new Set<string>();

  /**
   * Convert FormTemplate to Excel
   */
  async templateToExcel(
    template: FormTemplate,
    data?: any[],
    orientation: 'row' | 'column' = 'row'
  ): Promise<void> {
    const worksheet_data: any[][] = [];
    
    if (orientation === 'row') {
      // Headers in first row
      const headers = template.fields.map(f => f.name);
      worksheet_data.push(headers);
      
      // Add data rows if provided
      if (data && data.length > 0) {
        for (const record of data) {
          const row = template.fields.map(field => {
            const value = record[field.id] || record[field.name] || '';
            return this.formatValueForExcel(value, field.type);
          });
          worksheet_data.push(row);
        }
      } else {
        // Add sample row with field types and descriptions
        const typeRow = template.fields.map(f => `[${f.type}]`);
        const descRow = template.fields.map(f => f.description || '');
        const requiredRow = template.fields.map(f => f.required ? 'Required' : 'Optional');
        
        worksheet_data.push(typeRow);
        worksheet_data.push(descRow);
        worksheet_data.push(requiredRow);
      }
    } else {
      // Headers in first column
      for (let i = 0; i < template.fields.length; i++) {
        const field = template.fields[i];
        const row = [field.name];
        
        if (data && data.length > 0) {
          // Add data for each record
          for (const record of data) {
            const value = record[field.id] || record[field.name] || '';
            row.push(this.formatValueForExcel(value, field.type));
          }
        } else {
          // Add field metadata
          row.push(`[${field.type}]`);
          row.push(field.description || '');
          row.push(field.required ? 'Required' : 'Optional');
        }
        
        worksheet_data.push(row);
      }
    }
    
    // Create workbook and worksheet
    const ws = XLSX.utils.aoa_to_sheet(worksheet_data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    
    // Generate Excel file
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    
    // Save file
    const fileName = `${template.name.replace(/[^a-z0-9]/gi, '_')}_template.xlsx`;
    saveAs(blob, fileName);
  }

  /**
   * Infer field type from column data
   */
  private inferFieldType(data: any[]): FormFieldType {
    const nonNullData = data.filter(val => val !== null && val !== undefined && val !== '');
    
    if (nonNullData.length === 0) return 'text';
    
    // Check for boolean values
    const booleanValues = new Set(['true', 'false', 'yes', 'no', '1', '0', 'y', 'n']);
    if (nonNullData.every(val => booleanValues.has(String(val).toLowerCase()))) {
      return 'boolean';
    }
    
    // Check for dates
    const datePattern = /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/;
    const isoDatePattern = /^\d{4}-\d{2}-\d{2}/;
    if (nonNullData.every(val => {
      const str = String(val);
      return datePattern.test(str) || isoDatePattern.test(str) || !isNaN(Date.parse(str));
    })) {
      return 'date';
    }
    
    // Check for numbers
    if (nonNullData.every(val => !isNaN(Number(val)))) {
      return 'number';
    }
    
    // Check for email
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (nonNullData.every(val => emailPattern.test(String(val)))) {
      return 'email';
    }
    
    // Check for phone
    const phonePattern = /^[\d\s\-\(\)\+]+$/;
    if (nonNullData.every(val => phonePattern.test(String(val)) && String(val).length >= 10)) {
      return 'phone';
    }
    
    // Check if it's multi-line text
    if (nonNullData.some(val => String(val).includes('\n') || String(val).length > 100)) {
      return 'textarea';
    }
    
    // Default to text
    return 'text';
  }

  /**
   * Get unique values from data (for detecting select options)
   */
  private getUniqueValues(data: any[]): any[] {
    const nonNullData = data.filter(val => val !== null && val !== undefined && val !== '');
    const uniqueSet = new Set(nonNullData.map(val => String(val)));
    return Array.from(uniqueSet);
  }

  /**
   * Check if field name suggests PHI data
   */
  private isPotentialPHI(fieldName: string): boolean {
    const phiKeywords = [
      'name', 'patient', 'ssn', 'social', 'dob', 'birth', 'address',
      'phone', 'email', 'mrn', 'medical', 'insurance', 'emergency',
      'contact', 'genetic', 'biometric', 'id', 'identifier'
    ];
    
    const lowerName = fieldName.toLowerCase();
    return phiKeywords.some(keyword => lowerName.includes(keyword));
  }

  /**
   * Format cell value for Excel export
   */
  private formatCellValue(value: any): string {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toLocaleDateString();
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  /**
   * Import Excel data to create form instances for multiple patients
   */
  async importExcelToPatientForms(
    file: File,
    templateId: string
  ): Promise<{ success: boolean; imported: number; errors: string[] }> {
    const errors: string[] = [];
    let imported = 0;
    
    try {
      const excelData = await this.parseExcelFile(file);
      
      if (!excelData.headers || excelData.rows.length === 0) {
        errors.push('No data found in Excel file');
        return { success: false, imported: 0, errors };
      }
      
      // Extract patient identifiers and form data
      const patientNumberIndex = excelData.headers.indexOf('Patient Number');
      if (patientNumberIndex === -1) {
        errors.push('Patient Number column not found');
        return { success: false, imported: 0, errors };
      }
      
      // Get field names (excluding metadata columns)
      const metadataColumns = ['Patient Number', 'Patient Name', 'Date of Birth', 
                               'Study ID', 'Site ID', 'Form Status', 'Completed Date'];
      const fieldNames = excelData.headers.filter(h => !metadataColumns.includes(h));
      
      // Process each row
      for (const row of excelData.rows) {
        const patientNumber = row[patientNumberIndex];
        if (!patientNumber) continue;
        
        // Extract form data using field names
        const formData: Record<string, any> = {};
        fieldNames.forEach(fieldName => {
          const index = excelData.headers.indexOf(fieldName);
          if (index !== -1) {
            formData[fieldName] = row[index];
          }
        });
        
        // Here you would save the form data to the database
        // For now, just count as imported
        imported++;
      }
      
      return { success: true, imported, errors };
    } catch (error) {
      errors.push(`Import failed: ${error}`);
      return { success: false, imported: 0, errors };
    }
  }

  /**
   * Format value for Excel export
   */
  private formatValueForExcel(value: any, fieldType: FormFieldType): any {
    if (value === null || value === undefined) return '';
    
    switch (fieldType) {
      case 'date':
      case 'datetime':
        return value instanceof Date ? value.toISOString().split('T')[0] : value;
      case 'boolean':
        return value ? 'Yes' : 'No';
      case 'multiselect':
        return Array.isArray(value) ? value.join(', ') : value;
      default:
        return value;
    }
  }

  /**
   * Validate field name uniqueness and matching
   */
  validateFieldNames(
    excelFieldNames: string[],
    templateFieldNames: string[]
  ): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Check for duplicates in Excel
    const excelUnique = new Set(excelFieldNames);
    if (excelUnique.size !== excelFieldNames.length) {
      const duplicates = excelFieldNames.filter((name, index) => 
        excelFieldNames.indexOf(name) !== index
      );
      errors.push(`Duplicate field names in Excel: ${duplicates.join(', ')}`);
    }
    
    // Check for duplicates in template
    const templateUnique = new Set(templateFieldNames);
    if (templateUnique.size !== templateFieldNames.length) {
      const duplicates = templateFieldNames.filter((name, index) => 
        templateFieldNames.indexOf(name) !== index
      );
      errors.push(`Duplicate field names in template: ${duplicates.join(', ')}`);
    }
    
    // Check for mismatches
    const inExcelNotInTemplate = excelFieldNames.filter(name => !templateFieldNames.includes(name));
    const inTemplateNotInExcel = templateFieldNames.filter(name => !excelFieldNames.includes(name));
    
    if (inExcelNotInTemplate.length > 0) {
      warnings.push(`New fields from Excel: ${inExcelNotInTemplate.join(', ')}`);
    }
    
    if (inTemplateNotInExcel.length > 0) {
      warnings.push(`Template fields not in Excel: ${inTemplateNotInExcel.join(', ')}`);
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
}
