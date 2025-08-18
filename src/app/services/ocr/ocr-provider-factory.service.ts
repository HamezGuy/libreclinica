import { Injectable, Injector } from '@angular/core';
import { IOcrService } from '../../interfaces/ocr-interfaces';
import { TextractOcrService } from './textract-ocr.service';
// import { MicrosoftFormRecognizerService } from './microsoft-form-recognizer.service';
// import { TesseractOcrService } from './tesseract-ocr.service';

export enum OcrProvider {
  AMAZON_TEXTRACT = 'amazon-textract',
  GOOGLE_VISION = 'google-vision',
  MICROSOFT_FORM_RECOGNIZER = 'microsoft-form-recognizer',
  TESSERACT = 'tesseract'
}

export interface OcrProviderConfig {
  provider: OcrProvider;
  apiKey?: string;
  endpoint?: string;
  region?: string;
  features?: string[];
  confidence?: number;
  language?: string;
}

@Injectable({
  providedIn: 'root'
})
export class OcrProviderFactoryService {
  private currentProvider: OcrProvider = OcrProvider.AMAZON_TEXTRACT;
  private providerInstances: Map<OcrProvider, IOcrService> = new Map();
  
  constructor(private injector: Injector) {
    this.initializeProviders();
  }

  private initializeProviders(): void {
    // Initialize provider instances lazily
    this.providerInstances.set(
      OcrProvider.AMAZON_TEXTRACT,
      this.injector.get(TextractOcrService)
    );
    
    // Temporarily disable Google Vision until we fix its implementation
    // this.providerInstances.set(
    //   OcrProvider.GOOGLE_VISION,
    //   this.injector.get(GoogleVisionOcrService)
    // );
    
    // These will be created later
    // this.providerInstances.set(
    //   OcrProvider.MICROSOFT_FORM_RECOGNIZER,
    //   this.injector.get(MicrosoftFormRecognizerService)
    // );
    
    // this.providerInstances.set(
    //   OcrProvider.TESSERACT,
    //   this.injector.get(TesseractOcrService)
    // );
  }

  getOcrService(provider?: OcrProvider): IOcrService {
    const selectedProvider = provider || this.currentProvider;
    const service = this.providerInstances.get(selectedProvider);
    
    if (!service) {
      console.warn(`OCR provider ${selectedProvider} not available, falling back to Amazon Textract`);
      return this.providerInstances.get(OcrProvider.AMAZON_TEXTRACT)!;
    }
    
    return service;
  }

  setDefaultProvider(provider: OcrProvider): void {
    if (this.providerInstances.has(provider)) {
      this.currentProvider = provider;
      localStorage.setItem('ocr-default-provider', provider);
    } else {
      console.error(`OCR provider ${provider} is not available`);
    }
  }

  getCurrentProvider(): OcrProvider {
    return this.currentProvider;
  }

  getAvailableProviders(): Array<{
    id: OcrProvider;
    name: string;
    description: string;
    capabilities: string[];
    recommended?: boolean;
  }> {
    return [
      {
        id: OcrProvider.AMAZON_TEXTRACT,
        name: 'Amazon Textract',
        description: 'AWS OCR service optimized for document processing',
        capabilities: [
          'Form extraction',
          'Table extraction',
          'Key-value pair detection',
          'Signature detection'
        ],
        recommended: true
      },
      {
        id: OcrProvider.MICROSOFT_FORM_RECOGNIZER,
        name: 'Microsoft Form Recognizer',
        description: 'Azure AI service for intelligent document processing',
        capabilities: [
          'Pre-built form models',
          'Custom model training',
          'Receipt and invoice processing',
          'ID document extraction'
        ]
      },
      {
        id: OcrProvider.TESSERACT,
        name: 'Tesseract (Local)',
        description: 'Open-source OCR engine for local processing',
        capabilities: [
          'Offline processing',
          'No API costs',
          'Basic text extraction',
          'Multi-language support'
        ]
      }
    ];
  }

  getProviderConfig(provider: OcrProvider): OcrProviderConfig {
    // Load provider configuration from environment or settings
    const savedConfig = localStorage.getItem(`ocr-config-${provider}`);
    if (savedConfig) {
      return JSON.parse(savedConfig);
    }
    
    // Return default configuration
    return {
      provider,
      language: 'en',
      confidence: 0.8
    };
  }

  saveProviderConfig(config: OcrProviderConfig): void {
    localStorage.setItem(`ocr-config-${config.provider}`, JSON.stringify(config));
  }

  // Method to test OCR provider with a sample image
  async testProvider(provider: OcrProvider, testImage: File): Promise<{
    success: boolean;
    message: string;
    processingTime?: number;
    accuracy?: number;
  }> {
    try {
      const service = this.getOcrService(provider);
      const startTime = Date.now();
      
      const result = await service.processDocument(testImage).toPromise();
      const processingTime = Date.now() - startTime;
      
      if (result && result.elements.length > 0) {
        const avgConfidence = result.elements.reduce((sum, el) => sum + el.confidence, 0) / result.elements.length;
        
        return {
          success: true,
          message: `Successfully processed with ${provider}`,
          processingTime,
          accuracy: avgConfidence
        };
      } else {
        return {
          success: false,
          message: `No text detected with ${provider}`,
          processingTime
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Error testing ${provider}: ${error}`
      };
    }
  }

  // Compare multiple providers on the same document
  async compareProviders(testImage: File): Promise<Array<{
    provider: OcrProvider;
    success: boolean;
    processingTime: number;
    elementCount: number;
    avgConfidence: number;
    score: number;
  }>> {
    const results = [];
    
    for (const [providerId, service] of this.providerInstances) {
      try {
        const startTime = Date.now();
        const result = await service.processDocument(testImage).toPromise();
        const processingTime = Date.now() - startTime;
        
        if (result) {
          const avgConfidence = result.elements.length > 0
            ? result.elements.reduce((sum, el) => sum + el.confidence, 0) / result.elements.length
            : 0;
          
          // Calculate a score based on element count, confidence, and processing time
          const score = (result.elements.length * 0.4) + 
                       (avgConfidence * 0.5) + 
                       ((1000 / processingTime) * 0.1);
          
          results.push({
            provider: providerId,
            success: true,
            processingTime,
            elementCount: result.elements.length,
            avgConfidence,
            score
          });
        }
      } catch (error) {
        results.push({
          provider: providerId,
          success: false,
          processingTime: 0,
          elementCount: 0,
          avgConfidence: 0,
          score: 0
        });
      }
    }
    
    // Sort by score descending
    return results.sort((a, b) => b.score - a.score);
  }
}
