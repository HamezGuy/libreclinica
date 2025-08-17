import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TextractOcrService } from '../../services/ocr/textract-ocr.service';
import { OcrProcessingResult } from '../../interfaces/ocr-interfaces';

@Component({
  selector: 'app-ocr-test',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="ocr-test-container">
      <h2>OCR Test Page</h2>
      
      <div class="upload-section">
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
      max-width: 800px;
      margin: 2rem auto;
      padding: 2rem;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
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
export class OcrTestComponent {
  processing = false;
  error: string | null = null;
  result: OcrProcessingResult | null = null;

  constructor(private ocrService: TextractOcrService) {}

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
