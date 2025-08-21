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
    // Use real API endpoint
    this.API_ENDPOINT = 'http://localhost:3001/api/textract';
    
    // Disable mock data - use real Textract
    this.useMockData = false;
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

  private callTextractAPI(base64Data: string, config?: OcrProcessingConfig): Observable<any> {
    // Call the real backend proxy server
    const headers = new Headers({
      'Content-Type': 'application/json'
    });
    
    return from(
      fetch(`${this.API_ENDPOINT}/analyze`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ base64: base64Data })
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
      response.Blocks.forEach((block: any, index: number) => {
        if (block.BlockType === 'LINE' || block.BlockType === 'WORD') {
          const element: OcrFormElement = {
            id: `element-${index}`,
            type: this.inferElementType(block.Text || ''),
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

  private inferElementType(text: string): 'label' | 'input' | 'checkbox' | 'radio' | 'text' {
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
