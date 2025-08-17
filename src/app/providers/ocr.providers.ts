import { InjectionToken, Provider } from '@angular/core';
import { IOcrService } from '../interfaces/ocr-interfaces';
import { TextractOcrService } from '../services/ocr/textract-ocr.service';

// Injection token for OCR service
export const OCR_SERVICE = new InjectionToken<IOcrService>('OCR_SERVICE');

// Provider configuration for OCR service
export const OCR_PROVIDERS: Provider[] = [
  {
    provide: OCR_SERVICE,
    useClass: TextractOcrService
  }
];

// Alternative provider configurations for easy switching
export const DOCUMENT_AI_PROVIDERS: Provider[] = [
  {
    provide: OCR_SERVICE,
    useClass: TextractOcrService // Replace with DocumentAIOcrService when implemented
  }
];

export const TESSERACT_PROVIDERS: Provider[] = [
  {
    provide: OCR_SERVICE,
    useClass: TextractOcrService // Replace with TesseractOcrService when implemented
  }
];
