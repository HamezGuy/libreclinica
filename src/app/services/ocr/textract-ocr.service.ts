import { Injectable } from '@angular/core';
import { Observable, of, from, throwError } from 'rxjs';
import { map, catchError, switchMap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import {
  IOcrService,
  OcrProcessingConfig,
  OcrProcessingResult,
  OcrFormElement,
  OcrTable,
  OcrBoundingBox
} from '../../interfaces/ocr-interfaces';

// Define OcrProvider enum locally
export enum OcrProvider {
  TEXTRACT = 'textract',
  GOOGLE_VISION = 'google-vision',
  MICROSOFT_FORM_RECOGNIZER = 'microsoft-form-recognizer',
  TESSERACT = 'tesseract'
}
import { FormTemplate, TemplateType } from '../../models/form-template.model';

// AWS SDK Types - will be used when backend proxy is implemented
interface TextractConfig {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

// For future AWS SDK integration
// import { TextractClient, AnalyzeDocumentCommand } from '@aws-sdk/client-textract';

@Injectable({
  providedIn: 'root'
})
export class TextractOcrService implements IOcrService {
  private API_ENDPOINT: string;
  private config: TextractConfig = {
    region: environment.aws?.region || 'us-east-1',
    accessKeyId: '', // Loaded from backend
    secretAccessKey: '' // Loaded from backend
  };
  private useMockData = false; // Use real Textract by default

  constructor() {
    // Use backend proxy endpoint - credentials are handled server-side
    this.API_ENDPOINT = environment.production 
      ? '/api/textract' // Production uses relative path
      : `${environment.api?.baseUrl || 'http://localhost:3001'}${environment.api?.textractEndpoint || '/api/textract'}`; // Development uses configured endpoint
    
    // Don't use mock data - backend handles authentication
    this.useMockData = false;
    
    // Log configuration for debugging
    console.log('TextractOcrService initialized:', {
      endpoint: this.API_ENDPOINT,
      region: this.config.region,
      useMockData: this.useMockData
    });
  }

  processDocument(
    file: File | Blob | string,
    config?: OcrProcessingConfig
  ): Observable<OcrProcessingResult> {
    // Handle both file and base64 string inputs
    const base64Promise = typeof file === 'string' 
      ? Promise.resolve(file)
      : this.convertToBase64(file);
    
    // Check if we should use mock data (disabled by default)
    if (this.useMockData) {
      return from(base64Promise).pipe(
        switchMap(() => {
          // Simulate processing delay
          return new Promise(resolve => setTimeout(resolve, 1500));
        }),
        map(() => this.getMockOcrResult()),
        catchError(error => throwError(() => error))
      );
    } else {
      return from(base64Promise).pipe(
        switchMap(base64 => from(this.callTextractAPI(base64, config))),
        catchError(error => {
          console.error('Textract processing error:', error);
          return throwError(() => new Error('Failed to process document with Textract'));
        })
      );
    }
  }

  getCapabilities(): {
    supportsTables: boolean;
    supportsHandwriting: boolean;
    supportsMultipleLanguages: boolean;
    supportsFormExtraction: boolean;
    maxPages?: number;
    supportedLanguages?: string[];
  } {
    return {
      supportsTables: true,
      supportsHandwriting: true,
      supportsMultipleLanguages: false,
      supportsFormExtraction: true,
      maxPages: 100,
      supportedLanguages: ['en']
    };
  }

  isAvailable(): Observable<boolean> {
    // Check if backend service is available
    // Since credentials are handled server-side, we just check if the endpoint is configured
    return of(!!this.API_ENDPOINT && !this.useMockData);
  }

  getSupportedFileTypes(): string[] {
    return ['.pdf', '.png', '.jpg', '.jpeg', '.tiff', '.bmp'];
  }

  getMaxFileSize(): number {
    return 5 * 1024 * 1024; // 5MB limit for Textract
  }

  private async convertToBase64(file: File | Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        resolve(base64.split(',')[1]); // Remove data:image/... prefix
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  private callTextractAPI(base64Data: string, config?: OcrProcessingConfig): Observable<any> {
    // Call the backend proxy server which handles AWS credentials
    const headers = new Headers({
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    });
    
    // Add any additional configuration from the processing config
    const requestBody = {
      base64: base64Data,
      config: {
        confidenceThreshold: config?.confidenceThreshold || environment.aws?.textract?.confidenceThreshold || 80,
        extractTables: config?.extractTables !== false,
        extractForms: config?.extractForms !== false
      }
    };
    
    return from(
      fetch(`${this.API_ENDPOINT}/analyze`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody)
      })
    ).pipe(
      switchMap(response => {
        if (!response.ok) {
          return response.json().then(err => {
            throw new Error(err.message || 'Textract API error');
          });
        }
        return response.json();
      }),
      map(result => {
        if (result.success && result.data) {
          return result.data;
        } else if (result.rawData) {
          // If backend returns raw Textract data, process it
          return this.processTextractResponse(result.rawData);
        } else {
          throw new Error('Invalid response from Textract API');
        }
      }),
      catchError(error => {
        console.error('Textract API error:', error);
        return throwError(() => new Error(`OCR processing failed: ${error.message}`));
      })
    );
  }

  private processTextractResponse(response: any): OcrProcessingResult {
    const elements = this.parseTextractResponse(response);
    const tables = this.parseTextractTables(response);
    const formFields = this.extractFormFields(response);
    
    // Merge form fields with elements
    const mergedElements = this.mergeFormFieldsWithElements(elements, formFields);
    
    return {
      elements: mergedElements,
      tables: tables,
      rawData: response,
      metadata: {
        provider: 'textract' as any,
        pageCount: 1,
        processingTime: 0
      }
    };
  }

  private parseTextractResponse(response: any): OcrFormElement[] {
    const elements: OcrFormElement[] = [];
    
    // Parse Textract blocks into OcrFormElements
    if (response.Blocks) {
      // First pass: collect all LINE blocks
      const lineBlocks = response.Blocks.filter((b: any) => b.BlockType === 'LINE');
      
      // Sort by vertical position (top to bottom) then horizontal (left to right)
      lineBlocks.sort((a: any, b: any) => {
        const aY = a.Geometry?.BoundingBox?.Top || 0;
        const bY = b.Geometry?.BoundingBox?.Top || 0;
        const aX = a.Geometry?.BoundingBox?.Left || 0;
        const bX = b.Geometry?.BoundingBox?.Left || 0;
        
        // If lines are roughly on the same horizontal level (within 1% tolerance)
        if (Math.abs(aY - bY) < 0.01) {
          return aX - bX; // Sort by horizontal position
        }
        return aY - bY; // Sort by vertical position
      });
      
      lineBlocks.forEach((block: any, index: number) => {
        const text = block.Text || '';
        const element: OcrFormElement = {
          id: block.Id || `element-${index}`,
          type: this.inferElementType(text),
          text: text,
          confidence: block.Confidence || 0,
          boundingBox: this.convertBoundingBox(block.Geometry?.BoundingBox)
        };
        
        // Try to find related elements (e.g., label followed by input field)
        if (element.type === 'label') {
          element.relatedElements = this.findRelatedElements(block, lineBlocks, index);
        }
        
        elements.push(element);
      });
    }
    
    return elements;
  }

  private findRelatedElements(labelBlock: any, allBlocks: any[], currentIndex: number): string[] {
    const related: string[] = [];
    const labelBox = labelBlock.Geometry?.BoundingBox;
    
    if (!labelBox) return related;
    
    // Look for elements to the right or below this label
    for (let i = currentIndex + 1; i < allBlocks.length && i < currentIndex + 3; i++) {
      const nextBlock = allBlocks[i];
      const nextBox = nextBlock.Geometry?.BoundingBox;
      
      if (!nextBox) continue;
      
      // Check if next element is to the right (same line)
      const sameLine = Math.abs(labelBox.Top - nextBox.Top) < 0.02;
      const toTheRight = nextBox.Left > labelBox.Left + labelBox.Width;
      
      // Check if next element is below (next line)
      const below = nextBox.Top > labelBox.Top + labelBox.Height;
      const verticallyAligned = Math.abs(labelBox.Left - nextBox.Left) < 0.1;
      
      if ((sameLine && toTheRight) || (below && verticallyAligned)) {
        related.push(nextBlock.Id || `element-${i}`);
        break; // Only link to the first related element
      }
    }
    
    return related;
  }

  private parseTextractTables(response: any): OcrTable[] {
    const tables: OcrTable[] = [];
    
    // Parse table blocks if present
    // This would extract table structure from Textract response
    
    return tables;
  }

  private inferElementType(text: string): 'label' | 'input' | 'checkbox' | 'radio' | 'text' {
    const lowerText = text.toLowerCase().trim();
    
    // Check for checkbox patterns
    const checkboxPatterns = ['☐', '☑', '☒', '□', '■', '[ ]', '[x]', '[X]', '( )', '(x)', '(X)'];
    if (checkboxPatterns.some(pattern => text.includes(pattern))) {
      return 'checkbox';
    }
    
    // Check for radio button patterns
    const radioPatterns = ['○', '●', '◯', '◉', '⭕', '( )', '(•)', '(*)', '(o)', '(O)'];
    if (radioPatterns.some(pattern => text.includes(pattern)) && !text.includes('[')) {
      return 'radio';
    }
    
    // Check for input field indicators (underscores, dots, blank spaces)
    const inputPatterns = /^[_\.\s]{3,}$|^_{3,}|^\.{3,}/;
    if (inputPatterns.test(text) || text === '') {
      return 'input';
    }
    
    // Check for label patterns
    const labelIndicators = [
      text.endsWith(':'),
      text.endsWith('?'),
      /^(name|date|time|address|phone|email|age|gender|dob|mrn|id|subject)\b/i.test(lowerText),
      /\b(first|last|middle|initial|street|city|state|zip|country)\s*(name)?\b/i.test(lowerText),
      /^\d+\.\s+/.test(text), // Numbered items like "1. "
      /^[A-Z][a-z]+\s+[A-Z][a-z]+:?$/.test(text), // Title case labels
      /^(please|enter|provide|select|choose|specify)\b/i.test(lowerText)
    ];
    
    if (labelIndicators.some(indicator => indicator === true)) {
      return 'label';
    }
    
    // Default to text for everything else
    return 'text';
  }

  private convertBoundingBox(bb: any): OcrBoundingBox {
    if (!bb) {
      return { left: 0, top: 0, width: 0, height: 0 };
    }
    
    return {
      left: bb.Left || 0,
      top: bb.Top || 0,
      width: bb.Width || 0,
      height: bb.Height || 0
    };
  }

  private calculateAverageConfidence(elements: OcrFormElement[]): number {
    if (elements.length === 0) return 0;
    const sum = elements.reduce((acc, el) => acc + el.confidence, 0);
    return sum / elements.length;
  }

  private extractFormFields(response: any): any[] {
    const formFields: any[] = [];
    
    if (response.Blocks) {
      const keyValuePairs: any = {};
      const keyBlocks: any[] = [];
      const valueBlocks: any[] = [];
      
      // First pass: identify KEY_VALUE_SET blocks
      response.Blocks.forEach((block: any) => {
        if (block.BlockType === 'KEY_VALUE_SET') {
          if (block.EntityTypes && block.EntityTypes.includes('KEY')) {
            keyBlocks.push(block);
          } else if (block.EntityTypes && block.EntityTypes.includes('VALUE')) {
            valueBlocks.push(block);
          }
        }
      });
      
      // Match keys with values
      keyBlocks.forEach((keyBlock: any) => {
        if (keyBlock.Relationships) {
          const valueRelation = keyBlock.Relationships.find((r: any) => r.Type === 'VALUE');
          if (valueRelation && valueRelation.Ids) {
            const valueBlock = valueBlocks.find((v: any) => valueRelation.Ids.includes(v.Id));
            if (valueBlock) {
              const keyText = this.getTextFromBlock(keyBlock, response.Blocks);
              const valueText = this.getTextFromBlock(valueBlock, response.Blocks);
              
              formFields.push({
                key: keyText,
                value: valueText,
                keyBoundingBox: keyBlock.Geometry?.BoundingBox,
                valueBoundingBox: valueBlock.Geometry?.BoundingBox
              });
            }
          }
        }
      });
    }
    
    return formFields;
  }

  private getTextFromBlock(block: any, allBlocks: any[]): string {
    let text = '';
    
    if (block.Text) {
      return block.Text;
    }
    
    if (block.Relationships) {
      const childRelation = block.Relationships.find((r: any) => r.Type === 'CHILD');
      if (childRelation && childRelation.Ids) {
        childRelation.Ids.forEach((childId: string) => {
          const childBlock = allBlocks.find((b: any) => b.Id === childId);
          if (childBlock && childBlock.Text) {
            text += (text ? ' ' : '') + childBlock.Text;
          }
        });
      }
    }
    
    return text;
  }

  private mergeFormFieldsWithElements(elements: OcrFormElement[], formFields: any[]): OcrFormElement[] {
    const merged = [...elements];
    
    formFields.forEach((f: any) => {
      if (f.key) {
        const existingKey = merged.find(e => 
          e.text.toLowerCase().trim() === f.key.toLowerCase().trim()
        );
        
        if (!existingKey && f.keyBoundingBox) {
          merged.push({
            id: `form-key-${merged.length}`,
            type: 'label',
            text: f.key,
            confidence: 95,
            boundingBox: this.convertBoundingBox(f.keyBoundingBox),
            relatedElements: f.value ? [`form-value-${merged.length}`] : []
          });
        }
        
        if (f.value && f.valueBoundingBox) {
          merged.push({
            id: `form-value-${merged.length}`,
            type: 'input',
            text: f.value,
            confidence: 95,
            boundingBox: this.convertBoundingBox(f.valueBoundingBox),
            relatedElements: [`form-key-${merged.length - 1}`]
          });
        }
      }
    });
    
    return merged;
  }

  private getMockOcrResult(): OcrProcessingResult {
    return {
      elements: [
        {
          id: 'mock-1',
          type: 'label',
          text: 'Patient Name:',
          confidence: 98,
          boundingBox: { left: 10, top: 10, width: 100, height: 20 },
          relatedElements: ['mock-2']
        },
        {
          id: 'mock-2',
          type: 'input',
          text: '',
          confidence: 95,
          boundingBox: { left: 120, top: 10, width: 200, height: 20 },
          relatedElements: ['mock-1']
        }
      ],
      tables: [],
      metadata: {
        provider: 'textract' as any,
        pageCount: 1,
        processingTime: 1500
      }
    };
  }

  getProviderName(): string {
    return 'Amazon Textract';
  }

  convertToFormTemplate(result: OcrProcessingResult): FormTemplate {
    const fields: any[] = [];
    const sections: any[] = [];
    
    // Build fields from OCR elements with intelligent grouping
    if (result.elements) {
      const { extractedFields, extractedSections } = this.buildSmartFieldsFromElements(result.elements);
      fields.push(...extractedFields);
      sections.push(...extractedSections);
    }
    
    // Add table fields if present
    if (result.tables && result.tables.length > 0) {
      fields.push(...this.buildFieldsFromTables(result.tables));
    }
    
    // Clean up and validate fields
    const cleanedFields = this.cleanupFields(fields);
    
    const isPatientForm = this.detectIfPatientForm(cleanedFields);
    
    const template: FormTemplate = {
      id: '',
      name: this.generateTemplateName(result),
      description: 'Form template generated from OCR processing',
      version: 1,
      status: 'draft',
      templateType: isPatientForm ? 'patient' : 'form',
      isPatientTemplate: isPatientForm,
      isStudySubjectTemplate: false,
      fields: cleanedFields,
      sections: sections,
      conditionalLogic: [],
      metadata: {
        studyPhase: 'OCR Import',
        dataRetentionPeriod: 7,
        therapeuticArea: 'General'
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: '',
      lastModifiedBy: '',
      childFormIds: [],
      childTemplateIds: [],
      linkedTemplates: [],
      phiDataFields: isPatientForm ? this.extractPhiFields(cleanedFields) : [],
      hipaaCompliant: isPatientForm,
      gdprCompliant: false,
      requiresElectronicSignature: false,
      complianceRegions: [],
      phiEncryptionEnabled: isPatientForm,
      phiAccessLogging: isPatientForm,
      phiDataMinimization: false,
      allowSavePartial: true,
      requiresReview: false,
      allowEditing: true,
      tags: ['ocr-generated'],
      category: isPatientForm ? 'patient' : 'general',
      changeHistory: []
    };
    
    return template;
  }


  private buildSmartFieldsFromElements(elements: OcrFormElement[]): { extractedFields: any[], extractedSections: any[] } {
    const fields: any[] = [];
    const sections: any[] = [];
    const processedIds = new Set<string>();
    let currentSection: any = null;
    let fieldOrder = 0;
    
    elements.forEach((element, index) => {
      if (processedIds.has(element.id)) return;
      
      // Detect section headers (bold, larger text, all caps)
      if (this.isSectionHeader(element)) {
        currentSection = {
          id: `section-${sections.length}`,
          name: element.text,
          description: '',
          order: sections.length,
          fields: []
        };
        sections.push(currentSection);
        processedIds.add(element.id);
        return;
      }
      
      // Process label-input pairs
      if (element.type === 'label') {
        const field = this.createFieldFromLabel(element, elements, index, fieldOrder++);
        if (field) {
          fields.push(field);
          processedIds.add(element.id);
          if (field.relatedElementId) {
            processedIds.add(field.relatedElementId);
          }
          
          // Add to current section if exists
          if (currentSection) {
            currentSection.fields.push(field.id);
          }
        }
      }
      
      // Process standalone checkboxes and radio buttons
      if (element.type === 'checkbox') {
        processedIds.add(element.id);
        fields.push({
          id: `field-${fieldOrder++}`,
          name: `checkbox_${fieldOrder}`,
          label: element.text.replace(/[☐☑☒□■\[\]\(\)xX*]/g, '').trim(),
          type: 'checkbox',
          required: false,
          order: fieldOrder,
          metadata: {
            confidence: element.confidence || 0,
            boundingBox: element.boundingBox
          }
        });
        
        if (currentSection) {
          currentSection.fields.push(`field-${fieldOrder - 1}`);
        }
      } else if (element.type === 'radio') {
        processedIds.add(element.id);
        fields.push({
          id: `field-${fieldOrder++}`,
          name: `radio_${fieldOrder}`,
          label: element.text.replace(/[○●◯◉⭕\(\)•*oO]/g, '').trim(),
          type: 'radio',
          required: false,
          order: fieldOrder,
          metadata: {
            confidence: element.confidence || 0,
            boundingBox: element.boundingBox
          }
        });
        
        if (currentSection) {
          currentSection.fields.push(`field-${fieldOrder - 1}`);
        }
      }
    });
    
    return { extractedFields: fields, extractedSections: sections };
  }

  private isSectionHeader(element: OcrFormElement): boolean {
    const text = element.text.trim();
    
    // Check for section header patterns
    const headerPatterns = [
      /^[A-Z][A-Z\s]+$/,  // All caps
      /^\d+\.\s+[A-Z]/,  // Numbered section
      /^Section\s+\d+/i,  // "Section X"
      /^Part\s+[A-Z\d]+/i,  // "Part X"
    ];
    
    return headerPatterns.some(pattern => pattern.test(text)) && 
           text.length > 3 && 
           text.length < 50 &&
           !text.endsWith(':') &&
           !text.endsWith('?');
  }

  private createFieldFromLabel(element: OcrFormElement, allElements: OcrFormElement[], index: number, order: number): any {
    const field: any = {
      id: `field-${order}`,
      name: this.generateFieldName(element.text),
      label: element.text,
      type: 'text',
      required: false,
      order: order,
      placeholder: '',
      defaultValue: '',
      metadata: {
        confidence: element.confidence,
        boundingBox: element.boundingBox
      }
    };
    
    // Look for related input element
    if (element.relatedElements && element.relatedElements.length > 0) {
      const relatedId = element.relatedElements[0];
      const relatedElement = allElements.find(e => e.id === relatedId);
      
      if (relatedElement) {
        field.relatedElementId = relatedId;
        
        // Set field type based on related element
        if (relatedElement.type === 'input') {
          // Infer field type from label text
          const labelLower = element.text.toLowerCase();
          
          if (labelLower.includes('email')) {
            field.type = 'email';
            field.validation = { pattern: '^[^@]+@[^@]+\\.[^@]+$' };
          } else if (labelLower.includes('phone') || labelLower.includes('tel')) {
            field.type = 'tel';
            field.validation = { pattern: '^[\\d\\s\\(\\)\\-\\+]+$' };
          } else if (labelLower.includes('date') || labelLower.includes('dob')) {
            field.type = 'date';
          } else if (labelLower.includes('time')) {
            field.type = 'time';
          } else if (labelLower.includes('number') || labelLower.includes('age') || labelLower.includes('quantity')) {
            field.type = 'number';
          } else if (labelLower.includes('signature')) {
            field.type = 'signature';
          } else {
            field.type = 'text';
          }
          
          // Set placeholder from related text if available
          if (relatedElement.text) {
            field.defaultValue = relatedElement.text;
          }
        }
      }
    }
    
    return field;
  }

  private generateFieldName(labelText: string): string {
    return labelText
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 50);
  }

  private buildFieldsFromTables(tables: OcrTable[]): any[] {
    const fields: any[] = [];
    
    tables.forEach((table, tableIndex) => {
      if (table.rows && Array.isArray(table.rows) && table.rows.length > 0) {
        // Treat first row as headers if it looks like headers
        const headers = table.rows[0].cells.map((cell: any) => cell.text);
        
        // Create fields for each data row
        for (let i = 1; i < table.rows.length; i++) {
          table.rows[i].cells.forEach((cell: any, cellIndex: number) => {
            if (headers[cellIndex]) {
              fields.push({
                id: `table-${tableIndex}-row-${i}-col-${cellIndex}`,
                name: `${this.generateFieldName(headers[cellIndex])}_row_${i}`,
                label: `${headers[cellIndex]} (Row ${i})`,
                type: 'text',
                required: false,
                defaultValue: cell.text || '',
                metadata: {
                  tableIndex,
                  rowIndex: i,
                  columnIndex: cellIndex,
                  confidence: cell.confidence || 0
                }
              });
            }
          });
        }
      }
    });
    
    return fields;
  }

  private cleanupFields(fields: any[]): any[] {
    // Remove duplicates and clean up field data
    const seen = new Set<string>();
    const cleaned: any[] = [];
    
    fields.forEach(field => {
      const key = `${field.name}_${field.label}`;
      if (!seen.has(key)) {
        seen.add(key);
        
        // Ensure all required properties
        field.id = field.id || `field-${cleaned.length}`;
        field.name = field.name || `field_${cleaned.length}`;
        field.label = field.label || 'Unlabeled Field';
        field.type = field.type || 'text';
        field.required = field.required || false;
        field.order = field.order !== undefined ? field.order : cleaned.length;
        
        cleaned.push(field);
      }
    });
    
    // Sort by order
    cleaned.sort((a, b) => a.order - b.order);
    
    return cleaned;
  }

  private generateTemplateName(result: OcrProcessingResult): string {
    // Try to extract a title from the first few elements
    if (result.elements && result.elements.length > 0) {
      for (let i = 0; i < Math.min(5, result.elements.length); i++) {
        const element = result.elements[i];
        if (element.type === 'text' && element.text.length > 10 && element.text.length < 100) {
          // Check if it looks like a title
          const text = element.text.trim();
          if (!text.endsWith(':') && !text.endsWith('?') && !text.includes('_')) {
            return text;
          }
        }
      }
    }
    
    return `OCR Form Template ${new Date().toLocaleDateString()}`;
  }

  private detectIfPatientForm(fields: any[]): boolean {
    const patientIndicators = [
      'patient', 'name', 'dob', 'date of birth', 'mrn', 'medical record',
      'gender', 'sex', 'address', 'phone', 'email', 'insurance',
      'emergency contact', 'physician', 'diagnosis', 'medication'
    ];
    
    let indicatorCount = 0;
    fields.forEach(field => {
      const fieldText = `${field.label} ${field.name}`.toLowerCase();
      patientIndicators.forEach(indicator => {
        if (fieldText.includes(indicator)) {
          indicatorCount++;
        }
      });
    });
    
    // If more than 3 patient-related fields, consider it a patient form
    return indicatorCount >= 3;
  }

  private generateValidationRules(fields: any[]): any[] {
    const rules: any[] = [];
    
    fields.forEach(field => {
      // Add validation rules based on field type and name
      if (field.type === 'email') {
        rules.push({
          fieldId: field.id,
          type: 'pattern',
          pattern: '^[^@]+@[^@]+\\.[^@]+$',
          message: 'Please enter a valid email address'
        });
      } else if (field.type === 'tel') {
        rules.push({
          fieldId: field.id,
          type: 'pattern',
          pattern: '^[\\d\\s\\(\\)\\-\\+]+$',
          message: 'Please enter a valid phone number'
        });
      } else if (field.type === 'number') {
        const labelLower = field.label.toLowerCase();
        if (labelLower.includes('age')) {
          rules.push({
            fieldId: field.id,
            type: 'range',
            min: 0,
            max: 150,
            message: 'Age must be between 0 and 150'
          });
        }
      }
      
      // Add required validation if field seems important
      const importantFields = ['name', 'patient', 'mrn', 'dob', 'date of birth'];
      const fieldTextLower = field.label.toLowerCase();
      if (importantFields.some(imp => fieldTextLower.includes(imp))) {
        field.required = true;
        rules.push({
          fieldId: field.id,
          type: 'required',
          message: `${field.label} is required`
        });
      }
    });
    
    return rules;
  }

  private extractPhiFields(fields: any[]): string[] {
    const phiFields: string[] = [];
    const phiIndicators = [
      'name', 'dob', 'birth', 'ssn', 'social security',
      'address', 'phone', 'email', 'mrn', 'medical record',
      'insurance', 'emergency contact'
    ];
    
    fields.forEach(field => {
      const fieldText = `${field.label} ${field.name}`.toLowerCase();
      if (phiIndicators.some(indicator => fieldText.includes(indicator))) {
        phiFields.push(field.id);
      }
    });
    
    return phiFields;
  }

  // Enhanced mock response for development
  private getEnhancedMockTextractResponse(): any {
    return {
      DocumentMetadata: {
        Pages: 1
      },
      Blocks: [
        // Title
        {
          Id: 'block-1',
          BlockType: 'LINE',
          Confidence: 99.5,
          Text: 'Patient Information Form',
          Page: 1,
          Geometry: {
            BoundingBox: {
              Width: 0.5,
              Height: 0.05,
              Left: 0.25,
              Top: 0.05
            }
          }
        },
        // Patient Name Field - Key
        {
          Id: 'key-1',
          BlockType: 'KEY_VALUE_SET',
          EntityTypes: ['KEY'],
          Confidence: 98.2,
          Page: 1,
          Geometry: {
            BoundingBox: {
              Width: 0.15,
              Height: 0.03,
              Left: 0.1,
              Top: 0.15
            }
          },
          Relationships: [
            {
              Type: 'VALUE',
              Ids: ['value-1']
            },
            {
              Type: 'CHILD',
              Ids: ['word-1']
            }
          ]
        },
        {
          Id: 'word-1',
          BlockType: 'WORD',
          Text: 'Patient Name:',
          Confidence: 98.2,
          Page: 1
        },
        // Patient Name Field - Value
        {
          Id: 'value-1',
          BlockType: 'KEY_VALUE_SET',
          EntityTypes: ['VALUE'],
          Confidence: 97.8,
          Page: 1,
          Geometry: {
            BoundingBox: {
              Width: 0.25,
              Height: 0.03,
              Left: 0.3,
              Top: 0.15
            }
          },
          Relationships: [
            {
              Type: 'CHILD',
              Ids: ['word-2']
            }
          ]
        },
        {
          Id: 'word-2',
          BlockType: 'WORD',
          Text: '',
          Confidence: 0,
          Page: 1
        },
        // Date of Birth Field - Key
        {
          Id: 'key-2',
          BlockType: 'KEY_VALUE_SET',
          EntityTypes: ['KEY'],
          Confidence: 99.1,
          Page: 1,
          Geometry: {
            BoundingBox: {
              Width: 0.15,
              Height: 0.03,
              Left: 0.1,
              Top: 0.2
            }
          },
          Relationships: [
            {
              Type: 'VALUE',
              Ids: ['value-2']
            },
            {
              Type: 'CHILD',
              Ids: ['word-3']
            }
          ]
        },
        {
          Id: 'word-3',
          BlockType: 'WORD',
          Text: 'Date of Birth:',
          Confidence: 99.1,
          Page: 1
        },
        // Date of Birth Field - Value
        {
          Id: 'value-2',
          BlockType: 'KEY_VALUE_SET',
          EntityTypes: ['VALUE'],
          Confidence: 98.5,
          Page: 1,
          Geometry: {
            BoundingBox: {
              Width: 0.15,
              Height: 0.03,
              Left: 0.3,
              Top: 0.2
            }
          },
          Relationships: [
            {
              Type: 'CHILD',
              Ids: ['word-4']
            }
          ]
        },
        {
          Id: 'word-4',
          BlockType: 'WORD',
          Text: '',
          Confidence: 0,
          Page: 1
        },
        // Medical Record Number - Key
        {
          Id: 'key-3',
          BlockType: 'KEY_VALUE_SET',
          EntityTypes: ['KEY'],
          Confidence: 97.5,
          Page: 1,
          Geometry: {
            BoundingBox: {
              Width: 0.2,
              Height: 0.03,
              Left: 0.1,
              Top: 0.25
            }
          },
          Relationships: [
            {
              Type: 'VALUE',
              Ids: ['value-3']
            },
            {
              Type: 'CHILD',
              Ids: ['word-5']
            }
          ]
        },
        {
          Id: 'word-5',
          BlockType: 'WORD',
          Text: 'Medical Record #:',
          Confidence: 97.5,
          Page: 1
        },
        // Medical Record Number - Value
        {
          Id: 'value-3',
          BlockType: 'KEY_VALUE_SET',
          EntityTypes: ['VALUE'],
          Confidence: 96.8,
          Page: 1,
          Geometry: {
            BoundingBox: {
              Width: 0.15,
              Height: 0.03,
              Left: 0.35,
              Top: 0.25
            }
          },
          Relationships: [
            {
              Type: 'CHILD',
              Ids: ['word-6']
            }
          ]
        },
        {
          Id: 'word-6',
          BlockType: 'WORD',
          Text: '',
          Confidence: 0,
          Page: 1
        },
        // Checkbox for consent
        {
          Id: 'checkbox-1',
          BlockType: 'SELECTION_ELEMENT',
          SelectionStatus: 'NOT_SELECTED',
          Confidence: 95.2,
          Page: 1,
          Geometry: {
            BoundingBox: {
              Width: 0.02,
              Height: 0.02,
              Left: 0.1,
              Top: 0.35
            }
          }
        },
        {
          Id: 'line-consent',
          BlockType: 'LINE',
          Text: 'I consent to treatment',
          Confidence: 98.7,
          Page: 1,
          Geometry: {
            BoundingBox: {
              Width: 0.25,
              Height: 0.03,
              Left: 0.13,
              Top: 0.35
            }
          }
        },
        // Additional fields
        {
          Id: 'line-email',
          BlockType: 'LINE',
          Text: 'Email Address:',
          Confidence: 97.9,
          Page: 1,
          Geometry: {
            BoundingBox: {
              Width: 0.15,
              Height: 0.03,
              Left: 0.1,
              Top: 0.4
            }
          }
        },
        {
          Id: 'line-phone',
          BlockType: 'LINE',
          Text: 'Phone Number:',
          Confidence: 98.3,
          Page: 1,
          Geometry: {
            BoundingBox: {
              Width: 0.15,
              Height: 0.03,
              Left: 0.1,
              Top: 0.45
            }
          }
        },
        {
          Id: 'line-address',
          BlockType: 'LINE',
          Text: 'Address:',
          Confidence: 99.0,
          Page: 1,
          Geometry: {
            BoundingBox: {
              Width: 0.1,
              Height: 0.03,
              Left: 0.1,
              Top: 0.5
            }
          }
        },
        // Signature field
        {
          Id: 'line-signature',
          BlockType: 'LINE',
          Text: 'Patient Signature:',
          Confidence: 96.5,
          Page: 1,
          Geometry: {
            BoundingBox: {
              Width: 0.2,
              Height: 0.03,
              Left: 0.1,
              Top: 0.6
            }
          }
        },
        {
          Id: 'line-signature-box',
          BlockType: 'LINE',
          Text: '_________________________',
          Confidence: 85.0,
          Page: 1,
          Geometry: {
            BoundingBox: {
              Width: 0.3,
              Height: 0.03,
              Left: 0.35,
              Top: 0.6
            }
          }
        }
      ]
    };
  }
}
