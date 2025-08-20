/**
 * Simplified Template Model for EDC
 * Focus on field names and values without unnecessary complexity
 */

export type SimpleFieldType = 
  | 'text'
  | 'number'
  | 'date'
  | 'select'
  | 'checkbox'
  | 'radio'
  | 'textarea'
  | 'file';

/**
 * Simple field definition - just the essentials
 */
export interface SimpleField {
  name: string;           // Field name (used as row/column header)
  label?: string;         // Optional display label (defaults to name)
  required?: boolean;     // Is this field required?
  options?: string[];     // For select/radio/checkbox fields
  defaultValue?: any;     // Default value if any
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    message?: string;
  };
}

/**
 * Template structure - defines the shape of data to collect
 */
export interface SimpleTemplate {
  id?: string;
  name: string;
  description?: string;
  category: 'patient' | 'visit' | 'lab' | 'adverse_event' | 'other';
  
  // Fields define the structure
  fields: SimpleField[];
  
  // Layout preference
  layout?: 'form' | 'table' | 'grid';
  
  // Metadata
  version?: number;
  createdAt?: Date;
  updatedAt?: Date;
  createdBy?: string;
  status?: 'draft' | 'active' | 'archived';
}

/**
 * Completed template instance - actual data collected
 */
export interface CompletedTemplate {
  id?: string;
  templateId: string;
  templateName: string;
  
  // Simple key-value data
  // Field name -> Value
  data: Record<string, any>;
  
  // Context
  patientId?: string;
  visitId?: string;
  studyId?: string;
  
  // Status
  status: 'draft' | 'completed' | 'reviewed' | 'locked';
  
  // Metadata
  completedBy: string;
  completedAt: Date;
  reviewedBy?: string;
  reviewedAt?: Date;
  
  // Attachments if any
  attachments?: {
    fieldName: string;
    fileName: string;
    url: string;
  }[];
}

/**
 * Template conversion result for export/import
 */
export interface TemplateConversion {
  templateId: string;
  format: 'excel' | 'csv' | 'json' | 'pdf';
  
  // For table/excel format
  headers: string[];        // Field names as column headers
  rows: any[][];           // Data rows
  
  // For form/document format
  sections?: {
    title: string;
    fields: {
      name: string;
      value: any;
    }[];
  }[];
  
  // Metadata
  exportedAt: Date;
  exportedBy: string;
}

/**
 * Bulk template data for multiple instances
 */
export interface BulkTemplateData {
  templateId: string;
  templateName: string;
  
  // Column headers (field names)
  columns: string[];
  
  // Data rows - each row is a completed instance
  rows: {
    id?: string;
    patientId?: string;
    data: any[];  // Values in same order as columns
    status: string;
    completedAt: Date;
  }[];
  
  // Summary
  totalCount: number;
  completedCount: number;
  pendingCount: number;
}

/**
 * Template field mapping for import/export
 */
export interface FieldMapping {
  sourceField: string;      // Field name in source (e.g., Excel column)
  targetField: string;      // Field name in template
  transform?: 'date' | 'number' | 'boolean' | 'text';  // Type conversion
}

/**
 * Template import configuration
 */
export interface TemplateImportConfig {
  templateId: string;
  sourceFormat: 'excel' | 'csv' | 'json';
  
  // Field mappings
  mappings: FieldMapping[];
  
  // Options
  skipFirstRow?: boolean;   // Skip header row
  dateFormat?: string;       // Date parsing format
  numberFormat?: string;     // Number parsing format
  
  // Validation
  validateRequired?: boolean;
  rejectInvalid?: boolean;
}

/**
 * Helper function to infer field type from value
 */
export function inferFieldType(value: any): SimpleFieldType {
  if (value === null || value === undefined) {
    return 'text';
  }
  
  if (typeof value === 'boolean') {
    return 'checkbox';
  }
  
  if (typeof value === 'number') {
    return 'number';
  }
  
  if (value instanceof Date) {
    return 'date';
  }
  
  const strValue = String(value);
  
  // Check if it's a date string
  if (/^\d{4}-\d{2}-\d{2}/.test(strValue)) {
    return 'date';
  }
  
  // Check if it's a number string
  if (/^-?\d+(\.\d+)?$/.test(strValue)) {
    return 'number';
  }
  
  // Check if it's a long text
  if (strValue.length > 100 || strValue.includes('\n')) {
    return 'textarea';
  }
  
  return 'text';
}

/**
 * Convert completed templates to table format
 */
export function templatesToTable(templates: CompletedTemplate[]): BulkTemplateData {
  if (templates.length === 0) {
    return {
      templateId: '',
      templateName: '',
      columns: [],
      rows: [],
      totalCount: 0,
      completedCount: 0,
      pendingCount: 0
    };
  }
  
  const first = templates[0];
  const columns = Object.keys(first.data);
  
  const rows = templates.map(t => ({
    id: t.id,
    patientId: t.patientId,
    data: columns.map(col => t.data[col]),
    status: t.status,
    completedAt: t.completedAt
  }));
  
  return {
    templateId: first.templateId,
    templateName: first.templateName,
    columns,
    rows,
    totalCount: templates.length,
    completedCount: templates.filter(t => t.status === 'completed').length,
    pendingCount: templates.filter(t => t.status === 'draft').length
  };
}

/**
 * Convert table data to completed templates
 */
export function tableToTemplates(
  tableData: BulkTemplateData,
  templateId: string,
  userId: string
): CompletedTemplate[] {
  return tableData.rows.map(row => {
    const data: Record<string, any> = {};
    tableData.columns.forEach((col, index) => {
      data[col] = row.data[index];
    });
    
    return {
      id: row.id,
      templateId,
      templateName: tableData.templateName,
      data,
      patientId: row.patientId,
      status: row.status as any,
      completedBy: userId,
      completedAt: row.completedAt || new Date()
    };
  });
}
