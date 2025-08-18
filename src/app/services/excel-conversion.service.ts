import { Injectable } from '@angular/core';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { FormTemplate, FormField, FormFieldType } from '../models/form-template.model';

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
   * Convert Excel data to FormTemplate
   */
  async excelToTemplate(
    excelData: ExcelData, 
    templateName: string,
    existingTemplate?: FormTemplate
  ): Promise<ConversionResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const fieldMapping = new Map<string, string>();
    
    // Validate field names are unique
    const fieldNames = excelData.fieldNames || [];
    const uniqueNames = new Set(fieldNames);
    if (uniqueNames.size !== fieldNames.length) {
      const duplicates = fieldNames.filter((name, index) => 
        fieldNames.indexOf(name) !== index
      );
      errors.push(`Duplicate field names found: ${duplicates.join(', ')}`);
      return { success: false, errors, warnings };
    }
    
    // If existing template provided, check for field name matches
    if (existingTemplate) {
      const templateFieldNames = new Set(existingTemplate.fields.map(f => f.name));
      const excelFieldNames = new Set(fieldNames);
      
      // Find mismatches
      const inTemplateNotInExcel = [...templateFieldNames].filter(name => !excelFieldNames.has(name));
      const inExcelNotInTemplate = [...excelFieldNames].filter(name => !templateFieldNames.has(name));
      
      if (inTemplateNotInExcel.length > 0) {
        warnings.push(`Fields in template but not in Excel: ${inTemplateNotInExcel.join(', ')}`);
      }
      
      if (inExcelNotInTemplate.length > 0) {
        warnings.push(`Fields in Excel but not in template: ${inExcelNotInTemplate.join(', ')}`);
      }
      
      // Check if there are critical mismatches
      if (inTemplateNotInExcel.length > 0 && inExcelNotInTemplate.length > 0) {
        errors.push('Field names do not match between Excel and template. Please ensure all field names match exactly.');
        return { success: false, errors, warnings };
      }
    }
    
    // Create form fields from Excel data
    const fields: FormField[] = [];
    
    for (let i = 0; i < fieldNames.length; i++) {
      const fieldName = fieldNames[i];
      const columnData = excelData.rows.map(row => row[i]);
      
      // Infer field type from data
      const fieldType = this.inferFieldType(columnData);
      
      // Check if field exists in existing template
      const existingField = existingTemplate?.fields.find(f => f.name === fieldName);
      
      const field: FormField = {
        id: this.generateFieldId(fieldName),
        name: fieldName,
        type: existingField?.type || fieldType,
        label: this.generateLabel(fieldName),
        description: existingField?.description || '',
        required: existingField?.required || false,
        readonly: false,
        hidden: false,
        validationRules: existingField?.validationRules || [],
        isPhiField: existingField?.isPhiField || this.isPotentialPHI(fieldName),
        auditRequired: existingField?.auditRequired || false,
        order: i,
        section: existingField?.section || 'main'
      };
      
      // Add options for select fields if we can detect them
      const uniqueValues = this.getUniqueValues(columnData);
      if (uniqueValues.length > 0 && uniqueValues.length <= 20 && fieldType === 'text') {
        // Might be a select field
        field.type = 'select';
        field.options = uniqueValues.map(val => ({
          value: val,
          label: String(val)
        }));
      }
      
      fields.push(field);
      fieldMapping.set(fieldName, field.id);
    }
    
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
   * Generate field ID from field name
   */
  private generateFieldId(fieldName: string): string {
    return fieldName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  /**
   * Generate label from field name
   */
  private generateLabel(fieldName: string): string {
    return fieldName
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
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
