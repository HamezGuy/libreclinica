import { Component, OnInit, ViewChild, ElementRef, Inject, Optional, OnDestroy, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { IOcrService, OcrProcessingResult, OcrProcessingConfig, OcrFormElement } from '../../interfaces/ocr-interfaces';
import { FormTemplate, FormField } from '../../models/form-template.model';
import { FormTemplateService } from '../../services/form-template.service';
import { OcrProviderFactoryService, OcrProvider } from '../../services/ocr/ocr-provider-factory.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { LanguageService } from '../../services/language.service';

@Component({
  selector: 'app-ocr-template-builder',
  standalone: true,
  imports: [
    CommonModule,
    HttpClientModule,
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTabsModule,
    MatSnackBarModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatTooltipModule,
    MatTableModule,
    DragDropModule,
    TranslatePipe
  ],
  templateUrl: './ocr-template-builder.component.html',
  styleUrls: ['./ocr-template-builder.component.scss'],
  providers: []
})
export class OcrTemplateBuilderComponent implements OnInit, AfterViewInit, OnDestroy {
  // Properties for OCR processing
  rawOcrTextByPage = new Map<number, string>();
  detectedElementsByPage = new Map<number, OcrFormElement[]>();
  detectedElements: OcrFormElement[] = [];
  fieldGroups = new Map<string, any[]>();
  generatedFields: FormField[] = [];
  detectedSections: { [key: string]: FormField[] } = {};
  
  // Raw view properties
  rawViewZoom = 1;
  rawViewPan = { x: 0, y: 0 };
  isDraggingRawView = false;
  dragStartPoint = { x: 0, y: 0 };
  lastPanPoint = { x: 0, y: 0 };
  imagePreviewUrl: string | null = null;
  // Common medical form field translations
  private fieldLabelTranslations: { [key: string]: { [lang: string]: string } } = {
    'patient name': { en: 'Patient Name', hi: 'रोगी का नाम', ja: '患者名' },
    'patient name:': { en: 'Patient Name:', hi: 'रोगी का नाम:', ja: '患者名:' },
    'date of birth': { en: 'Date of Birth', hi: 'जन्म तिथि', ja: '生年月日' },
    'date of birth:': { en: 'Date of Birth:', hi: 'जन्म तिथि:', ja: '生年月日:' },
    'gender': { en: 'Gender', hi: 'लिंग', ja: '性別' },
    'gender:': { en: 'Gender:', hi: 'लिंग:', ja: '性別:' },
    'male': { en: 'Male', hi: 'पुरुष', ja: '男性' },
    'female': { en: 'Female', hi: 'महिला', ja: '女性' },
    'patient information form': { en: 'Patient Information Form', hi: 'रोगी सूचना फॉर्म', ja: '患者情報フォーム' },
    'address': { en: 'Address', hi: 'पता', ja: '住所' },
    'address:': { en: 'Address:', hi: 'पता:', ja: '住所:' },
    'phone': { en: 'Phone', hi: 'फोन', ja: '電話' },
    'phone:': { en: 'Phone:', hi: 'फोन:', ja: '電話:' },
    'email': { en: 'Email', hi: 'ईमेल', ja: 'メール' },
    'email:': { en: 'Email:', hi: 'ईमेल:', ja: 'メール:' },
    'emergency contact': { en: 'Emergency Contact', hi: 'आपातकालीन संपर्क', ja: '緊急連絡先' },
    'emergency contact:': { en: 'Emergency Contact:', hi: 'आपातकालीन संपर्क:', ja: '緊急連絡先:' },
    'blood type': { en: 'Blood Type', hi: 'रक्त समूह', ja: '血液型' },
    'blood type:': { en: 'Blood Type:', hi: 'रक्त समूह:', ja: '血液型:' },
    'allergies': { en: 'Allergies', hi: 'एलर्जी', ja: 'アレルギー' },
    'allergies:': { en: 'Allergies:', hi: 'एलर्जी:', ja: 'アレルギー:' },
    'medications': { en: 'Medications', hi: 'दवाएं', ja: '薬' },
    'medications:': { en: 'Medications:', hi: 'दवाएं:', ja: '薬:' },
    'medical history': { en: 'Medical History', hi: 'चिकित्सा इतिहास', ja: '病歴' },
    'medical history:': { en: 'Medical History:', hi: 'चिकित्सा इतिहास:', ja: '病歴:' },
    'insurance': { en: 'Insurance', hi: 'बीमा', ja: '保険' },
    'insurance:': { en: 'Insurance:', hi: 'बीमा:', ja: '保険:' },
    'height': { en: 'Height', hi: 'ऊंचाई', ja: '身長' },
    'height:': { en: 'Height:', hi: 'ऊंचाई:', ja: '身長:' },
    'weight': { en: 'Weight', hi: 'वजन', ja: '体重' },
    'weight:': { en: 'Weight:', hi: 'वजन:', ja: '体重:' },
    'age': { en: 'Age', hi: 'आयु', ja: '年齢' },
    'age:': { en: 'Age:', hi: 'आयु:', ja: '年齢:' },
    'first name': { en: 'First Name', hi: 'पहला नाम', ja: '名' },
    'first name:': { en: 'First Name:', hi: 'पहला नाम:', ja: '名:' },
    'last name': { en: 'Last Name', hi: 'अंतिम नाम', ja: '姓' },
    'last name:': { en: 'Last Name:', hi: 'अंतिम नाम:', ja: '姓:' },
    'middle name': { en: 'Middle Name', hi: 'मध्य नाम', ja: 'ミドルネーム' },
    'middle name:': { en: 'Middle Name:', hi: 'मध्य नाम:', ja: 'ミドルネーム:' },
    'city': { en: 'City', hi: 'शहर', ja: '市' },
    'city:': { en: 'City:', hi: 'शहर:', ja: '市:' },
    'state': { en: 'State', hi: 'राज्य', ja: '州' },
    'state:': { en: 'State:', hi: 'राज्य:', ja: '州:' },
    'zip code': { en: 'Zip Code', hi: 'पिन कोड', ja: '郵便番号' },
    'zip code:': { en: 'Zip Code:', hi: 'पिन कोड:', ja: '郵便番号:' },
    'country': { en: 'Country', hi: 'देश', ja: '国' },
    'country:': { en: 'Country:', hi: 'देश:', ja: '国:' },
    'signature': { en: 'Signature', hi: 'हस्ताक्षर', ja: '署名' },
    'signature:': { en: 'Signature:', hi: 'हस्ताक्षर:', ja: '署名:' },
    'date': { en: 'Date', hi: 'तारीख', ja: '日付' },
    'date:': { en: 'Date:', hi: 'तारीख:', ja: '日付:' },
    'yes': { en: 'Yes', hi: 'हां', ja: 'はい' },
    'no': { en: 'No', hi: 'नहीं', ja: 'いいえ' }
  };

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('imageCanvas') imageCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('rawCanvas') rawCanvas!: ElementRef<HTMLCanvasElement>;

  // State management
  viewMode: 'upload' | 'processing' | 'review' | 'fields' = 'upload';
  isProcessing = false;
  ocrResult: OcrProcessingResult | null = null;
  generatedTemplate: FormTemplate | null = null;
  selectedFile: File | null = null;
  selectedProvider: OcrProvider = OcrProvider.AMAZON_TEXTRACT;
  ocrService: IOcrService | null = null;
  processingProgress = 0;
  documentPreviewUrl: string | null = null;
  detectedFields: FormField[] = [];
  availableProviders: any[] = [];
  providerComparison: any[] = [];
  showProviderSettings = false;
  imagePreviewUrls: string[] = []; // For multi-page PDFs
  totalPages: number = 1;
  currentPageIndex: number = 0;
  activeTab: 'template' | 'raw' = 'template'; // Tab for switching between template and raw OCR view
  selectedTab = 0; // Tab index for mat-tab-group

  // Canvas and drawing properties
  canvasContext: CanvasRenderingContext2D | null = null;
  currentImageNaturalSize = { width: 0, height: 0 };
  imageScale = 1;
  imageOffset = { x: 0, y: 0 };
  showBoundingBoxes = true;
  showConfidenceScores = true;
  selectedElement: OcrFormElement | null = null;

  // Field editing
  editingFieldIndex: number | null = null;
  selectedField: FormField | null = null;

  // Form and state
  templateForm: FormGroup;
  fieldEditForm: FormGroup;

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<OcrTemplateBuilderComponent>,
    private templateService: FormTemplateService,
    private snackBar: MatSnackBar,
    private ocrProviderFactory: OcrProviderFactoryService,
    private languageService: LanguageService,
    @Optional() @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    this.templateForm = this.fb.group({
      name: ['', Validators.required],
      description: [''],
      category: ['ocr-generated'],
      version: ['1.0']
    });

    this.fieldEditForm = this.fb.group({
      label: ['', Validators.required],
      name: ['', Validators.required],
      type: ['text', Validators.required],
      required: [false],
      placeholder: [''],
      helpText: [''],
      isPhiField: [false],
      auditRequired: [false]
    });
  }

  ngOnInit(): void {
    // Pre-fill form if data provided
    if (this.data?.templateName) {
      this.templateForm.patchValue({
        name: this.data.templateName
      });
    }
  }

  ngAfterViewInit(): void {
    // Initialize providers
    this.availableProviders = this.ocrProviderFactory.getAvailableProviders();

    // Initialize canvas after view is ready
    setTimeout(() => {
      if (this.imageCanvas && this.documentPreviewUrl) {
        this.loadImageToCanvas();
      }
    }, 100);
  }

  ngOnDestroy(): void {
    // Clean up
    if (this.documentPreviewUrl) {
      URL.revokeObjectURL(this.documentPreviewUrl);
      this.documentPreviewUrl = null;
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  private async fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64 = reader.result as string;
        // Remove data URL prefix to get pure base64
        const base64Data = base64.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = error => reject(error);
    });
  }

  async testProvider(provider: OcrProvider): Promise<void> {
    if (!this.selectedFile) {
      this.snackBar.open('Please select a document first', 'Close', { duration: 3000 });
      return;
    }

    this.isProcessing = true;
    this.processingProgress = 0;
    try {
      const base64 = await this.fileToBase64(this.selectedFile);
      this.ocrService = this.ocrProviderFactory.getOcrService(provider);
      const ocrService = this.ocrService;
      
      // Simulate progress
      this.processingProgress = 30;
      
      const result = await ocrService.processDocument(base64, {
        enhanceImage: true,
        detectTables: ocrService.getCapabilities().supportsTables,
        extractTables: true
      });
      
      this.processingProgress = 100;
      
      console.log(`${provider} test result:`, result);
      this.snackBar.open('Document processed successfully', 'Close', { duration: 2000 });
    } catch (error) {
      console.error('Processing error:', error);
      this.snackBar.open('Failed to process document', 'Close', { duration: 3000 });
      this.processingProgress = 0;
    } finally {
      this.isProcessing = false;
      this.processingProgress = 0;
    }
  }

  async processWithOcr(): Promise<void> {
    if (!this.selectedFile) return;

    this.viewMode = 'processing';
    this.isProcessing = true;
    this.processingProgress = 0;

    try {
      // Get the selected OCR service
      this.ocrService = this.ocrProviderFactory.getOcrService(this.selectedProvider);
      const ocrService = this.ocrService;

      const config: OcrProcessingConfig = {
        languages: ['en'],
        enhanceImage: true,
        detectTables: true,
        extractTables: true,
        detectForms: true
      };

      // Simulate progress updates
      this.processingProgress = 20;
      const progressInterval = setInterval(() => {
        if (this.processingProgress < 90) {
          this.processingProgress += 10;
        }
      }, 500);

      const result = await ocrService.processDocument(this.selectedFile, config).toPromise();
      
      clearInterval(progressInterval);
      this.processingProgress = 100;
      
      if (!result) {
        throw new Error('No OCR result received');
      }
      
      this.ocrResult = result;
      this.processOcrResult(result);
      this.detectedFields = this.convertOcrToFields(result);
      this.viewMode = 'review';

      // Initialize canvas after view change
      setTimeout(() => {
        this.initializeCanvas();
        this.loadImageToCanvas();
      }, 100);

      // Show success message with provider name
      const providerName = this.availableProviders.find(p => p.id === this.selectedProvider)?.name || 'OCR';
      this.snackBar.open(`Document processed successfully with ${providerName}`, 'Close', { duration: 3000 });
    } catch (error) {
      console.error('OCR processing failed:', error);
      this.snackBar.open('Failed to process document', 'Close', { duration: 3000 });
      this.viewMode = 'upload';
      this.processingProgress = 0;
    } finally {
      this.isProcessing = false;
      this.processingProgress = 0;
    }
  }

  processOcrResult(result: OcrProcessingResult): void {
    // Process pages if they exist in the result
    const resultWithPages = result as any;
    if (resultWithPages.pages && resultWithPages.pages.length > 0) {
      this.totalPages = resultWithPages.pages.length;
      resultWithPages.pages.forEach((page: any, index: number) => {
        // Store raw text by page
        if (page.rawText) {
          this.rawOcrTextByPage.set(index, page.rawText);
        }
        // Store elements by page
        if (page.elements) {
          this.detectedElementsByPage.set(index, page.elements);
        }
      });
    } else if (result.elements) {
      // Fallback if no pages structure
      this.detectedElementsByPage.set(0, result.elements);
      this.detectedElements = result.elements;
    }
    
    // Group related fields
    if (result.elements) {
      this.groupRelatedFields(result.elements);
    }
  }

  async compareProviders(): Promise<void> {
    // Compare current provider capabilities
    this.ocrService = this.ocrProviderFactory.getOcrService(this.selectedProvider);
    const ocrService = this.ocrService;
    if (!ocrService) {
      this.snackBar.open('No OCR service available', 'Close', { duration: 3000 });
      return;
    }
    
    const capabilities = ocrService.getCapabilities();
    this.snackBar.open('Comparing OCR providers...', 'Close', { duration: 2000 });

    try {
      if (this.selectedFile) {
        this.providerComparison = await this.ocrProviderFactory.compareProviders(this.selectedFile);
      }

      // Select the best provider automatically
      if (this.selectedFile && this.providerComparison.length > 0 && this.providerComparison[0].success) {
        this.selectedProvider = this.providerComparison[0].provider;
        this.snackBar.open(
          `Best provider: ${this.availableProviders.find(p => p.id === this.providerComparison[0].provider)?.name}`,
          'Close',
          { duration: 3000 }
        );
      }
    } catch (error) {
      console.error('Provider comparison failed:', error);
      this.snackBar.open('Failed to compare providers', 'Close', { duration: 3000 });
    } finally {
      this.isProcessing = false;
    }
  }

  selectProvider(provider: OcrProvider): void {
    this.selectedProvider = provider;
    this.ocrProviderFactory.setDefaultProvider(provider);
  }

  private groupRelatedFields(elements: OcrFormElement[]): void {
    // Group fields that are on the same horizontal line
    const tolerance = 20; // Pixels tolerance for grouping
    const groups = new Map<string, OcrFormElement[]>();

    elements.forEach((element: OcrFormElement) => {
      let foundGroup = false;

      // Check if element belongs to existing group
      groups.forEach((groupElements: OcrFormElement[], groupId: string) => {
        const avgY = groupElements.reduce((sum: number, el: OcrFormElement) => sum + el.boundingBox.top, 0) / groupElements.length;

        if (Math.abs(element.boundingBox.top - avgY) < tolerance) {
          groupElements.push(element);
          foundGroup = true;
        }
      });

      // Create new group if not found
      if (!foundGroup) {
        const groupId = `group_${groups.size + 1}`;
        groups.set(groupId, [element]);
      }
    });

    // Sort elements within each group by x position
    groups.forEach((groupElements: OcrFormElement[]) => {
      groupElements.sort((a: OcrFormElement, b: OcrFormElement) => a.boundingBox.left - b.boundingBox.left);
    });

    this.fieldGroups = groups;
  }

  // Field generation with improved logic
  private generateFieldsFromOcr(): void {
    if (!this.detectedElements.length) return;

    const fields: FormField[] = [];
    let fieldIndex = 0;

    // Process field groups (fields on same row)
    this.fieldGroups.forEach((groupElements: OcrFormElement[], groupId: string) => {
      // Check if this is a multi-field row (e.g., First Name, Last Name)
      if (groupElements.length > 1) {
        const labels = groupElements.filter((el: OcrFormElement) => el.type === 'label');
        const inputs = groupElements.filter((el: OcrFormElement) => el.type === 'input' || el.type === 'text');

        // Match labels with inputs based on proximity
        labels.forEach((label: OcrFormElement) => {
          const closestInput = this.findClosestElement(label, inputs);

          if (closestInput) {
            fields.push(this.createFieldFromElements(label, closestInput, fieldIndex++));
          } else {
            // Create field from label alone
            fields.push(this.createFieldFromElement(label, fieldIndex++));
          }
        });

        // Handle remaining inputs without labels
        inputs.filter((input: OcrFormElement) => !fields.some((f: FormField) => f.id === input.id)).forEach((input: OcrFormElement) => {
          fields.push(this.createFieldFromElement(input, fieldIndex++));
        });
      } else {
        // Single element in row
        groupElements.forEach((element: OcrFormElement) => {
          fields.push(this.createFieldFromElement(element, fieldIndex++));
        });
      }
    });

    // Process ungrouped elements
    this.detectedElements.filter((el: OcrFormElement) =>
      !Array.from(this.fieldGroups.values()).flat().includes(el)
    ).forEach((element: OcrFormElement) => {
      fields.push(this.createFieldFromElement(element, fieldIndex++));
    });

    this.generatedFields = this.enhanceGeneratedFields(fields);
    this.detectAndGroupSections();
  }

  private findClosestElement(reference: OcrFormElement, candidates: OcrFormElement[]): OcrFormElement | null {
    if (!candidates.length) return null;

    let closest = candidates[0];
    let minDistance = this.calculateDistance(reference, closest);

    candidates.forEach((candidate: OcrFormElement) => {
      const distance = this.calculateDistance(reference, candidate);
      if (distance < minDistance) {
        minDistance = distance;
        closest = candidate;
      }
    });

    // Only return if reasonably close (within 200 pixels)
    return minDistance < 200 ? closest : null;
  }

  private calculateDistance(el1: OcrFormElement, el2: OcrFormElement): number {
    const dx = el1.boundingBox.left - el2.boundingBox.left;
    const dy = el1.boundingBox.top - el2.boundingBox.top;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private createFieldFromElements(label: OcrFormElement, input: OcrFormElement, index: number): FormField {
    const field = this.createFieldFromElement(label, index);
    // Store value in defaultValue instead of non-existent value property
    if (input.value) {
      field.defaultValue = input.value;
    }
    field.placeholder = this.translateFieldLabel(input.text) || field.placeholder;

    // Mark as uncertain if either element has low confidence
    if (label.confidence < 80 || input.confidence < 80) {
      field.validationRules.push({
        type: 'custom',
        message: `OCR confidence: ${Math.min(label.confidence, input.confidence).toFixed(0)}% - Please verify`
      });
    }

    return field;
  }

  private createFieldFromElement(element: OcrFormElement, index: number): FormField {
    const fieldType = this.inferFieldType(element) as FormField['type'];

    // Translate the label based on current language
    const translatedLabel = this.translateFieldLabel(element.text);

    const field: FormField = {
      id: `field_${index + 1}`,
      name: this.sanitizeName(element.text),
      label: translatedLabel,
      type: fieldType,
      required: this.inferRequired(element.text),
      readonly: false,
      hidden: false,
      placeholder: this.generatePlaceholder({ type: fieldType, label: translatedLabel } as FormField),
      helpText: element.confidence < 80 ? `Low confidence (${element.confidence.toFixed(0)}%) - Please verify` : '',
      order: index,
      validationRules: [],
      isPhiField: this.isPHIField(element.text),
      auditRequired: this.isPHIField(element.text),
      options: element.options ? element.options.map((opt: any) => ({ label: this.translateFieldLabel(opt), value: opt })) : [],
      defaultValue: element.value || ''
    };

    // Store page number for multi-page support in custom attributes
    if ((element as any).pageNumber) {
      field.customAttributes = field.customAttributes || {};
      field.customAttributes['pageNumber'] = (element as any).pageNumber;
    }

    return field;
  }

  private translateFieldLabel(text: string): string {
    if (!text) return text;

    // Get current language code
    const currentLang = this.languageService.getCurrentLanguage().code;

    // If already in English (source language), return as is
    if (currentLang === 'en') return text;

    // Look up translation
    const lowerText = text.toLowerCase().trim();
    const translation = this.fieldLabelTranslations[lowerText];

    if (translation && translation[currentLang]) {
      // Preserve original casing style (all caps, title case, etc.)
      const translatedText = translation[currentLang];

      // If original was all caps, make translation all caps
      if (text === text.toUpperCase()) {
        return translatedText.toUpperCase();
      }

      return translatedText;
    }

    // No translation found, return original
    return text;
  }

  private inferFieldType(element: OcrFormElement): FormField['type'] {
    const text = element.text.toLowerCase();

    // Improved field type detection
    if (element.type === 'checkbox') return 'checkbox';
    if (element.type === 'radio') return 'radio';
    if (element.type === 'select') return 'select';

    // Text-based inference
    if (text.includes('email')) return 'email';
    if (text.includes('phone') || text.includes('tel')) return 'phone';
    if (text.includes('date') || text.includes('dob')) return 'date';

    // Default to text field
    return 'text';
  }

  // File handling
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];

      // Validate file
      if (!this.validateFile(file)) {
        return;
      }

      this.selectedFile = file;
      this.loadImagePreview(file);
    }
  }

  private validateFile(file: File): boolean {
    this.ocrService = this.ocrProviderFactory.getOcrService(this.selectedProvider);
    const ocrService = this.ocrService;
    const supportedTypes = ocrService.getSupportedFileTypes();
    const maxSize = ocrService.getMaxFileSize();

    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!supportedTypes.includes(fileExtension)) {
      this.showError(`Unsupported file type. Supported types: ${supportedTypes.join(', ')}`);
      return false;
    }

    if (file.size > maxSize) {
      this.showError(`File too large. Maximum size: ${(maxSize / 1024 / 1024).toFixed(1)}MB`);
      return false;
    }

    return true;
  }

  private async loadImagePreview(file: File): Promise<void> {
    // Handle PDFs with multiple pages
    if (file.type === 'application/pdf') {
      await this.loadPdfPages(file);
    } else {
      // Handle single image files
      const reader = new FileReader();
      // Clean up previous URL if exists
      if (this.documentPreviewUrl) {
        URL.revokeObjectURL(this.documentPreviewUrl);
      }
      // Create object URL for preview
      this.documentPreviewUrl = URL.createObjectURL(file);
      this.imagePreviewUrls = [this.documentPreviewUrl];
      this.totalPages = 1;
      this.currentPageIndex = 0;
      if (this.documentPreviewUrl && this.imageCanvas) {
        this.loadImageToCanvas();
      }
    }
  }

  private async loadPdfPages(file: File): Promise<void> {
    // This would use a PDF.js library to extract pages
    // For now, we'll simulate multi-page support
    try {
      // Ensure PDF.js is present (handles timing when script isn't ready yet)
      await this.ensurePdfJsLoaded();
      // Use PDF.js to render each page
      const pdfjsLib = (window as any).pdfjsLib;
      if (pdfjsLib) {
        // Ensure worker is configured when loaded via CDN
        if (pdfjsLib.GlobalWorkerOptions) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        this.totalPages = pdf.numPages;
        this.imagePreviewUrls = [];

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          canvas.height = viewport.height;
          canvas.width = viewport.width;

          await page.render({
            canvasContext: context,
            viewport: viewport
          }).promise;

          this.imagePreviewUrls.push(canvas.toDataURL());
        }

        this.documentPreviewUrl = this.imagePreviewUrls[0];
        this.currentPageIndex = 0;
        if (this.imageCanvas) {
          this.loadImageToCanvas();
        }
      } else {
        console.error('PDF.js library not loaded - cannot render PDF preview');
        this.showError('PDF preview unavailable. Please check your internet connection and reload.');
      }
    } catch (error) {
      console.error('Error loading PDF pages:', error);
      this.showError('Failed to load PDF pages. Please try a different file.');
    }
  }

  // Dynamically ensure PDF.js is available (useful if CDN script not yet evaluated)
  private pdfJsLoadPromise: Promise<void> | null = null;
  private async ensurePdfJsLoaded(): Promise<void> {
    if ((window as any).pdfjsLib) return;
    if (this.pdfJsLoadPromise) return this.pdfJsLoadPromise;
    this.pdfJsLoadPromise = new Promise<void>(async (resolve, reject) => {
      const scriptId = 'pdfjs-cdn-script';
      let script = document.getElementById(scriptId) as HTMLScriptElement | null;
      if (!script) {
        script = document.createElement('script');
        script.id = scriptId;
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        script.crossOrigin = 'anonymous';
        script.referrerPolicy = 'no-referrer';
        document.head.appendChild(script);
      }
      const start = performance.now();
      const timeoutMs = 10000;
      const check = () => (window as any).pdfjsLib;
      while (!check()) {
        await new Promise(r => setTimeout(r, 50));
        if (performance.now() - start > timeoutMs) {
          reject(new Error('Timed out waiting for PDF.js to load'));
          return;
        }
      }
      resolve();
    });
    return this.pdfJsLoadPromise;
  }

  // Ensure preview images are available before entering review mode
  private async ensurePreviewAvailable(): Promise<void> {
    if (!this.selectedFile) return;
    if (this.selectedFile.type === 'application/pdf') {
      if (!this.imagePreviewUrls || this.imagePreviewUrls.length === 0) {
        await this.loadPdfPages(this.selectedFile);
      }
    } else {
      if (!this.documentPreviewUrl) {
        await new Promise<void>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            this.documentPreviewUrl = e.target?.result as string;
            this.imagePreviewUrls = [this.documentPreviewUrl];
            this.totalPages = 1;
            this.currentPageIndex = 0;
            resolve();
          };
          reader.readAsDataURL(this.selectedFile as File);
        });
      }
    }
  }

  private loadImageToCanvas(): void {
    if (!this.documentPreviewUrl || !this.imageCanvas) return;

    const canvas = this.imageCanvas.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    this.canvasContext = ctx;
    const img = new Image();

    img.onload = () => {
      // Cache natural size for hit-testing and normalized coordinate conversion
      this.currentImageNaturalSize = { width: img.width, height: img.height };
      // Set canvas size
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;

      // Calculate scale to fit image
      const scaleX = canvas.width / img.width;
      const scaleY = canvas.height / img.height;
      this.imageScale = Math.min(scaleX, scaleY) * 0.9; // 90% to leave some margin

      // Center image
      const scaledWidth = img.width * this.imageScale;
      const scaledHeight = img.height * this.imageScale;
      this.imageOffset.x = (canvas.width - scaledWidth) / 2;
      this.imageOffset.y = (canvas.height - scaledHeight) / 2;

      this.drawCanvas();
    };

    img.src = this.documentPreviewUrl;
  }

  // Convert OCR result to form fields
  private convertOcrToFields(result: OcrProcessingResult): FormField[] {
    const fields: FormField[] = [];
    
    if (result.elements) {
      result.elements.forEach((element, index) => {
        fields.push(this.createFieldFromElement(element, index));
      });
    }
    
    return this.enhanceGeneratedFields(fields);
  }


  private sanitizeName(text: string): string {
    return text.toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  private inferRequired(text: string): boolean {
    return text.includes('*') || text.toLowerCase().includes('required');
  }

  private isPHIField(text: string): boolean {
    const phiKeywords = ['name', 'dob', 'birth', 'ssn', 'social', 'address', 'phone', 'email', 'mrn', 'patient', 'medical record'];
    const lowerText = text.toLowerCase();
    return phiKeywords.some((keyword: string) => lowerText.includes(keyword));
  }

  private enhanceGeneratedFields(fields: FormField[]): FormField[] {
    return fields.map((field: FormField, index: number) => {
      // Enhance field with better defaults
      const enhanced = { ...field };

      // Auto-detect PHI fields
      const phiKeywords = ['name', 'dob', 'ssn', 'address', 'phone', 'email', 'mrn', 'patient'];
      enhanced.isPhiField = phiKeywords.some((keyword: string) =>
        field.label.toLowerCase().includes(keyword) ||
        field.name.toLowerCase().includes(keyword)
      );

      // Set audit requirements for PHI fields
      enhanced.auditRequired = enhanced.isPhiField;

      // Add better placeholders based on field type
      if (!enhanced.placeholder) {
        enhanced.placeholder = this.generatePlaceholder(field);
      }

      // Add help text for complex fields
      if (!enhanced.helpText && this.needsHelpText(field)) {
        enhanced.helpText = this.generateHelpText(field);
      }

      // Ensure proper ordering
      enhanced.order = index;

      return enhanced;
    });
  }

  private detectAndGroupSections(): void {
    // Group fields by vertical proximity to create logical sections
    // This helps organize complex forms into manageable sections
    const sections: { [key: string]: FormField[] } = {};
    let currentSection = 'section_1';
    let lastY = 0;

    this.detectedElements.forEach((element: any, index: number) => {
      const field = this.generatedFields.find((f: FormField) => f.id === `field_${index + 1}`);
      if (!field) return;

      // If there's a large vertical gap, start a new section
      if (element.boundingBox.top - lastY > 100) {
        currentSection = `section_${Object.keys(sections).length + 1}`;
      }

      if (!sections[currentSection]) {
        sections[currentSection] = [];
      }
      sections[currentSection].push(field);
      lastY = element.boundingBox.top;
    });

    // Store sections for template creation
    this.detectedSections = sections;
  }

  private generatePlaceholder(field: FormField): string {
    const placeholders: Record<string, string> = {
      email: 'example@email.com',
      tel: '(555) 123-4567',
      date: 'MM/DD/YYYY',
      time: 'HH:MM',
      number: 'Enter number',
      text: `Enter ${field.label.toLowerCase()}`,
      textarea: `Enter ${field.label.toLowerCase()} details...`
    };
    return placeholders[field.type] || `Enter ${field.label.toLowerCase()}`;
  }

  private generateHelpText(field: FormField): string {
    if (field.validationRules.some((r: any) => r.type === 'pattern')) {
      return 'Please enter in the correct format';
    }
    if (field.type === 'date') {
      return 'Select or enter a date';
    }
    if (field.type === 'file') {
      return 'Click to upload a file';
    }
    return '';
  }

  private needsHelpText(field: FormField): boolean {
    return field.type === 'date' ||
      field.type === 'file' ||
      field.validationRules.some((r: any) => r.type === 'pattern');
  }

  // Detected sections already declared above

  // Draw OCR elements on the template builder canvas
  drawOcrElements(): void {
    if (!this.canvasContext || !this.ocrResult) return;
    
    const currentPageElements = this.detectedElementsByPage.get(this.currentPageIndex) || [];
    const naturalWidth = this.currentImageNaturalSize.width;
    const naturalHeight = this.currentImageNaturalSize.height;
    
    if (naturalWidth === 0 || naturalHeight === 0) return;

    currentPageElements.forEach(element => {
      if (!this.showBoundingBoxes && element !== this.selectedElement) return;
      
      // Convert normalized coordinates to canvas coordinates
      const x = (element.boundingBox.left * naturalWidth * this.imageScale) + this.imageOffset.x;
      const y = (element.boundingBox.top * naturalHeight * this.imageScale) + this.imageOffset.y;
      const width = element.boundingBox.width * naturalWidth * this.imageScale;
      const height = element.boundingBox.height * naturalHeight * this.imageScale;
      
      // Draw bounding box
      this.canvasContext!.strokeStyle = element === this.selectedElement ? '#3b82f6' : '#10b981';
      this.canvasContext!.lineWidth = element === this.selectedElement ? 3 : 2;
      this.canvasContext!.strokeRect(x, y, width, height);
      
      // Draw confidence score if enabled
      if (this.showConfidenceScores && element.confidence) {
        this.canvasContext!.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.canvasContext!.fillRect(x, y - 20, 60, 20);
        this.canvasContext!.fillStyle = '#ffffff';
        this.canvasContext!.font = '12px Arial';
        this.canvasContext!.fillText(`${(element.confidence * 100).toFixed(1)}%`, x + 5, y - 5);
      }
    });
  }

  // Initialize canvas after layout is complete
  private initializeCanvas(): void {
    if (!this.imageCanvas || !this.imageCanvas.nativeElement) {
      console.error('Canvas element not found');
      return;
    }

    const canvas = this.imageCanvas.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.error('Could not get canvas context');
      return;
    }

    this.canvasContext = ctx;

    // Set canvas size to match container
    const container = canvas.parentElement;
    if (container) {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    }

    // Load the current page image
    this.loadCurrentPageToCanvas();
  }


  // Load current page image to canvas
  private loadCurrentPageToCanvas(): void {
    const imageUrl = this.imagePreviewUrls && this.imagePreviewUrls.length > 0
      ? this.imagePreviewUrls[this.currentPageIndex]
      : this.imagePreviewUrl;

    if (!imageUrl) {
      console.error('No image URL available');
      this.showError('No preview image available yet. If this is a PDF, please wait for pages to render or reselect the file.');
      return;
    }

    const img = new Image();
    img.onload = () => {
      if (!this.canvasContext || !this.imageCanvas) return;

      const canvas = this.imageCanvas.nativeElement;

      // Cache natural size for hit-testing and normalized coordinate conversion
      this.currentImageNaturalSize = { width: img.width, height: img.height };

      // Calculate scale to fit image in canvas
      const scaleX = canvas.width / img.width;
      const scaleY = canvas.height / img.height;
      this.imageScale = Math.min(scaleX, scaleY) * 0.9; // 90% to leave margin

      // Center the image
      const scaledWidth = img.width * this.imageScale;
      const scaledHeight = img.height * this.imageScale;
      this.imageOffset.x = (canvas.width - scaledWidth) / 2;
      this.imageOffset.y = (canvas.height - scaledHeight) / 2;

      // Draw the image
      this.drawCanvas();
    };

    img.onerror = () => {
      console.error('Failed to load image:', imageUrl);
      this.showError('Failed to load document image');
    };

    img.src = imageUrl;
  }

  // Canvas drawing
  private drawCanvas(): void {
    if (!this.canvasContext || !this.imagePreviewUrl) return;

    const canvas = this.imageCanvas?.nativeElement;
    if (!canvas) return;

    const ctx = this.canvasContext;
    const img = new Image();

    img.onload = () => {
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw image
      const scaledWidth = img.width * this.imageScale;
      const scaledHeight = img.height * this.imageScale;
      ctx.drawImage(img, this.imageOffset.x, this.imageOffset.y, scaledWidth, scaledHeight);

      // Draw OCR elements if in review mode
      if (this.viewMode === 'review' && this.ocrResult && this.selectedTab === 0) {
        this.drawOcrElements();
      }
    };

    img.src = this.imagePreviewUrl;
  }

  // Raw view canvas drawing
  private drawRawCanvas(canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext('2d');
    if (!ctx || !this.imagePreviewUrl) return;

    const img = new Image();
    img.onload = () => {
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Apply zoom and pan transformations
      ctx.save();
      ctx.translate(this.rawViewPan.x, this.rawViewPan.y);
      ctx.scale(this.rawViewZoom, this.rawViewZoom);

      // Draw image
      const scaledWidth = img.width;
      const scaledHeight = img.height;
      ctx.drawImage(img, 0, 0, scaledWidth, scaledHeight);

      // Draw raw OCR bounding boxes
      if (this.ocrResult && this.showBoundingBoxes) {
        this.drawRawOcrBoundingBoxes(ctx, img.width, img.height);
      }

      ctx.restore();
    };

    img.src = this.imagePreviewUrl;
  }

  // Draw raw OCR bounding boxes
  private drawRawOcrBoundingBoxes(ctx: CanvasRenderingContext2D, imgWidth: number, imgHeight: number): void {
    if (!this.ocrResult) return;

    const currentPageElements = this.getCurrentPageElements();
    
    currentPageElements.forEach(element => {
      // Convert normalized coordinates to pixel coordinates
      const x = element.boundingBox.left * imgWidth;
      const y = element.boundingBox.top * imgHeight;
      const width = element.boundingBox.width * imgWidth;
      const height = element.boundingBox.height * imgHeight;

      // Set style based on element type
      ctx.strokeStyle = this.getElementColor(element.type);
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, width, height);

      // Draw confidence score if enabled
      if (this.showConfidenceScores) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(x, y - 20, 50, 20);
        ctx.fillStyle = 'white';
        ctx.font = '12px Arial';
        ctx.fillText(`${element.confidence}%`, x + 5, y - 5);
      }
    });
  }

  // Get color for element type
  private getElementColor(type: string): string {
    switch (type) {
      case 'label': return '#10b981';
      case 'input': return '#3b82f6';
      case 'select': return '#8b5cf6';
      case 'checkbox':
      case 'radio': return '#f97316';
      default: return '#6b7280';
    }
  }

  // Switch between tabs
  switchTab(tab: 'template' | 'raw'): void {
    this.activeTab = tab;
    if (tab === 'raw') {
      // Switching to raw OCR tab - initialize canvas after DOM update
      setTimeout(() => {
        this.updateRawCanvas();
      }, 100);
    } else if (tab === 'template' && this.viewMode === 'review') {
      // Redraw canvas when switching back to template tab
      setTimeout(() => {
        this.initializeCanvas();
        this.loadImageToCanvas();
      }, 100);
    }
  }

  getRawOcrText(): string {
    if (!this.ocrResult) return 'No OCR result available';
    const resultWithPages = this.ocrResult as any;
    if (resultWithPages.pages && resultWithPages.pages[this.currentPageIndex]) {
      return resultWithPages.pages[this.currentPageIndex].rawText || 'No text extracted';
    }
    
    // Try to get text from detected elements
    const elements = this.detectedElementsByPage.get(this.currentPageIndex) || [];
    if (elements.length > 0) {
      return elements.map(el => el.text).join('\n');
    }
    
    return 'No text extracted';
  }

  getCurrentPageData(): any {
    if (!this.ocrResult) return null;
    const resultWithPages = this.ocrResult as any;
    if (!resultWithPages.pages || resultWithPages.pages.length === 0) {
      return null;
    }
    return resultWithPages.pages[this.currentPageIndex];
  }

  getCurrentPageRawText(): string {
    const pageData = this.getCurrentPageData();
    if (pageData && pageData.rawText) {
      return pageData.rawText;
    }
    return this.getRawOcrText();
  }

  // Raw view zoom controls
  zoomInRaw(): void {
    this.rawViewZoom = Math.min(this.rawViewZoom * 1.2, 5);
    this.updateRawCanvas();
  }

  zoomOutRaw(): void {
    this.rawViewZoom = Math.max(this.rawViewZoom / 1.2, 0.5);
    this.updateRawCanvas();
  }

  resetRawView(): void {
    this.rawViewZoom = 1;
    this.rawViewPan = { x: 0, y: 0 };
    this.updateRawCanvas();
  }

  // Page navigation methods
  previousPage(): void {
    if (this.currentPageIndex > 0) {
      this.currentPageIndex--;
      this.loadCurrentPage();
    }
  }

  nextPage(): void {
    if (this.currentPageIndex < this.totalPages - 1) {
      this.currentPageIndex++;
      this.loadCurrentPage();
    }
  }

  // Load current page image and OCR data
  private loadCurrentPage(): void {
    if (this.imagePreviewUrls && this.imagePreviewUrls[this.currentPageIndex]) {
      this.imagePreviewUrl = this.imagePreviewUrls[this.currentPageIndex];
      this.loadImageToCanvas();
      this.updateRawCanvas();
    }
  }

  fitToScreenRaw(): void {
    if (!this.rawCanvas?.nativeElement) return;
    
    const canvas = this.rawCanvas.nativeElement;
    const containerWidth = canvas.parentElement?.clientWidth || 800;
    const containerHeight = canvas.parentElement?.clientHeight || 600;
    
    const imageWidth = this.currentImageNaturalSize.width;
    const imageHeight = this.currentImageNaturalSize.height;
    
    if (imageWidth > 0 && imageHeight > 0) {
      const scaleX = containerWidth / imageWidth;
      const scaleY = containerHeight / imageHeight;
      this.rawViewZoom = Math.min(scaleX, scaleY) * 0.9; // 90% to leave some margin
      this.rawViewPan = { x: 0, y: 0 };
      this.updateRawCanvas();
    }
  }

  onRawCanvasMouseDown(event: MouseEvent): void {
    this.isDraggingRawView = true;
    this.dragStartPoint = { x: event.clientX, y: event.clientY };
    this.lastPanPoint = { ...this.rawViewPan };
    event.preventDefault();
  }

  onRawCanvasMouseMove(event: MouseEvent): void {
    if (!this.isDraggingRawView) return;
    
    const deltaX = event.clientX - this.dragStartPoint.x;
    const deltaY = event.clientY - this.dragStartPoint.y;
    
    this.rawViewPan = {
      x: this.lastPanPoint.x + deltaX,
      y: this.lastPanPoint.y + deltaY
    };
    
    this.updateRawCanvas();
    event.preventDefault();
  }

  onRawCanvasMouseUp(event: MouseEvent): void {
    this.isDraggingRawView = false;
    event.preventDefault();
  }

  onRawCanvasWheel(event: WheelEvent): void {
    event.preventDefault();
    const delta = event.deltaY > 0 ? 0.9 : 1.1;
    this.rawViewZoom = Math.max(0.5, Math.min(5, this.rawViewZoom * delta));
    this.updateRawCanvas();
  }

  updateRawCanvas(): void {
    if (!this.rawCanvas?.nativeElement) return;
    
    const canvas = this.rawCanvas.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const container = canvas.parentElement;
    if (container) {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    }

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw the image if available
    if (this.imagePreviewUrl) {
      const img = new Image();
      img.onload = () => {
        // Store natural size
        this.currentImageNaturalSize = { width: img.width, height: img.height };
        
        // Calculate scaled dimensions
        const scaledWidth = img.width * this.rawViewZoom;
        const scaledHeight = img.height * this.rawViewZoom;
        
        // Center the image with pan offset
        const x = (canvas.width - scaledWidth) / 2 + this.rawViewPan.x;
        const y = (canvas.height - scaledHeight) / 2 + this.rawViewPan.y;
        
        // Draw image
        ctx.drawImage(img, x, y, scaledWidth, scaledHeight);
        
        // Draw bounding boxes if enabled
        if (this.showBoundingBoxes && this.ocrResult) {
          this.drawRawBoundingBoxes(ctx, x, y, scaledWidth, scaledHeight, img.width, img.height);
        }
      };
      img.src = this.imagePreviewUrl;
    }
  }

  private drawRawBoundingBoxes(ctx: CanvasRenderingContext2D, imgX: number, imgY: number, imgWidth: number, imgHeight: number, naturalWidth: number, naturalHeight: number): void {
    const elements = this.detectedElementsByPage.get(this.currentPageIndex) || [];
    
    elements.forEach(element => {
      // Calculate bounding box position relative to the image
      const x = imgX + (element.boundingBox.left * imgWidth);
      const y = imgY + (element.boundingBox.top * imgHeight);
      const width = element.boundingBox.width * imgWidth;
      const height = element.boundingBox.height * imgHeight;
      
      // Set style based on element type
      ctx.strokeStyle = this.getElementColor(element.type);
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, width, height);
      
      // Draw confidence score if enabled
      if (this.showConfidenceScores && element.confidence) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(x, y - 20, 60, 20);
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px Arial';
        ctx.fillText(`${element.confidence}%`, x + 5, y - 5);
      }
    });
  }

  // Element selection and editing
  onCanvasClick(event: MouseEvent): void {
    if (this.viewMode !== 'review') return;

    const canvas = this.imageCanvas.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;

    // Convert mouse position to normalized image coordinates (0-1)
    const imgW = this.currentImageNaturalSize.width || 1;
    const imgH = this.currentImageNaturalSize.height || 1;
    const xNorm = (mx - this.imageOffset.x) / (this.imageScale * imgW);
    const yNorm = (my - this.imageOffset.y) / (this.imageScale * imgH);

    // Restrict hit-test to elements on the current page
    const elementsOnPage = this.detectedElementsByPage.get(this.currentPageIndex) ||
      this.detectedElements.filter((el: any) => {
        const pn = (el as any).pageNumber;
        return this.totalPages <= 1 ? true : pn === this.currentPageIndex + 1;
      });

    // Find clicked element using normalized coordinates
    const clickedElement = elementsOnPage.find((element: any) => {
      const box = element.boundingBox;
      return xNorm >= box.left && xNorm <= box.left + box.width &&
        yNorm >= box.top && yNorm <= box.top + box.height;
    });

    this.selectedElement = clickedElement || null;
    this.drawCanvas();
  }

  // Element type change
  changeElementType(element: any, newType: string): void {
    element.type = newType as any;
    this.generateFieldsFromOcr();
    this.drawCanvas();
  }

  // Field management
  onFieldDrop(event: CdkDragDrop<FormField[]>): void {
    // Reorder using indices mapped from the visible (current page) subset to the full list
    const dragged: FormField = (event.item as any).data as FormField;
    const visible = this.getVisibleFields();
    const toField = visible[event.currentIndex];
    if (!dragged || !toField) return;
    const fromIndex = this.generatedFields.findIndex((f: FormField) => f.id === dragged.id);
    const toIndex = this.generatedFields.findIndex((f: FormField) => f.id === toField.id);
    if (fromIndex < 0 || toIndex < 0) return;
    moveItemInArray(this.generatedFields, fromIndex, toIndex);
  }

  removeField(index: number): void {
    this.generatedFields.splice(index, 1);
  }

  removeFieldItem(field: FormField): void {
    const idx = this.generatedFields.findIndex((f: FormField) => f.id === field.id);
    if (idx >= 0) {
      this.removeField(idx);
    }
  }

  editField(field: FormField, index?: number): void {
    this.selectedField = field;
    const idx = (typeof index === 'number') ? index : this.generatedFields.findIndex((f: FormField) => f.id === field.id);
    this.editingFieldIndex = idx >= 0 ? idx : null;

    // Populate the edit form with current field values
    this.fieldEditForm.patchValue({
      label: field.label,
      name: field.name,
      type: field.type,
      required: field.required,
      placeholder: field.placeholder || '',
      helpText: field.helpText || '',
      isPhiField: field.isPhiField || false,
      auditRequired: field.auditRequired || false
    });
  }

  saveFieldEdit(): void {
    if (this.editingFieldIndex === null || !this.fieldEditForm.valid) return;

    const updatedValues = this.fieldEditForm.value;
    const field = this.generatedFields[this.editingFieldIndex];

    // Update field with new values
    Object.assign(field, {
      label: updatedValues.label,
      name: updatedValues.name,
      type: updatedValues.type,
      required: updatedValues.required,
      placeholder: updatedValues.placeholder,
      helpText: updatedValues.helpText,
      isPhiField: updatedValues.isPhiField,
      auditRequired: updatedValues.auditRequired
    });

    // Update validation rules based on field type
    this.updateFieldValidation(field);

    // Clear editing state
    this.editingFieldIndex = null;
    this.selectedField = null;
    this.fieldEditForm.reset();
  }

  cancelFieldEdit(): void {
    this.editingFieldIndex = null;
    this.selectedField = null;
    this.fieldEditForm.reset();
  }

  private updateFieldValidation(field: FormField): void {
    // Update validation rules based on field type
    const existingRules = field.validationRules.filter((r: any) => r.type !== 'required');

    if (field.required) {
      existingRules.unshift({ type: 'required', value: true, message: 'This field is required' });
    }

    // Add type-specific validation
    switch (field.type) {
      case 'email':
        if (!existingRules.some((r: any) => r.type === 'pattern')) {
          existingRules.push({
            type: 'pattern',
            value: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
            message: 'Please enter a valid email address'
          });
        }
        break;
      case 'phone':
        if (!existingRules.some((r: any) => r.type === 'pattern')) {
          existingRules.push({
            type: 'pattern',
            value: '^[\\+]?[(]?[0-9]{3}[)]?[-\\s\\.]?[0-9]{3}[-\\s\\.]?[0-9]{4,6}$',
            message: 'Please enter a valid phone number'
          });
        }
        break;
    }

    field.validationRules = existingRules;
  }

  // View controls
  toggleBoundingBoxes(): void {
    this.showBoundingBoxes = !this.showBoundingBoxes;
    this.drawCanvas();
  }

  toggleConfidenceScores(): void {
    this.showConfidenceScores = !this.showConfidenceScores;
    this.drawCanvas();
  }

  // Fields view helpers for per-page filtering
  isFieldOnCurrentPage(field: FormField): boolean {
    if (this.totalPages <= 1) return true;
    const pageNum = field.customAttributes?.['pageNumber'];
    return pageNum === this.currentPageIndex + 1;
  }

  get filteredFieldsCount(): number {
    return this.totalPages <= 1
      ? this.generatedFields.length
      : this.generatedFields.filter(f => this.isFieldOnCurrentPage(f)).length;
  }

  getVisibleFields(): FormField[] {
    return this.totalPages <= 1
      ? this.generatedFields
      : this.generatedFields.filter(f => this.isFieldOnCurrentPage(f));
  }

  switchToFieldsView(): void {
    this.viewMode = 'review'; // Changed from 'fields' to 'review' as 'fields' is not in the type union
  }

  switchToReviewView(): void {
    this.viewMode = 'review';
    setTimeout(() => {
      this.initializeCanvas();
    }, 100);
  }

  // Navigate to a specific page in multi-page documents
  navigateToPage(pageIndex: number): void {
    if (pageIndex < 0 || pageIndex >= this.totalPages) return;

    this.currentPageIndex = pageIndex;
    this.imagePreviewUrl = this.imagePreviewUrls[pageIndex];

    // Reload canvas with new page
    if (this.viewMode === 'review') {
      this.initializeCanvas();
      this.loadCurrentPageToCanvas();
    }
  }

  // Get detected elements for current page with bounding box info
  getCurrentPageElements(): any[] {
    const elements = this.detectedElementsByPage.get(this.currentPageIndex) || [];
    return elements.map(el => ({
      text: el.text,
      type: el.type,
      confidence: el.confidence,
      boundingBox: {
        left: Math.round(el.boundingBox.left * 100) / 100,
        top: Math.round(el.boundingBox.top * 100) / 100,
        width: Math.round(el.boundingBox.width * 100) / 100,
        height: Math.round(el.boundingBox.height * 100) / 100
      }
    }));
  }


  // Save template
  async saveTemplate(): Promise<void> {
    if (!this.templateForm.valid) {
      this.showError('Please fill in all required fields');
      return;
    }
    
    if (this.generatedFields.length === 0) {
      this.showError('No fields detected. Please review and add fields manually.');
      return;
    }
    
    try {
      const formData = this.templateForm.value;
      const template: FormTemplate = {
        id: '',
        name: formData.name,
        description: formData.description || `Template created from OCR scan on ${new Date().toLocaleDateString()}`,
        version: formData.version,
        templateType: 'form',
        isPatientTemplate: false,
        isStudySubjectTemplate: false,
        status: 'draft',
        fields: this.generatedFields,
        sections: this.createTemplateSections(),
        childTemplateIds: [],
        linkedTemplates: [],
        phiDataFields: [],
        hipaaCompliant: false,
        gdprCompliant: false,
        createdBy: 'current-user',
        lastModifiedBy: 'current-user',
        createdAt: new Date(),
        updatedAt: new Date(),
        changeHistory: [],
        // Required compliance settings
        requiresElectronicSignature: false,
        complianceRegions: [],
        phiEncryptionEnabled: false,
        phiAccessLogging: false,
        phiDataMinimization: false,
        allowSavePartial: true,
        requiresReview: false,
        allowEditing: true,
        // Required metadata
        tags: [],
        category: formData.category || 'general',
        childFormIds: []
      };
      
      await this.templateService.createTemplate(template);
      
      this.snackBar.open('Template created successfully!', 'Close', {
        duration: 3000,
        panelClass: ['success-snackbar']
      });
      
      this.dialogRef.close(template);
    } catch (error) {
      this.showError('Failed to save template. Please try again.');
    }
  }

  // Utility methods
  private showError(message: string): void {
    this.snackBar.open(message, 'Close', {
      duration: 5000,
      panelClass: ['error-snackbar']
    });
  }

  getFieldTypeIcon(type: string): string {
    const icons: Record<string, string> = {
      text: 'text_fields',
      email: 'email',
      tel: 'phone',
      number: 'pin',
      date: 'event',
      time: 'schedule',
      select: 'arrow_drop_down',
      radio: 'radio_button_checked',
      checkbox: 'check_box',
      textarea: 'notes',
      file: 'attach_file'
    };
    return icons[type] || 'text_fields';
  }

  private createTemplateSections(): any[] {
    const sections: any[] = [];
    
    if (Object.keys(this.detectedSections).length > 0) {
      // Use detected sections
      Object.entries(this.detectedSections).forEach(([sectionId, fields], index) => {
        sections.push({
          id: sectionId,
          name: this.generateSectionName(sectionId, fields),
          fields: fields.map(f => f.id),
          order: index,
          collapsible: true,
          defaultExpanded: index === 0
        });
      });
    } else {
      // Fallback to single section
      sections.push({
        id: 'section_1',
        name: 'Main Section',
        fields: this.generatedFields.map(f => f.id),
        order: 0,
        collapsible: true,
        defaultExpanded: true
      });
    }
    
    return sections;
  }
  
  private generateSectionName(sectionId: string, fields: FormField[]): string {
    // Try to infer section name from field labels
    const fieldLabels = fields.map(f => f.label.toLowerCase());
    
    // Common section patterns
    if (fieldLabels.some(label => label.includes('demographic') || label.includes('personal'))) {
      return 'Demographics';
    }
    if (fieldLabels.some(label => label.includes('medical') || label.includes('history'))) {
      return 'Medical History';
    }
    if (fieldLabels.some(label => label.includes('vital') || label.includes('sign'))) {
      return 'Vital Signs';
    }
    if (fieldLabels.some(label => label.includes('medication') || label.includes('drug'))) {
      return 'Medications';
    }
    if (fieldLabels.some(label => label.includes('allerg'))) {
      return 'Allergies';
    }
    if (fieldLabels.some(label => label.includes('contact') || label.includes('emergency'))) {
      return 'Contact Information';
    }
    if (fieldLabels.some(label => label.includes('insurance') || label.includes('billing'))) {
      return 'Insurance Information';
    }
    
    // Default to Section N
    return `Section ${sectionId.replace('section_', '')}`;
  }

  cancel(): void {
    this.dialogRef.close();
  }
}
