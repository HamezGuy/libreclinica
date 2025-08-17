// OCR Service Interfaces for Template Extraction
// Designed to be provider-agnostic (Textract, Document AI, etc.)

import { Observable } from 'rxjs';
import { FormTemplate, FormField } from '../models/form-template.model';

// Represents a detected form element from OCR
export interface OcrFormElement {
  id: string;
  type: 'label' | 'input' | 'checkbox' | 'radio' | 'select' | 'table' | 'text';
  text: string;
  confidence: number;
  boundingBox: OcrBoundingBox;
  relatedElements?: string[]; // IDs of related elements (e.g., label -> input)
  value?: string; // For filled forms
  options?: string[]; // For select/radio/checkbox groups
}

// Bounding box coordinates
export interface OcrBoundingBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

// Result from OCR processing
export interface OcrProcessingResult {
  elements: OcrFormElement[];
  tables: OcrTable[];
  metadata: OcrMetadata;
  rawData?: any; // Provider-specific raw response
}

// Table structure from OCR
export interface OcrTable {
  id: string;
  rows: number;
  columns: number;
  cells: OcrTableCell[][];
  confidence: number;
  boundingBox: OcrBoundingBox;
}

export interface OcrTableCell {
  text: string;
  rowIndex: number;
  columnIndex: number;
  rowSpan: number;
  columnSpan: number;
  confidence: number;
}

// Metadata about the OCR processing
export interface OcrMetadata {
  pageCount: number;
  processingTime: number;
  provider: string;
  documentType?: string;
  language?: string;
  warnings?: string[];
}

// Configuration for OCR processing
export interface OcrProcessingConfig {
  detectTables?: boolean;
  detectForms?: boolean;
  detectHandwriting?: boolean;
  languages?: string[];
  enhanceImage?: boolean;
  pageNumbers?: number[]; // Specific pages to process
}

// Main OCR service interface
export interface IOcrService {
  // Process a document and extract form structure
  processDocument(
    file: File | Blob,
    config?: OcrProcessingConfig
  ): Observable<OcrProcessingResult>;

  // Convert OCR results to form template
  convertToFormTemplate(
    ocrResult: OcrProcessingResult,
    templateName: string
  ): FormTemplate;

  // Get provider name
  getProviderName(): string;

  // Check if service is available
  isAvailable(): Observable<boolean>;

  // Get supported file types
  getSupportedFileTypes(): string[];

  // Get maximum file size in bytes
  getMaxFileSize(): number;
}

// Template builder from OCR results
export interface IOcrTemplateBuilder {
  // Build form fields from OCR elements
  buildFields(elements: OcrFormElement[]): FormField[];

  // Detect field relationships (label -> input mapping)
  detectFieldRelationships(elements: OcrFormElement[]): Map<string, string>;

  // Infer field types from context
  inferFieldType(element: OcrFormElement, relatedElements: OcrFormElement[]): string;

  // Group related elements (e.g., radio button groups)
  groupRelatedElements(elements: OcrFormElement[]): OcrFormElement[][];

  // Extract validation rules from text patterns
  extractValidationRules(element: OcrFormElement): any;
}

// OCR review and refinement interface
export interface IOcrReviewService {
  // Merge similar elements
  mergeElements(elements: OcrFormElement[]): OcrFormElement[];

  // Split merged elements
  splitElement(element: OcrFormElement): OcrFormElement[];

  // Adjust element boundaries
  adjustBoundingBox(element: OcrFormElement, newBox: OcrBoundingBox): OcrFormElement;

  // Change element type
  changeElementType(element: OcrFormElement, newType: string): OcrFormElement;

  // Link elements together
  linkElements(element1: OcrFormElement, element2: OcrFormElement): void;
}

// Provider-specific configuration
export interface TextractConfig {
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
}

export interface DocumentAIConfig {
  projectId: string;
  location: string;
  processorId: string;
  apiKey?: string;
}

// Union type for all provider configs
export type OcrProviderConfig = TextractConfig | DocumentAIConfig;
