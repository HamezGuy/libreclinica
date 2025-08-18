import { Injectable } from '@angular/core';
import { Observable, from, throwError, of } from 'rxjs';
import { map, catchError, switchMap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { 
  IOcrService, 
  OcrFormElement, 
  OcrProcessingConfig, 
  OcrProcessingResult,
  TextractConfig,
  OcrTable,
  OcrMetadata,
  OcrBoundingBox
} from '../../interfaces/ocr-interfaces';
import { FormTemplate, FormField, FieldType, TemplateType } from '../../models/form-template.model';
import { OcrTemplateBuilderService } from './ocr-template-builder.service';
import { AwsConfigService } from '../aws-config.service';

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

  constructor(
    private awsConfigService: AwsConfigService,
    private templateBuilder: OcrTemplateBuilderService
  ) {
    // Initialize with environment configuration
    this.API_ENDPOINT = environment.aws?.textract?.endpoint || 'https://textract.us-east-1.amazonaws.com';
    
    // Load AWS config
    this.awsConfigService.loadConfig().subscribe(config => {
      this.config = {
        region: config.region,
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      };
      this.API_ENDPOINT = config.textract.endpoint;
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
    // Note: In production, this should be called through a backend service
    // to protect AWS credentials. This is a simplified example.
    
    const startTime = Date.now();
    
    // Simulate Textract API response for development
    // In production, replace with actual AWS SDK call
    const mockResponse = this.getMockTextractResponse();
    
    const elements = this.parseTextractResponse(mockResponse);
    const tables = this.parseTextractTables(mockResponse);
    
    return {
      elements,
      tables,
      metadata: {
        pageCount: 1,
        processingTime: Date.now() - startTime,
        provider: 'Amazon Textract',
        documentType: 'FORM',
        warnings: []
      },
      rawData: mockResponse
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
    
    // Parse table data from Textract response
    // This is simplified - actual implementation would be more complex
    
    return tables;
  }

  private inferElementType(block: any): OcrFormElement['type'] {
    const text = (block.Text || '').toLowerCase();
    
    // Simple heuristics to infer element type
    if (text.includes('name') || text.includes('date') || text.includes('email')) {
      return 'label';
    }
    if (block.BlockType === 'SELECTION_ELEMENT') {
      return block.SelectionStatus === 'SELECTED' ? 'checkbox' : 'checkbox';
    }
    if (text.includes('select') || text.includes('choose')) {
      return 'select';
    }
    
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
    ocrResult: OcrProcessingResult,
    templateName: string
  ): FormTemplate {
    const fields = this.templateBuilder.buildFields(ocrResult.elements);
    
    const template: FormTemplate = {
      id: '',
      name: templateName,
      description: `Template created from OCR scan on ${new Date().toLocaleDateString()}`,
      category: 'ocr-generated',
      version: 1.0,
      status: 'draft',
      fields: fields,
      sections: [{
        id: 'main',
        name: 'Main Section',
        fields: fields.map(f => f.id),
        order: 0,
        collapsible: false,
        defaultExpanded: true
      }],
      // Template Type Configuration
      templateType: 'form' as TemplateType,
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

  // Removed duplicate methods - already defined above

  // Mock response for development
  private getMockTextractResponse(): any {
    return {
      DocumentMetadata: {
        Pages: 1
      },
      Blocks: [
        {
          BlockType: 'LINE',
          Confidence: 99.5,
          Text: 'Patient Information Form',
          Geometry: {
            BoundingBox: {
              Width: 0.5,
              Height: 0.05,
              Left: 0.25,
              Top: 0.1
            }
          }
        },
        {
          BlockType: 'LINE',
          Confidence: 98.7,
          Text: 'Patient Name:',
          Geometry: {
            BoundingBox: {
              Width: 0.15,
              Height: 0.03,
              Left: 0.1,
              Top: 0.2
            }
          }
        },
        {
          BlockType: 'LINE',
          Confidence: 97.3,
          Text: 'Date of Birth:',
          Geometry: {
            BoundingBox: {
              Width: 0.15,
              Height: 0.03,
              Left: 0.1,
              Top: 0.3
            }
          }
        },
        {
          BlockType: 'LINE',
          Confidence: 98.1,
          Text: 'Gender:',
          Geometry: {
            BoundingBox: {
              Width: 0.1,
              Height: 0.03,
              Left: 0.1,
              Top: 0.4
            }
          }
        },
        {
          BlockType: 'SELECTION_ELEMENT',
          SelectionStatus: 'NOT_SELECTED',
          Confidence: 95.2,
          Geometry: {
            BoundingBox: {
              Width: 0.02,
              Height: 0.02,
              Left: 0.25,
              Top: 0.4
            }
          }
        },
        {
          BlockType: 'LINE',
          Confidence: 96.8,
          Text: 'Male',
          Geometry: {
            BoundingBox: {
              Width: 0.05,
              Height: 0.03,
              Left: 0.28,
              Top: 0.4
            }
          }
        },
        {
          BlockType: 'SELECTION_ELEMENT',
          SelectionStatus: 'NOT_SELECTED',
          Confidence: 95.5,
          Geometry: {
            BoundingBox: {
              Width: 0.02,
              Height: 0.02,
              Left: 0.35,
              Top: 0.4
            }
          }
        },
        {
          BlockType: 'LINE',
          Confidence: 97.1,
          Text: 'Female',
          Geometry: {
            BoundingBox: {
              Width: 0.07,
              Height: 0.03,
              Left: 0.38,
              Top: 0.4
            }
          }
        }
      ]
    };
  }
}
