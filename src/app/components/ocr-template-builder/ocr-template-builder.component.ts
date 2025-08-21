import { Component, OnInit, ViewChild, ElementRef, Inject, Optional, OnDestroy, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { FormBuilder, FormGroup, FormArray, Validators, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { DragDropModule } from '@angular/cdk/drag-drop';
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
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatTableModule,
    MatTabsModule,
    MatSnackBarModule,
    DragDropModule,
    HttpClientModule,
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
  generatedFields: any[] = [];
  detectedSections: { [key: string]: FormField[] } = {};
  
  // Raw view properties
  rawViewZoom = 1;
  rawViewPan = { x: 0, y: 0 };
  isDraggingRawView = false;
  dragStartPoint = { x: 0, y: 0 };
  lastPanPoint = { x: 0, y: 0 };
  imagePreviewUrl: string | null = null;
  // Drawing properties for canvas selection
  isDrawing = false;
  drawStartX = 0;
  drawStartY = 0;
  
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
  activeTab: 'template' | 'raw' = 'template';
  selectedFile: File | null = null;
  ocrResult: any = null;
  selectedProvider: OcrProvider = OcrProvider.AMAZON_TEXTRACT;
  ocrService: IOcrService | null = null;
  isProcessing = false;
  processingProgress = 0;
  documentPreviewUrl: string | null = null;
  detectedFields: FormField[] = [];
  availableProviders: any[] = [];
  providerComparison: any[] = [];
  showProviderSettings = false;
  imagePreviewUrls: string[] = []; // For multi-page PDFs
  totalPages: number = 1;
  currentPageIndex: number = 0; 
  selectedTab = 0; // Tab index for mat-tab-group

  // Canvas and drawing properties
  canvas: HTMLCanvasElement | null = null;
  ctx: CanvasRenderingContext2D | null = null;
  currentImage: HTMLImageElement | null = null;
  imageScale: number = 1;
  imageOffsetX: number = 0;
  imageOffsetY: number = 0;
  zoomLevel: number = 1;
  isDragging: boolean = false;
  dragStartX: number = 0;
  dragStartY: number = 0;
  panOffset: { x: number; y: number } = { x: 0, y: 0 };  
  showBoundingBoxes = true;
  showConfidenceScores = true;
  selectedElement: any = null;
  editingFieldIndex: number | null = null;

  // Field editing
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
    // Initialize forms with proper default values to prevent writeValue errors
    this.templateForm = this.fb.group({
      name: [this.data?.templateName || '', Validators.required],
      description: [this.data?.description || ''],
      category: [this.data?.category || 'ocr-generated'],
      version: [this.data?.version || '1.0']
    });

    this.fieldEditForm = this.fb.group({
      label: ['', Validators.required],
      name: ['', Validators.required],
      type: ['text', Validators.required],
      required: [false || false],  // Ensure boolean
      placeholder: [''],
      helpText: [''],
      isPhiField: [false || false],  // Ensure boolean
      auditRequired: [false || false]  // Ensure boolean
    });
  }

  ngOnInit(): void {
    // Forms already initialized with data in constructor
    // Additional initialization if needed
    if (this.data) {
      // Safely patch any additional data
      const patchData: any = {};
      if (this.data.templateName && !this.templateForm.get('name')?.value) {
        patchData.name = this.data.templateName;
      }
      if (this.data.description && !this.templateForm.get('description')?.value) {
        patchData.description = this.data.description;
      }
      if (Object.keys(patchData).length > 0) {
        this.templateForm.patchValue(patchData);
      }
    }
  }

  ngAfterViewInit(): void {
    // Initialize providers
    this.availableProviders = this.ocrProviderFactory.getAvailableProviders();

    // Initialize canvas after view is ready
    setTimeout(() => {
      // Initialize canvas for review mode
      if (this.viewMode === 'review' && this.imageCanvas?.nativeElement) {
        this.initializeCanvas();
        if (this.documentPreviewUrl || this.imagePreviewUrl) {
          this.loadCurrentPageToCanvas();
        }
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

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      
      // Validate file size (5MB max)
      if (file.size > 5 * 1024 * 1024) {
        this.snackBar.open('File size must be less than 5MB', 'Close', { duration: 3000 });
        return;
      }
      
      // Validate file type
      const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/tiff', 'image/bmp'];
      if (!allowedTypes.includes(file.type)) {
        this.snackBar.open('Invalid file type. Please upload PDF, PNG, JPG, JPEG, TIFF, or BMP files.', 'Close', { duration: 3000 });
        return;
      }
      
      this.selectedFile = file;
      
      // Create preview URL for images
      if (file.type.startsWith('image/')) {
        if (this.documentPreviewUrl) {
          URL.revokeObjectURL(this.documentPreviewUrl);
        }
        this.documentPreviewUrl = URL.createObjectURL(file);
      }
    }
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
      
      console.log('OCR Result received:', result);
      console.log('Elements:', result.elements?.length || 0);
      console.log('Tables:', result.tables?.length || 0);
      
      this.ocrResult = result;
      this.generatedFields = this.convertOcrToFields(result);
      // Enhance fields with better labels and types if needed
      // Additional processing can be added here
      this.processOcrResult(result);
      this.detectedFields = this.convertOcrToFields(result);
      
      // Store elements for bounding box display
      if (result.elements && result.elements.length > 0) {
        this.detectedElements = result.elements;
        console.log('Detected elements for bounding boxes:', this.detectedElements);
      }
      
      // Create or maintain document preview URL
      if (!this.documentPreviewUrl && this.selectedFile) {
        if (this.selectedFile.type === 'application/pdf') {
          // For PDFs, create a blob URL
          this.documentPreviewUrl = URL.createObjectURL(this.selectedFile);
          this.imagePreviewUrl = this.documentPreviewUrl;
        } else if (this.selectedFile.type.startsWith('image/')) {
          // For images, create a preview URL
          this.documentPreviewUrl = URL.createObjectURL(this.selectedFile);
          this.imagePreviewUrl = this.documentPreviewUrl;
        }
      }
      
      this.viewMode = 'review';

      // Initialize canvas after view change
      setTimeout(() => {
        if (this.imageCanvas && this.imageCanvas.nativeElement) {
          this.initializeCanvas();
          this.loadCurrentPageToCanvas();
        }
        // Draw OCR elements after canvas is ready
        if (this.ocrResult && this.ctx) {
          setTimeout(() => {
            // this.drawOcrElements(); // Method to be implemented if needed
          }, 200);
        }
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

  // Convert OCR result to form fields
  private convertOcrToFields(result: OcrProcessingResult): FormField[] {
    const fields: FormField[] = [];
    const resultWithPages = result as any;
    
    if (resultWithPages.pages && resultWithPages.pages.length > 0) {
      resultWithPages.pages.forEach((page: any, pageIndex: number) => {
        if (page.elements) {
          page.elements.forEach((element: any, index: number) => {
            const field = this.createFieldFromOcrElement(element, pageIndex, index);
            if (field) {
              fields.push(field);
            }
          });
        }
      });
    } else if (result.elements) {
      result.elements.forEach((element: any, index: number) => {
        const field = this.createFieldFromOcrElement(element, 0, index);
        if (field) {
          fields.push(field);
        }
      });
    }
    
    return fields;
  }

  // Create a form field from an OCR element
  private createFieldFromOcrElement(element: OcrFormElement, pageIndex: number, index: number): FormField {
    if (!element || !element.text) {
      // Return a default field if element is invalid
      return {
        id: `field_${pageIndex}_${index}`,
        type: 'text',
        label: 'Unknown Field',
        name: `field_${pageIndex}_${index}`,
        placeholder: '',
        helpText: '',
        required: false,
        readonly: false,
        hidden: false,
        options: [],
        validationRules: [],
        order: index,
        isPhiField: false,
        auditRequired: false,
        customAttributes: {
          pageNumber: pageIndex + 1,
          confidence: 0,
          boundingBox: null
        }
      };
    }

    // Determine field type based on element type and text content
    let fieldType = this.inferFieldType(element.text);
    
    // Override field type based on OCR element type if available
    if (element.type === 'checkbox' || (element as any).type === 'selection') {
      fieldType = 'checkbox';
    } else if (element.type === 'radio') {
      fieldType = 'radio';
    }

    // Generate unique field ID
    const fieldId = element.id || `field_${pageIndex}_${index}`;
    const fieldName = this.sanitizeName(element.text) || `field_${pageIndex}_${index}`;

    return {
      id: fieldId,
      type: fieldType as any,
      label: this.generateLabel(element.text),
      name: fieldName,
      placeholder: this.generatePlaceholder(element.text),
      helpText: '',
      required: this.inferRequired(element.text),
      readonly: false,
      hidden: false,
      options: fieldType === 'radio' || fieldType === 'select' ? [] : undefined,
      validationRules: [],
      order: index,
      isPhiField: this.isPHIField(element.text),
      auditRequired: this.isPHIField(element.text),
      customAttributes: {
        pageNumber: pageIndex + 1,
        confidence: element.confidence || 0,
        boundingBox: element.boundingBox,
        ocrText: element.text,
        ocrType: element.type
      }
    };
  }

  // Generate label from text
  private generateLabel(text: string): string {
    // Clean up the text and make it more readable
    return text
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  // Helper methods for field generation
  private inferFieldType(text: string): string {
    const lowerText = text.toLowerCase();
    if (lowerText.includes('email')) return 'email';
    if (lowerText.includes('phone') || lowerText.includes('tel')) return 'phone';
    if (lowerText.includes('date')) return 'date';
    if (lowerText.includes('time')) return 'time';
    if (lowerText.includes('number') || lowerText.includes('#')) return 'number';
    if (lowerText.includes('yes') || lowerText.includes('no')) return 'yes_no';
    if (text.length > 50) return 'textarea';
    return 'text';
  }

  private generateFieldLabel(text: string): string {
    // Clean up the text and make it a proper label
    return text.replace(/[:?]/g, '').trim();
  }

  private sanitizeName(label: string): string {
    return label.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_');
  }

  private generatePlaceholder(label: string): string {
    return `Enter ${label.toLowerCase()}`;
  }

  private inferRequired(text: string): boolean {
    return text.includes('*') || text.toLowerCase().includes('required');
  }

  private isPHIField(text: string): boolean {
    const phiKeywords = ['name', 'dob', 'birth', 'ssn', 'social', 'address', 'phone', 'email', 'medical', 'diagnosis', 'medication'];
    const lowerText = text.toLowerCase();
    return phiKeywords.some(keyword => lowerText.includes(keyword));
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
            fields.push(this.createFieldFromOcrElement(label, 0, fieldIndex++));
          } else {
            // Create field from label alone
            fields.push(this.createFieldFromOcrElement(label, 0, fieldIndex++));
          }
        });

        // Handle remaining inputs without labels
        inputs.filter((input: OcrFormElement) => !fields.some((f: FormField) => f.id === input.id)).forEach((input: OcrFormElement) => {
          fields.push(this.createFieldFromOcrElement(input, 0, fieldIndex++));
        });
      } else {
        // Single element in row
        groupElements.forEach((element: OcrFormElement) => {
          fields.push(this.createFieldFromOcrElement(element, 0, fieldIndex++));
        });
      }
    });
    // Process ungrouped elements
    this.detectedElements.filter((el: OcrFormElement) =>
      !Array.from(this.fieldGroups.values()).flat().includes(el)
    ).forEach((element: OcrFormElement) => {
      fields.push(this.createFieldFromOcrElement(element, 0, fieldIndex++));
    });
  }

  private findClosestElement(reference: OcrFormElement, candidates: OcrFormElement[]): OcrFormElement | null {
    if (!candidates.length) return null;
    
    let closest: OcrFormElement | null = null;
    let minDistance = Infinity;
    
    candidates.forEach(candidate => {
      const distance = Math.sqrt(
        Math.pow(candidate.boundingBox.left - reference.boundingBox.left, 2) +
        Math.pow(candidate.boundingBox.top - reference.boundingBox.top, 2)
      );
      
      if (distance < minDistance) {
        minDistance = distance;
        closest = candidate;
      }
    });
    
    return closest;
  }

  removeField(index: number): void {
    this.generatedFields.splice(index, 1);
  }

  deleteField(fieldToDelete: FormField): void {
    const index = this.generatedFields.findIndex((f: FormField) => f.id === fieldToDelete.id);
    if (index >= 0) {
      this.removeField(index);
    }
  }
  
  removeFieldItem(field: FormField): void {
    this.deleteField(field);
  }
  
  getCurrentPageRawText(): string {
    if (!this.ocrResult || !this.ocrResult.elements) {
      return '';
    }
    
    // Return the text from all elements
    return this.ocrResult.elements
      .map((element: any) => element.text)
      .join(' ');
  }

  private redrawCanvas(): void {
    if (!this.canvas || !this.ctx || !this.currentImage) {
      return;
    }

    const canvas = this.canvas;
    const ctx = this.ctx;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Calculate scale to fit image in canvas
    const scale = Math.min(
      canvas.width / this.currentImage.width,
      canvas.height / this.currentImage.height
    ) * this.zoomLevel;
    
    const scaledWidth = this.currentImage.width * scale;
    const scaledHeight = this.currentImage.height * scale;
    const x = (canvas.width - scaledWidth) / 2;
    const y = (canvas.height - scaledHeight) / 2;
    
    // Update stored transformation values
    this.imageScale = scale;
    this.imageOffsetX = x;
    this.imageOffsetY = y;

    // Draw the image
    ctx.save();
    ctx.drawImage(this.currentImage, x, y, scaledWidth, scaledHeight);
    ctx.restore();

    // Draw OCR elements if available
    if (this.showBoundingBoxes && this.ocrResult) {
      this.drawOcrElements();
    }
  }

  private drawBoundingBox(boundingBox: any, confidence: number): void {
    if (!this.ctx || !this.currentImage) return;

    // Set style based on confidence
    const alpha = Math.min(0.3 + (confidence * 0.5), 0.8);
    this.ctx.strokeStyle = `rgba(0, 123, 255, ${alpha})`;
    this.ctx.lineWidth = 2;

    // Check if coordinates are normalized (0-1 range)
    let left, top, width, height;
    if (boundingBox.normalized || (boundingBox.left <= 1 && boundingBox.top <= 1 && boundingBox.width <= 1 && boundingBox.height <= 1)) {
      // Convert normalized coordinates to pixel coordinates
      const imgWidth = this.currentImage.width || this.currentImage.naturalWidth;
      const imgHeight = this.currentImage.height || this.currentImage.naturalHeight;
      left = boundingBox.left * imgWidth * this.imageScale + this.imageOffsetX;
      top = boundingBox.top * imgHeight * this.imageScale + this.imageOffsetY;
      width = boundingBox.width * imgWidth * this.imageScale;
      height = boundingBox.height * imgHeight * this.imageScale;
    } else {
      // Use pixel coordinates directly with scaling
      left = boundingBox.left * this.imageScale + this.imageOffsetX;
      top = boundingBox.top * this.imageScale + this.imageOffsetY;
      width = boundingBox.width * this.imageScale;
      height = boundingBox.height * this.imageScale;
    }

    // Draw rectangle
    this.ctx.strokeRect(left, top, width, height);
  }

  onRawCanvasWheel(event: WheelEvent): void {
    event.preventDefault();
    // Handle zoom with mouse wheel
    const delta = event.deltaY > 0 ? -0.1 : 0.1;
    this.zoomLevel = Math.max(0.5, Math.min(3, this.zoomLevel + delta));
    // Redraw canvas with new zoom level
    if (this.canvas && this.ctx && this.currentImage) {
      this.redrawCanvas();
    }
  }

  editField(field: FormField, index?: number): void {
    // Store the field being edited
    const idx = (typeof index === 'number') ? index : this.generatedFields.findIndex((f: FormField) => f.id === field.id);
    this.editingFieldIndex = idx >= 0 ? idx : null;

    // Populate the edit form with current field values, ensuring no null values
    this.fieldEditForm.patchValue({
      label: field.label || '',
      name: field.name || '',
      type: field.type || 'text',
      required: field.required === true,  // Ensure boolean
      placeholder: field.placeholder || '',
      helpText: field.helpText || '',
      isPhiField: field.isPhiField === true,  // Ensure boolean
      auditRequired: field.auditRequired === true  // Ensure boolean
    });
    // Show the edit panel if it exists
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
    if (this.ctx) {
      this.redrawCanvas();
    }
  }

  toggleConfidenceScores(): void {
    this.showConfidenceScores = !this.showConfidenceScores;
    if (this.ctx) {
      this.redrawCanvas();
    }
  }

  // Initialize canvas and set up context
  private initializeCanvas(): void {
    if (!this.imageCanvas || !this.imageCanvas.nativeElement) return;
    
    const canvas = this.imageCanvas.nativeElement;
    const container = canvas.parentElement;
    
    if (!container) return;
    
    // Set canvas size to match container
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    
    // Get 2D context
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    
    if (!this.ctx) {
      console.error('Failed to get canvas context');
      return;
    }
    
    // Set default styles
    this.ctx.strokeStyle = '#007bff';
    this.ctx.lineWidth = 2;
    
    console.log('Canvas initialized:', canvas.width, 'x', canvas.height);
  }
  
  loadCurrentPageToCanvas(): void {
    if (!this.imageCanvas || !this.imageCanvas.nativeElement) {
      console.warn('Canvas not available');
      return;
    }

    const canvas = this.imageCanvas.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.error('Could not get canvas context');
      return;
    }

    // Initialize canvas if not already done
    if (!this.ctx) {
      this.initializeCanvas();
    }

    // Clear entire canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Save context state
    ctx.save();
    
    // Apply transformations for pan and zoom
    ctx.translate(this.panOffset.x, this.panOffset.y);
    ctx.scale(this.zoomLevel, this.zoomLevel);
    
    // Determine which URL to use (prioritize imagePreviewUrl for multi-page)
    const imageUrl = this.imagePreviewUrl || this.documentPreviewUrl;
    
    console.log('Loading image from URL:', imageUrl);
    console.log('Document type:', this.selectedFile?.type);
    
    if (imageUrl) {
      const img = new Image();
      
      img.onload = () => {
        // Clear canvas in transformed space
        ctx.clearRect(-this.panOffset.x / this.zoomLevel, -this.panOffset.y / this.zoomLevel, 
                      canvas.width / this.zoomLevel, canvas.height / this.zoomLevel);
        
        // Calculate scaling to fit image in canvas
        const scale = Math.min(
          canvas.width / img.width,
          canvas.height / img.height
        ) * 0.8; // 80% to leave margin
        
        const scaledWidth = img.width * scale;
        const scaledHeight = img.height * scale;
        
        // Center the image
        const x = (canvas.width - scaledWidth) / 2 / this.zoomLevel;
        const y = (canvas.height - scaledHeight) / 2 / this.zoomLevel;
        
        // Draw the image
        ctx.drawImage(img, x, y, scaledWidth, scaledHeight);
        
        // Store image dimensions for later use
        this.imageScale = scale;
        this.imageOffsetX = x * this.zoomLevel;
        this.imageOffsetY = y * this.zoomLevel;
        
        // Draw OCR bounding boxes if available
        if (this.detectedElements && this.detectedElements.length > 0) {
          console.log('Drawing', this.detectedElements.length, 'bounding boxes');
          this.drawBoundingBoxesForElements(ctx, this.detectedElements, img.width, img.height, scale, x, y);
        } else if (this.ocrResult && this.ocrResult.elements && this.ocrResult.elements.length > 0) {
          console.log('Drawing', this.ocrResult.elements.length, 'OCR result boxes');
          this.drawBoundingBoxesForElements(ctx, this.ocrResult.elements, img.width, img.height, scale, x, y);
        }
        
        // Restore context
        ctx.restore();
        console.log('Image loaded and rendered successfully');
      };
      
      img.onerror = (error) => {
        console.error('Failed to load image:', error);
        ctx.restore();
        
        // Show error message on canvas
        ctx.fillStyle = '#ffebee';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#c62828';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Failed to load document preview', canvas.width / 2, canvas.height / 2 - 20);
        ctx.fillText('Note: PDF preview requires PDF.js library', canvas.width / 2, canvas.height / 2 + 10);
      };
      
      // Load the image
      img.src = imageUrl;
    } else {
      // No image available, show placeholder
      ctx.fillStyle = '#f5f5f5';
      ctx.fillRect(-this.panOffset.x / this.zoomLevel, -this.panOffset.y / this.zoomLevel, 
                   canvas.width / this.zoomLevel, canvas.height / this.zoomLevel);
      ctx.fillStyle = '#666';
      ctx.font = '16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('No document preview available', 
                   canvas.width / 2 / this.zoomLevel, 
                   canvas.height / 2 / this.zoomLevel);
      
      ctx.restore();
    }
  }
  
  private drawBoundingBoxesForElements(ctx: CanvasRenderingContext2D, elements: any[], imgWidth: number, imgHeight: number, scale: number, offsetX: number, offsetY: number): void {
    if (!elements || elements.length === 0) return;
    
    elements.forEach((element: any) => {
      if (element.boundingBox) {
        const box = element.boundingBox;
        
        // Bounding box coordinates are normalized (0-1)
        // Convert to actual pixel coordinates based on image dimensions
        const x = box.left * imgWidth * scale + offsetX;
        const y = box.top * imgHeight * scale + offsetY;
        const width = box.width * imgWidth * scale;
        const height = box.height * imgHeight * scale;
        
        // Draw bounding box with color based on confidence
        const confidence = element.confidence || 0;
        const color = confidence > 90 ? 'rgba(0, 200, 0, 0.6)' : 
                     confidence > 70 ? 'rgba(255, 165, 0, 0.6)' : 
                     'rgba(255, 0, 0, 0.6)';
        
        ctx.strokeStyle = color;
        ctx.lineWidth = 2 / this.zoomLevel;
        ctx.strokeRect(x, y, width, height);
        
        // Fill with semi-transparent color
        ctx.fillStyle = color.replace('0.6', '0.15');
        ctx.fillRect(x, y, width, height);
        
        // Draw label with text and confidence
        if (element.text || element.confidence) {
          // Background for text
          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          const label = element.text ? 
            `${element.text.substring(0, 30)}${element.text.length > 30 ? '...' : ''} (${Math.round(confidence)}%)` :
            `${Math.round(confidence)}%`;
          
          const fontSize = 12 / this.zoomLevel;
          ctx.font = `${fontSize}px Arial`;
          const metrics = ctx.measureText(label);
          const padding = 4 / this.zoomLevel;
          const labelWidth = metrics.width + padding * 2;
          const labelHeight = fontSize + padding * 2;
          let labelX = x;
          let labelY = y - labelHeight - 2 / this.zoomLevel;
          if (labelY < offsetY) {
            labelY = y + 2 / this.zoomLevel;
          }
          // Draw background box
          ctx.fillRect(labelX, labelY, labelWidth, labelHeight);
          // Draw text
          ctx.fillStyle = '#000';
          ctx.textBaseline = 'top';
          ctx.fillText(label, labelX + padding, labelY + padding);
        }
      }
    });
  }

  private drawOcrElements(): void {
    if (!this.ctx || !this.ocrResult || !this.ocrResult.elements || !this.currentImage) return;
    
    const ctx = this.ctx;
    ctx.save();

    // Use image dimensions with stored scale/offsets to align boxes correctly
    const imgWidth = this.currentImage.width || (this.currentImage as any).naturalWidth;
    const imgHeight = this.currentImage.height || (this.currentImage as any).naturalHeight;

    if (this.showBoundingBoxes) {
      this.drawBoundingBoxesForElements(
        ctx,
        this.ocrResult.elements,
        imgWidth,
        imgHeight,
        this.imageScale,
        this.imageOffsetX,
        this.imageOffsetY
      );
    }
    
    ctx.restore();
  }

  // Draw the canvas with image and OCR elements
  private drawCanvas(): void {
    if (!this.ctx || !this.currentImage) return;

    const canvas = this.imageCanvas.nativeElement;
    const canvasContext = this.ctx;

    // Clear canvas
    canvasContext.clearRect(0, 0, canvas.width, canvas.height);

    // Save context state
    canvasContext.save();

    // Apply zoom transformation
    canvasContext.scale(this.zoomLevel, this.zoomLevel);

    // Draw the image
    canvasContext.drawImage(this.currentImage, 0, 0);

    // Draw OCR elements if available
    if (this.showBoundingBoxes && this.ocrResult) {
      this.drawOcrElements();
    }

    // Restore context state
    canvasContext.restore();
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
    this.viewMode = 'fields';
  }

  switchToReviewView(): void {
    this.viewMode = 'review';
    setTimeout(() => {
      if (this.imageCanvas?.nativeElement) {
        this.initializeCanvas();
        this.loadCurrentPageToCanvas();
      }
    }, 100);
  }

  // Navigate to a specific page in multi-page documents
  navigateToPage(pageIndex: number): void {
    if (pageIndex < 0 || pageIndex >= this.totalPages) return;

    this.currentPageIndex = pageIndex;
    this.imagePreviewUrl = this.imagePreviewUrls[pageIndex];

    // Reload canvas with new page
    if (this.viewMode === 'review' && this.imageCanvas?.nativeElement) {
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

  // Tab switching method
  switchTab(tab: 'template' | 'raw'): void {
    this.activeTab = tab;
  }

  // Canvas click handler
  onCanvasClick(event: MouseEvent): void {
    if (!this.imageCanvas || !this.ctx) return;
    
    const canvas = this.imageCanvas.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    // Handle click on OCR elements if needed
    if (this.ocrResult && this.ocrResult.elements) {
      // Check if click is on any bounding box
      this.ocrResult.elements.forEach((element: any) => {
        if (element.boundingBox) {
          const box = element.boundingBox;
          if (x >= box.left && x <= box.left + box.width &&
              y >= box.top && y <= box.top + box.height) {
            // Handle element selection
            console.log('Clicked on OCR element:', element);
          }
        }
      });
    }
  }

  // Navigation methods
  previousPage(): void {
    if (this.currentPageIndex > 0) {
      this.currentPageIndex--;
      this.loadCurrentPageToCanvas();
    }
  }

  nextPage(): void {
    if (this.currentPageIndex < this.totalPages - 1) {
      this.currentPageIndex++;
      this.loadCurrentPageToCanvas();
    }
  }

  // Raw view zoom methods
  zoomOutRaw(): void {
    this.zoomLevel = Math.max(0.25, this.zoomLevel - 0.25);
    this.redrawCanvas();
  }

  zoomInRaw(): void {
    this.zoomLevel = Math.min(3, this.zoomLevel + 0.25);
    this.redrawCanvas();
  }

  resetRawView(): void {
    this.zoomLevel = 1;
    this.redrawCanvas();
  }

  fitToScreenRaw(): void {
    if (!this.currentImage || !this.imageCanvas) return;
    
    const canvas = this.imageCanvas.nativeElement;
    const scaleX = canvas.width / this.currentImage.width;
    const scaleY = canvas.height / this.currentImage.height;
    this.zoomLevel = Math.min(scaleX, scaleY);
    this.redrawCanvas();
  }

  // Update raw canvas
  updateRawCanvas(): void {
    this.redrawCanvas();
  }

  // Raw canvas mouse event handlers
  onRawCanvasMouseDown(event: MouseEvent): void {
    if (!this.imageCanvas) return;
    
    const canvas = this.imageCanvas.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    // Start drawing or selection
    this.isDrawing = true;
    this.drawStartX = x;
    this.drawStartY = y;
  }

  onRawCanvasMouseMove(event: MouseEvent): void {
    if (!this.isDrawing || !this.imageCanvas || !this.ctx) return;
    
    const canvas = this.imageCanvas.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    // Redraw canvas and show selection rectangle
    this.redrawCanvas();
    
    // Draw selection rectangle
    this.ctx.strokeStyle = 'rgba(33, 150, 243, 0.5)';
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([5, 5]);
    this.ctx.strokeRect(
      this.drawStartX,
      this.drawStartY,
      x - this.drawStartX,
      y - this.drawStartY
    );
    this.ctx.setLineDash([]);
  }

  onRawCanvasMouseUp(event: MouseEvent): void {
    if (!this.isDrawing || !this.imageCanvas) return;
    
    const canvas = this.imageCanvas.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    // End drawing
    this.isDrawing = false;
    
    // Create bounding box from selection
    if (Math.abs(x - this.drawStartX) > 10 && Math.abs(y - this.drawStartY) > 10) {
      const boundingBox = {
        left: Math.min(this.drawStartX, x),
        top: Math.min(this.drawStartY, y),
        width: Math.abs(x - this.drawStartX),
        height: Math.abs(y - this.drawStartY)
      };
      
      // Add to detected elements
      console.log('Created bounding box:', boundingBox);
    }
    
    this.redrawCanvas();
  }

  // Field drop handler
  onFieldDrop(event: CdkDragDrop<any>): void {
    if (event.previousContainer === event.container) {
      // Reorder within the same container
      moveItemInArray(this.generatedFields, event.previousIndex, event.currentIndex);
    }
  }
}
