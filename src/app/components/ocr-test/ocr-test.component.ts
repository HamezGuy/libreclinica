import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TextractOcrService } from '../../services/ocr/textract-ocr.service';
import { OcrProcessingResult } from '../../interfaces/ocr-interfaces';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-ocr-test',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="ocr-test-container">
      <h2>OCR Diagnostic Test Page</h2>
      
      <!-- System Information -->
      <div class="system-info">
        <h3>System Information</h3>
        <p><strong>Browser:</strong> {{ browserInfo }}</p>
        <p><strong>Current Origin:</strong> {{ currentOrigin }}</p>
        <p><strong>OCR Endpoint:</strong> {{ ocrEndpoint }}</p>
        <p><strong>Environment:</strong> {{ isProduction ? 'Production' : 'Development' }}</p>
      </div>

      <!-- Connection Test -->
      <div class="connection-test">
        <h3>Connection Test</h3>
        <button (click)="testConnection()" [disabled]="testingConnection">
          {{ testingConnection ? 'Testing...' : 'Test OCR Endpoint Connection' }}
        </button>
        <div *ngIf="connectionResult" [class.success]="connectionResult.success" [class.error]="!connectionResult.success" class="test-result">
          <p><strong>Status:</strong> {{ connectionResult.status }}</p>
          <p><strong>Message:</strong> {{ connectionResult.message }}</p>
          <details *ngIf="connectionResult.details">
            <summary>Details</summary>
            <pre>{{ connectionResult.details | json }}</pre>
          </details>
        </div>
      </div>
      
      <div class="upload-section">
        <h3>Document OCR Test</h3>
        <label for="file-upload" class="file-label">
          <i class="material-icons">cloud_upload</i>
          <span>Choose a document to test OCR</span>
        </label>
        <input 
          id="file-upload"
          type="file" 
          (change)="onFileSelected($event)"
          accept=".pdf,.jpg,.jpeg,.png"
          #fileInput
        />
      </div>

      <div *ngIf="processing" class="processing">
        <div class="spinner"></div>
        <p>Processing document with Amazon Textract...</p>
      </div>

      <div *ngIf="error" class="error">
        <p>Error: {{ error }}</p>
      </div>

      <div *ngIf="result" class="result">
        <h3>OCR Results</h3>
        <div class="metadata">
          <p><strong>Document Type:</strong> {{ result.metadata.documentType || 'Unknown' }}</p>
          <p><strong>Elements found:</strong> {{ result.elements.length }}</p>
          <p><strong>Tables found:</strong> {{ result.tables.length }}</p>
        </div>
        
        <div class="elements">
          <h4>Extracted Form Fields:</h4>
          <div *ngFor="let element of result.elements" class="element">
            <span class="label">{{ element.type | uppercase }}:</span>
            <span class="value">{{ element.text || element.value || 'No text' }}</span>
            <span class="confidence">({{ (element.confidence * 100).toFixed(1) }}%)</span>
          </div>
        </div>

        <details class="raw-data">
          <summary>Raw JSON Response</summary>
          <pre>{{ result | json }}</pre>
        </details>
      </div>
    </div>
  `,
  styles: [`
    .ocr-test-container {
      max-width: 900px;
      margin: 2rem auto;
      padding: 2rem;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    
    .system-info, .connection-test {
      background: #f8f9fa;
      padding: 1rem;
      border-radius: 4px;
      margin-bottom: 2rem;
    }
    
    .system-info h3, .connection-test h3 {
      margin-top: 0;
      color: #495057;
    }
    
    .system-info p, .connection-test p {
      margin: 0.5rem 0;
    }
    
    .connection-test button {
      padding: 0.5rem 1rem;
      background: #17a2b8;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      margin: 1rem 0;
    }
    
    .connection-test button:hover:not(:disabled) {
      background: #138496;
    }
    
    .connection-test button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    
    .test-result {
      padding: 1rem;
      border-radius: 4px;
      margin-top: 1rem;
    }
    
    .test-result.success {
      background: #d4edda;
      color: #155724;
      border: 1px solid #c3e6cb;
    }
    
    .test-result.error {
      background: #f8d7da;
      color: #721c24;
      border: 1px solid #f5c6cb;
    }
    
    .test-result details {
      margin-top: 1rem;
    }
    
    .test-result summary {
      cursor: pointer;
      font-weight: bold;
    }
    
    .test-result pre {
      margin-top: 0.5rem;
      padding: 0.5rem;
      background: white;
      border-radius: 4px;
      overflow-x: auto;
      font-size: 0.85em;
    }

    h2 {
      color: #333;
      margin-bottom: 2rem;
    }

    .upload-section {
      margin-bottom: 2rem;
    }

    .file-label {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem 1.5rem;
      background: #007bff;
      color: white;
      border-radius: 4px;
      cursor: pointer;
      transition: background 0.3s;
    }

    .file-label:hover {
      background: #0056b3;
    }

    input[type="file"] {
      display: none;
    }

    .processing {
      text-align: center;
      padding: 2rem;
    }

    .spinner {
      width: 40px;
      height: 40px;
      margin: 0 auto 1rem;
      border: 4px solid #f3f3f3;
      border-top: 4px solid #007bff;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    .error {
      background: #fee;
      color: #c00;
      padding: 1rem;
      border-radius: 4px;
      margin: 1rem 0;
    }

    .result {
      margin-top: 2rem;
    }

    .metadata {
      background: #f8f9fa;
      padding: 1rem;
      border-radius: 4px;
      margin-bottom: 1rem;
    }

    .elements {
      margin-top: 1rem;
    }

    .element {
      padding: 0.5rem;
      border-bottom: 1px solid #eee;
      display: flex;
      gap: 1rem;
    }

    .label {
      font-weight: bold;
      min-width: 150px;
    }

    .value {
      flex: 1;
    }

    .confidence {
      color: #666;
      font-size: 0.9em;
    }

    .raw-data {
      margin-top: 2rem;
      background: #f8f9fa;
      padding: 1rem;
      border-radius: 4px;
    }

    .raw-data summary {
      cursor: pointer;
      font-weight: bold;
    }

    .raw-data pre {
      margin-top: 1rem;
      overflow-x: auto;
      font-size: 0.85em;
    }
  `]
})
export class OcrTestComponent implements OnInit {
  processing = false;
  error: string | null = null;
  result: OcrProcessingResult | null = null;
  
  // Diagnostic properties
  browserInfo = '';
  currentOrigin = '';
  ocrEndpoint = '';
  isProduction = false;
  testingConnection = false;
  connectionResult: any = null;

  constructor(private ocrService: TextractOcrService) {}
  
  ngOnInit(): void {
    // Get browser information
    const userAgent = navigator.userAgent;
    if (userAgent.indexOf('Windows') !== -1) {
      this.browserInfo = 'Windows - ';
    } else if (userAgent.indexOf('Mac') !== -1) {
      this.browserInfo = 'Mac - ';
    } else {
      this.browserInfo = 'Unknown OS - ';
    }
    
    if (userAgent.indexOf('Chrome') !== -1) {
      this.browserInfo += 'Chrome';
    } else if (userAgent.indexOf('Firefox') !== -1) {
      this.browserInfo += 'Firefox';
    } else if (userAgent.indexOf('Safari') !== -1) {
      this.browserInfo += 'Safari';
    } else if (userAgent.indexOf('Edge') !== -1) {
      this.browserInfo += 'Edge';
    } else {
      this.browserInfo += 'Unknown Browser';
    }
    
    // Get current origin
    this.currentOrigin = window.location.origin;
    
    // Get OCR endpoint
    this.ocrEndpoint = environment.functions?.textractEndpoint || 
                       'https://us-central1-data-entry-project-465905.cloudfunctions.net/analyzeDocument';
    
    // Check if production
    this.isProduction = environment.production;
  }
  
  async testConnection(): Promise<void> {
    this.testingConnection = true;
    this.connectionResult = null;
    
    try {
      // First test: OPTIONS request (CORS preflight)
      const optionsResponse = await fetch(this.ocrEndpoint, {
        method: 'OPTIONS',
        headers: {
          'Origin': window.location.origin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type'
        }
      }).catch(err => ({ ok: false, error: err.message }));
      
      if (!optionsResponse.ok) {
        this.connectionResult = {
          success: false,
          status: 'CORS Preflight Failed',
          message: 'The OPTIONS request failed. This usually indicates a CORS configuration issue.',
          details: {
            endpoint: this.ocrEndpoint,
            origin: window.location.origin,
            error: (optionsResponse as any).error || 'OPTIONS request failed'
          }
        };
        this.testingConnection = false;
        return;
      }
      
      // Second test: POST request with empty data
      const testResponse = await fetch(this.ocrEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ test: true })
      });
      
      const responseData = await testResponse.json();
      
      if (testResponse.ok || responseData.error === 'No document provided') {
        this.connectionResult = {
          success: true,
          status: 'Connection Successful',
          message: 'Successfully connected to OCR endpoint. The service is reachable from this browser.',
          details: {
            endpoint: this.ocrEndpoint,
            origin: window.location.origin,
            response: responseData
          }
        };
      } else {
        this.connectionResult = {
          success: false,
          status: `HTTP ${testResponse.status}`,
          message: responseData.error || 'Unknown error occurred',
          details: {
            endpoint: this.ocrEndpoint,
            origin: window.location.origin,
            response: responseData
          }
        };
      }
    } catch (error: any) {
      this.connectionResult = {
        success: false,
        status: 'Network Error',
        message: error.message || 'Failed to connect to OCR endpoint',
        details: {
          endpoint: this.ocrEndpoint,
          origin: window.location.origin,
          error: error.toString()
        }
      };
    } finally {
      this.testingConnection = false;
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      return;
    }

    const file = input.files[0];
    this.processFile(file);
  }

  private processFile(file: File): void {
    this.processing = true;
    this.error = null;
    this.result = null;

    this.ocrService.processDocument(file).subscribe({
      next: (result) => {
        this.processing = false;
        this.result = result;
        console.log('OCR Success:', result);
      },
      error: (error) => {
        this.processing = false;
        this.error = error.message || 'Failed to process document';
        console.error('OCR Error:', error);
      }
    });
  }
}
