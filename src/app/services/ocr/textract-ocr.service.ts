import { Injectable } from '@angular/core';
import { Observable, from, throwError, of } from 'rxjs';
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
    region: 'us-east-1',
    accessKeyId: '',
    secretAccessKey: ''
  };
  private useMockData = true; // Toggle for development vs production

  constructor() {
    // In production, this would be configured from environment
    this.API_ENDPOINT = (environment as any).textractApiEndpoint || '/api/textract';
    
    // Check if we should use mock data or real API
    this.useMockData = !environment.production || !(environment as any).textractApiEndpoint;
  }

  processDocument(
    file: File | Blob | string,
    config?: OcrProcessingConfig
  ): Observable<OcrProcessingResult> {
    // Handle both file and base64 string inputs
    const base64Promise = typeof file === 'string' 
      ? Promise.resolve(file)
      : this.convertToBase64(file);
    
    return from(base64Promise).pipe(
      switchMap(base64 => from(this.callTextractAPI(base64, config))),
      catchError(error => {
        console.error('Textract processing error:', error);
        return throwError(() => new Error('Failed to process document with Textract'));
      })
    );
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
    // Check if AWS credentials are configured
    return of(!!this.config && !!this.config.accessKeyId);
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

  private async callTextractAPI(
    base64Document: string,
    config?: OcrProcessingConfig
  ): Promise<OcrProcessingResult> {
    const startTime = Date.now();
    
    let response: any;
    
    if (this.useMockData) {
      // Development mode - use mock data
      response = this.getEnhancedMockTextractResponse();
    } else {
      // Production mode - call real API through backend proxy
      response = await this.callTextractBackendProxy(base64Document, config);
    }
    
    const elements = this.parseTextractResponse(response);
    const tables = this.parseTextractTables(response);
    const formFields = this.extractFormFields(response);
    
    // Merge form fields with elements for better field detection
    const enhancedElements = this.mergeFormFieldsWithElements(elements, formFields);
    
    return {
      elements: enhancedElements,
      tables,
      metadata: {
        pageCount: response.DocumentMetadata?.Pages || 1,
        processingTime: Date.now() - startTime,
        provider: 'Amazon Textract',
        documentType: 'FORM',
        warnings: this.useMockData ? ['Using mock data for development'] : []
      },
      rawData: response
    };
  }

  // Call backend proxy for real Textract API
  private async callTextractBackendProxy(
    base64Document: string,
    config?: OcrProcessingConfig
  ): Promise<any> {
    // This would call your backend API that securely handles AWS credentials
    const response = await fetch(this.API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        document: base64Document,
        featureTypes: ['FORMS', 'TABLES'],
        config: config
      })
    });
    
    if (!response.ok) {
      throw new Error(`Textract API error: ${response.statusText}`);
    }
    
    return response.json();
  }

  private parseTextractResponse(response: any): OcrFormElement[] {
    const elements: OcrFormElement[] = [];
    
    // Parse Textract blocks into OcrFormElements
    if (response.Blocks) {
      response.Blocks.forEach((block: any, index: number) => {
        if (block.BlockType === 'LINE' || block.BlockType === 'WORD') {
          const element: OcrFormElement = {
            id: `element-${index}`,
            type: this.inferElementType(block),
            text: block.Text || '',
            confidence: block.Confidence || 0,
            boundingBox: this.convertBoundingBox(block.Geometry?.BoundingBox),
            relatedElements: []
          };
          
          elements.push(element);
        }
      });
    }
    
    return elements;
  }

  private parseTextractTables(response: any): OcrTable[] {
    const tables: OcrTable[] = [];
    
    // Parse table blocks if present
    // This would extract table structure from Textract response
    
    return tables;
  }

  private inferElementType(text: string): 'label' | 'input' | 'checkbox' | 'radio' | 'select' | 'text' | 'table' {
    const lowerText = text.toLowerCase();
    
    // Check for checkbox indicators
    if (lowerText.includes('☐') || lowerText.includes('☑') || lowerText.includes('[ ]') || lowerText.includes('[x]')) {
      return 'checkbox';
    }
    
    // Check for radio button indicators
    if (lowerText.includes('○') || lowerText.includes('●') || lowerText.includes('( )') || lowerText.includes('(x)')) {
      return 'radio';
    }
    
    // Check for label patterns
    if (text.endsWith(':') || lowerText.includes('name') || lowerText.includes('date') || lowerText.includes('address')) {
      return 'label';
    }
    
    // Check for input field patterns
    if (text.includes('___') || text.includes('...')) {
      return 'input';
    }
    
    // Default to text
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

  convertToFormTemplate(
    result: OcrProcessingResult
  ): FormTemplate {
    // Build fields from OCR elements
    const fields = this.buildFieldsFromElements(result.elements);
    
    // Convert OCR result to form template
    const template: FormTemplate = {
      id: '',
      name: 'OCR Generated Template',
      description: 'Template generated from OCR processing',
      templateType: 'form' as TemplateType,
      category: 'ocr-generated',
      version: 1.0,
      status: 'draft',
      fields: fields,
      sections: [{
        id: 'main',
        name: 'Main Section',
        fields: fields.map((f: any) => f.id),
        order: 0,
        collapsible: false,
        defaultExpanded: true
      }],
      isPatientTemplate: false,
      isStudySubjectTemplate: false,
      // Template Linking
      childTemplateIds: [],
      linkedTemplates: [],
      // PHI and Healthcare Compliance
      phiDataFields: [],
      hipaaCompliant: false,
      gdprCompliant: false,
      // Compliance Settings
      requiresElectronicSignature: false,
      requiresSignature: false,
      isPhiForm: false,
      complianceRegions: [],
      phiEncryptionEnabled: false,
      phiAccessLogging: false,
      phiDataMinimization: false,
      allowSavePartial: true,
      allowPartialSave: true,
      requiresReview: false,
      allowEditing: true,
      // Metadata
      tags: ['ocr-generated'],
      // Timestamps
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: '',
      lastModifiedBy: '',
      childFormIds: [],
      changeHistory: []
    };
    
    return template;
  }

  getProviderName(): string {
    return 'Amazon Textract';
  }

  private extractFormFields(response: any): any[] {
    const formFields: any[] = [];
    const keyValuePairs = new Map<string, any>();
    
    // First pass: collect KEY_VALUE_SET blocks
    response.Blocks?.forEach((block: any) => {
      if (block.BlockType === 'KEY_VALUE_SET' && block.EntityTypes?.includes('KEY')) {
        const keyText = this.getTextFromBlock(block, response.Blocks);
        let valueText = '';
        let valueBoundingBox = null;
        let confidence = 0;
        
        if (block.Relationships) {
          const valueRelation = block.Relationships.find((r: any) => r.Type === 'VALUE');
          if (valueRelation && valueRelation.Ids) {
            const valueBlock = response.Blocks.find((b: any) => 
              valueRelation.Ids.includes(b.Id) && b.BlockType === 'KEY_VALUE_SET'
            );
            if (valueBlock) {
              valueText = this.getTextFromBlock(valueBlock, response.Blocks);
              valueBoundingBox = valueBlock.Geometry?.BoundingBox;
              confidence = valueBlock.Confidence || 0;
            }
          }
        }
        
        keyValuePairs.set(keyText, {
          text: valueText,
          keyBoundingBox: block.Geometry?.BoundingBox,
          valueBoundingBox,
          confidence
        });
      }
    });
    
    // Second pass: build form fields from key-value pairs
    keyValuePairs.forEach((value, key) => {
      formFields.push({
        key: key,
        value: value.text || '',
        keyBoundingBox: value.keyBoundingBox,
        valueBoundingBox: value.valueBoundingBox,
        confidence: value.confidence || 0
      });
    });
    
    // Also extract SELECTION_ELEMENT blocks (checkboxes, radio buttons)
    response.Blocks?.forEach((block: any) => {
      if (block.BlockType === 'SELECTION_ELEMENT') {
        formFields.push({
          key: '',
          value: block.SelectionStatus === 'SELECTED' ? 'checked' : 'unchecked',
          valueBoundingBox: block.Geometry?.BoundingBox,
          confidence: block.Confidence || 0,
          selectionElement: true
        });
      }
    });
    
    return formFields;
  }

  private buildFieldsFromElements(elements: OcrFormElement[]): any[] {
    const fields: any[] = [];
    const processedIds = new Set<string>();
    
    elements.forEach((element, index) => {
      if (processedIds.has(element.id)) return;
      
      if (element.type === 'label' && element.relatedElements?.length) {
        // Find related input element
        const relatedInput = elements.find(e => 
          element.relatedElements?.includes(e.id) && e.type === 'input'
        );
        
        if (relatedInput) {
          processedIds.add(element.id);
          processedIds.add(relatedInput.id);
          
          fields.push({
            id: `field-${index}`,
            name: element.text.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase(),
            label: element.text,
            type: 'text',
            required: false,
            value: relatedInput.text || '',
            metadata: {
              confidence: Math.min(element.confidence || 0, relatedInput.confidence || 0),
              boundingBox: element.boundingBox
            }
          });
        } else {
          processedIds.add(element.id);
          fields.push({
            id: `field-${index}`,
            name: element.text.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase(),
            label: element.text,
            type: 'text',
            required: false,
            metadata: {
              confidence: element.confidence || 0,
              boundingBox: element.boundingBox
            }
          });
        }
      } else if (element.type === 'checkbox') {
        processedIds.add(element.id);
        fields.push({
          id: `field-${index}`,
          name: `checkbox_${index}`,
          label: element.text,
          type: 'checkbox',
          required: false,
          metadata: {
            confidence: element.confidence || 0,
            boundingBox: element.boundingBox
          }
        });
      } else if (element.type === 'radio') {
        processedIds.add(element.id);
        fields.push({
          id: `field-${index}`,
          name: `radio_${index}`,
          label: element.text,
          type: 'radio',
          required: false,
          metadata: {
            confidence: element.confidence || 0,
            boundingBox: element.boundingBox
          }
        });
      }
    });
    
    return fields;
  }
  
  private getTextFromBlock(block: any, allBlocks: any[]): string {
    let text = '';
    
    if (block.Relationships) {
      const childRelation = block.Relationships.find((r: any) => r.Type === 'CHILD');
      if (childRelation && childRelation.Ids) {
        const childBlocks = allBlocks.filter((b: any) => childRelation.Ids.includes(b.Id));
        text = childBlocks
          .filter((b: any) => b.BlockType === 'WORD' || b.BlockType === 'LINE')
          .map((b: any) => b.Text || '')
          .join(' ');
      }
    }
    
    return text || block.Text || '';
  }
  
  private mergeFormFieldsWithElements(elements: OcrFormElement[], formFields: any[]): OcrFormElement[] {
    const merged = [...elements];
    
    formFields.forEach((f: any) => {
      if (f.key) {
        // Check if we already have this as an element
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
