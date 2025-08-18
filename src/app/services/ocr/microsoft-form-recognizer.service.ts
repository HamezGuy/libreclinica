import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, from, throwError } from 'rxjs';
import { catchError, switchMap, delay, retryWhen, take } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { 
  IOcrService, 
  OcrFormElement, 
  OcrProcessingConfig, 
  OcrProcessingResult,
  OcrTable,
  OcrBoundingBox
} from '../../interfaces/ocr-interfaces';
import { FormTemplate } from '../../models/form-template.model';
import { OcrTemplateBuilderService } from './ocr-template-builder.service';

interface FormRecognizerResponse {
  status: string;
  createdDateTime: string;
  lastUpdatedDateTime: string;
  analyzeResult?: {
    version: string;
    readResults: Array<{
      page: number;
      angle: number;
      width: number;
      height: number;
      unit: string;
      lines: Array<{
        text: string;
        boundingBox: number[];
        words: Array<{
          text: string;
          boundingBox: number[];
          confidence: number;
        }>;
      }>;
    }>;
    documentResults?: Array<{
      docType: string;
      pageRange: number[];
      fields: {
        [key: string]: {
          type: string;
          value?: any;
          text?: string;
          boundingBox?: number[];
          page?: number;
          confidence?: number;
          elements?: string[];
        };
      };
    }>;
    tables?: Array<{
      rows: number;
      columns: number;
      cells: Array<{
        rowIndex: number;
        columnIndex: number;
        text: string;
        boundingBox: number[];
        confidence: number;
        isHeader?: boolean;
      }>;
    }>;
  };
}

@Injectable({
  providedIn: 'root'
})
export class MicrosoftFormRecognizerService implements IOcrService {
  private endpoint: string;
  private apiKey: string;
  private apiVersion = '2.1';

  constructor(
    private http: HttpClient,
    private templateBuilder: OcrTemplateBuilderService
  ) {
    // In production, these should come from a secure backend service
    this.endpoint = environment.azure?.formRecognizer?.endpoint || 'https://your-resource.cognitiveservices.azure.com/';
    this.apiKey = environment.azure?.formRecognizer?.apiKey || '';
  }

  processDocument(
    file: File | Blob,
    config?: OcrProcessingConfig
  ): Observable<OcrProcessingResult> {
    return from(this.analyzeForm(file, config)).pipe(
      switchMap(operationLocation => this.pollForResults(operationLocation)),
      switchMap(response => from([this.parseFormRecognizerResponse(response)])),
      catchError(error => {
        console.error('Form Recognizer processing error:', error);
        return throwError(() => new Error('Failed to process document with Form Recognizer'));
      })
    );
  }

  private async analyzeForm(file: File | Blob, config?: OcrProcessingConfig): Promise<string> {
    const modelId = config?.modelId || 'prebuilt-document';
    const url = `${this.endpoint}formrecognizer/v${this.apiVersion}/prebuilt/${modelId}/analyze`;

    const headers = new HttpHeaders({
      'Ocp-Apim-Subscription-Key': this.apiKey,
      'Content-Type': file.type || 'application/pdf'
    });

    const response = await this.http.post(url, file, { 
      headers, 
      observe: 'response' 
    }).toPromise();

    // The operation location is in the response headers
    const operationLocation = response?.headers.get('Operation-Location');
    if (!operationLocation) {
      throw new Error('No operation location returned from Form Recognizer');
    }

    return operationLocation;
  }

  private pollForResults(operationLocation: string): Observable<FormRecognizerResponse> {
    const headers = new HttpHeaders({
      'Ocp-Apim-Subscription-Key': this.apiKey
    });

    return this.http.get<FormRecognizerResponse>(operationLocation, { headers }).pipe(
      switchMap(response => {
        if (response.status === 'succeeded') {
          return from([response]);
        } else if (response.status === 'failed') {
          throw new Error('Form Recognizer analysis failed');
        } else {
          // Still processing, retry after delay
          throw new Error('retry');
        }
      }),
      retryWhen(errors => errors.pipe(
        delay(1000),
        take(30) // Max 30 retries (30 seconds)
      ))
    );
  }

  private parseFormRecognizerResponse(response: FormRecognizerResponse): OcrProcessingResult {
    const startTime = Date.now();
    const elements: OcrFormElement[] = [];
    const tables: OcrTable[] = [];
    const pages: any[] = [];
    let rawText = '';

    if (!response.analyzeResult) {
      return {
        elements: [],
        tables: [],
        metadata: {
          pageCount: 0,
          processingTime: Date.now() - startTime,
          provider: 'Microsoft Form Recognizer',
          documentType: 'UNKNOWN',
          warnings: ['No analyze result found']
        }
      };
    }

    const analyzeResult = response.analyzeResult;

    // Process read results (OCR text)
    analyzeResult.readResults?.forEach(readResult => {
      const pageElements: OcrFormElement[] = [];
      let pageText = '';

      readResult.lines.forEach((line, lineIndex) => {
        pageText += line.text + '\n';
        
        const element: OcrFormElement = {
          id: `page${readResult.page}-line${lineIndex}`,
          type: this.inferElementType(line.text),
          text: line.text,
          confidence: this.calculateLineConfidence(line),
          boundingBox: this.convertBoundingBox(line.boundingBox, readResult.width, readResult.height),
          page: readResult.page,
          relatedElements: []
        };

        elements.push(element);
        pageElements.push(element);
      });

      pages.push({
        pageNumber: readResult.page,
        width: readResult.width,
        height: readResult.height,
        rawText: pageText,
        elements: pageElements
      });

      rawText += pageText + '\n\n';
    });

    // Process document results (extracted fields)
    analyzeResult.documentResults?.forEach(docResult => {
      Object.entries(docResult.fields).forEach(([fieldName, field]) => {
        if (field.text) {
          const element: OcrFormElement = {
            id: `field-${fieldName}`,
            type: this.mapFieldType(field.type),
            text: field.text,
            confidence: (field.confidence || 0) * 100,
            boundingBox: field.boundingBox ? 
              this.convertBoundingBox(field.boundingBox, 1, 1) : 
              { left: 0, top: 0, width: 0, height: 0 },
            fieldName: fieldName,
            value: field.value,
            page: field.page,
            relatedElements: field.elements || []
          };

          elements.push(element);
        }
      });
    });

    // Process tables
    analyzeResult.tables?.forEach((table, tableIndex) => {
      const ocrTable: OcrTable = {
        id: `table-${tableIndex}`,
        rows: table.rows,
        columns: table.columns,
        cells: table.cells.map(cell => ({
          rowIndex: cell.rowIndex,
          columnIndex: cell.columnIndex,
          text: cell.text,
          confidence: cell.confidence * 100,
          isHeader: cell.isHeader || false,
          boundingBox: this.convertBoundingBox(cell.boundingBox, 1, 1)
        }))
      };

      tables.push(ocrTable);
    });

    // Link related elements
    this.linkFormElements(elements);

    return {
      elements,
      tables,
      pages,
      rawText,
      metadata: {
        pageCount: pages.length,
        processingTime: Date.now() - startTime,
        provider: 'Microsoft Form Recognizer',
        documentType: this.detectDocumentType(analyzeResult),
        warnings: []
      },
      rawData: response
    };
  }

  private calculateLineConfidence(line: any): number {
    if (!line.words || line.words.length === 0) {
      return 0;
    }

    const totalConfidence = line.words.reduce((sum: number, word: any) => 
      sum + (word.confidence || 0), 0);
    
    return (totalConfidence / line.words.length) * 100;
  }

  private convertBoundingBox(boundingBox: number[], pageWidth: number, pageHeight: number): OcrBoundingBox {
    if (!boundingBox || boundingBox.length < 8) {
      return { left: 0, top: 0, width: 0, height: 0 };
    }

    // Bounding box format: [x1, y1, x2, y2, x3, y3, x4, y4]
    const x1 = boundingBox[0];
    const y1 = boundingBox[1];
    const x2 = boundingBox[2];
    const y2 = boundingBox[3];
    const x3 = boundingBox[4];
    const y3 = boundingBox[5];
    const x4 = boundingBox[6];
    const y4 = boundingBox[7];

    const minX = Math.min(x1, x2, x3, x4);
    const minY = Math.min(y1, y2, y3, y4);
    const maxX = Math.max(x1, x2, x3, x4);
    const maxY = Math.max(y1, y2, y3, y4);

    return {
      left: minX,
      top: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  private inferElementType(text: string): OcrFormElement['type'] {
    const lowerText = text.toLowerCase().trim();

    // Check for form field indicators
    if (lowerText.match(/\[[\s\x]\]/i) || lowerText.includes('☐') || lowerText.includes('☑')) {
      return 'checkbox';
    }

    if (lowerText.match(/\([\s\x]\)/i) || lowerText.includes('○') || lowerText.includes('●')) {
      return 'radio';
    }

    if (lowerText.includes('select') || lowerText.includes('choose from')) {
      return 'select';
    }

    if (lowerText.endsWith(':') || this.isLabelText(lowerText)) {
      return 'label';
    }

    if (lowerText.includes('___') || lowerText.match(/_+/)) {
      return 'input';
    }

    if (lowerText.includes('signature')) {
      return 'signature';
    }

    return 'text';
  }

  private isLabelText(text: string): boolean {
    const labelPatterns = [
      'name', 'date', 'email', 'phone', 'address', 
      'city', 'state', 'zip', 'country', 'dob', 
      'ssn', 'id', 'gender', 'age', 'height', 'weight'
    ];

    return labelPatterns.some(pattern => 
      text.toLowerCase().includes(pattern) && text.length < 50
    );
  }

  private mapFieldType(type: string): OcrFormElement['type'] {
    switch (type) {
      case 'string':
        return 'text';
      case 'number':
        return 'input';
      case 'date':
        return 'input';
      case 'selectionMark':
        return 'checkbox';
      case 'array':
        return 'select';
      default:
        return 'text';
    }
  }

  private detectDocumentType(analyzeResult: any): string {
    if (analyzeResult.documentResults && analyzeResult.documentResults.length > 0) {
      const docType = analyzeResult.documentResults[0].docType;
      if (docType) {
        return docType.toUpperCase();
      }
    }

    // Try to detect based on content
    const text = analyzeResult.readResults?.[0]?.lines
      ?.map((l: any) => l.text)
      .join(' ')
      .toLowerCase() || '';

    if (text.includes('invoice') || text.includes('bill')) {
      return 'INVOICE';
    }
    if (text.includes('receipt')) {
      return 'RECEIPT';
    }
    if (text.includes('patient') || text.includes('medical')) {
      return 'MEDICAL_FORM';
    }
    if (text.includes('consent')) {
      return 'CONSENT_FORM';
    }

    return 'FORM';
  }

  private linkFormElements(elements: OcrFormElement[]): void {
    // Link labels with their corresponding input fields
    const labels = elements.filter(e => e.type === 'label');
    const inputs = elements.filter(e => 
      e.type === 'input' || e.type === 'checkbox' || 
      e.type === 'radio' || e.type === 'select'
    );

    labels.forEach(label => {
      // Find the closest input field
      let closestInput: OcrFormElement | null = null;
      let minDistance = Infinity;

      inputs.forEach(input => {
        if (input.page === label.page) {
          const distance = this.calculateDistance(label.boundingBox, input.boundingBox);
          if (distance < minDistance && distance < 200) { // Within 200 pixels
            minDistance = distance;
            closestInput = input;
          }
        }
      });

      if (closestInput) {
        label.relatedElements.push(closestInput.id);
        closestInput.relatedElements.push(label.id);
        
        // Transfer field name from label to input
        if (!closestInput.fieldName && label.text) {
          closestInput.fieldName = label.text.replace(/[:*]$/, '').trim();
        }
      }
    });
  }

  private calculateDistance(box1: OcrBoundingBox, box2: OcrBoundingBox): number {
    const center1 = {
      x: box1.left + box1.width / 2,
      y: box1.top + box1.height / 2
    };
    const center2 = {
      x: box2.left + box2.width / 2,
      y: box2.top + box2.height / 2
    };

    return Math.sqrt(
      Math.pow(center2.x - center1.x, 2) + 
      Math.pow(center2.y - center1.y, 2)
    );
  }

  convertToFormTemplate(
    ocrResult: OcrProcessingResult,
    templateName: string
  ): FormTemplate {
    return this.templateBuilder.convertToFormTemplate(ocrResult, templateName);
  }

  getProviderName(): string {
    return 'Microsoft Form Recognizer';
  }

  getProviderCapabilities(): string[] {
    return [
      'PRE_BUILT_MODELS',
      'CUSTOM_MODEL_TRAINING',
      'FORM_EXTRACTION',
      'TABLE_EXTRACTION',
      'KEY_VALUE_EXTRACTION',
      'RECEIPT_PROCESSING',
      'INVOICE_PROCESSING',
      'ID_DOCUMENT_PROCESSING',
      'BUSINESS_CARD_PROCESSING',
      'LAYOUT_ANALYSIS'
    ];
  }

  // Get available pre-built models
  getAvailableModels(): Array<{
    id: string;
    name: string;
    description: string;
  }> {
    return [
      {
        id: 'prebuilt-document',
        name: 'General Document',
        description: 'Extract text, tables, structure, and key-value pairs'
      },
      {
        id: 'prebuilt-layout',
        name: 'Layout',
        description: 'Extract text and layout structure'
      },
      {
        id: 'prebuilt-invoice',
        name: 'Invoice',
        description: 'Extract key information from invoices'
      },
      {
        id: 'prebuilt-receipt',
        name: 'Receipt',
        description: 'Extract key information from receipts'
      },
      {
        id: 'prebuilt-idDocument',
        name: 'ID Document',
        description: 'Extract information from passports and driver licenses'
      },
      {
        id: 'prebuilt-businessCard',
        name: 'Business Card',
        description: 'Extract contact information from business cards'
      },
      {
        id: 'prebuilt-healthInsuranceCard.us',
        name: 'Health Insurance Card',
        description: 'Extract information from US health insurance cards'
      }
    ];
  }
}
