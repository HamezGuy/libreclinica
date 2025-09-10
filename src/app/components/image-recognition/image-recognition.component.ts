import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { MatDialogRef } from '@angular/material/dialog';
import { ImageRecognitionService } from './image-recognition.service';

@Component({
  selector: 'app-image-recognition',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  providers: [ImageRecognitionService],
  templateUrl: './image-recognition.component.html',
  styleUrls: ['./image-recognition.component.css']
})
export class ImageRecognitionComponent implements OnInit {
  @ViewChild('fileInput') fileInput!: ElementRef;
  
  selectedFile: File | null = null;
  imagePreview: string | null = null;
  results: any = null;
  loading = false;
  error: string | null = null;
  apiStatus = 'checking';
  dragActive = false;

  constructor(
    private imageService: ImageRecognitionService,
    private dialogRef: MatDialogRef<ImageRecognitionComponent>
  ) { }

  ngOnInit(): void {
    this.checkAPIStatus();
  }

  async checkAPIStatus(): Promise<void> {
    try {
      const health = await this.imageService.checkHealth().toPromise();
      if (health.status === 'healthy') {
        this.apiStatus = 'online';
      } else {
        this.apiStatus = 'offline';
      }
    } catch (error) {
      this.apiStatus = 'offline';
    }
  }

  onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      this.processFile(file);
    }
  }

  processFile(file: File): void {
    if (!file.type.startsWith('image/')) {
      this.error = 'Please select an image file';
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      this.error = 'File size must be less than 10MB';
      return;
    }

    this.error = null;
    
    // Create preview and optimize image
    const reader = new FileReader();
    reader.onload = (e: any) => {
      this.imagePreview = e.target.result;
      
      // Optimize image for faster processing
      this.optimizeImage(file).then(optimizedFile => {
        this.selectedFile = optimizedFile;
      }).catch(() => {
        // Fallback to original if optimization fails
        this.selectedFile = file;
      });
    };
    reader.readAsDataURL(file);
  }

  async uploadImage(): Promise<void> {
    if (!this.selectedFile) {
      this.error = 'Please select an image first';
      return;
    }

    this.loading = true;
    this.error = null;
    this.results = null;
    
    const startTime = performance.now();

    try {
      const response = await this.imageService.processImage(this.selectedFile).toPromise();
      this.results = response;
      
      // Log actual processing time
      const endTime = performance.now();
      console.log(`Total processing time: ${(endTime - startTime).toFixed(0)}ms`);
      console.log(`Server processing time: ${(response.processing_time * 1000).toFixed(0)}ms`);
      console.log(`Network/upload time: ${((endTime - startTime) - (response.processing_time * 1000)).toFixed(0)}ms`);
    } catch (error: any) {
      this.error = error.error?.error || 'Failed to process image';
    } finally {
      this.loading = false;
    }
  }

  reset(): void {
    this.selectedFile = null;
    this.imagePreview = null;
    this.results = null;
    this.error = null;
    if (this.fileInput) {
      this.fileInput.nativeElement.value = '';
    }
  }

  // Drag and Drop handlers
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragActive = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragActive = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragActive = false;

    if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
      const file = event.dataTransfer.files[0];
      this.processFile(file);
    }
  }

  formatConfidence(confidence: number): string {
    return (confidence * 100).toFixed(1) + '%';
  }

  triggerFileInput(): void {
    this.fileInput.nativeElement.click();
  }

  closeDialog(): void {
    this.dialogRef.close();
  }

  getSafeImageUrl(base64Image: string): string {
    if (!base64Image || base64Image.length === 0) {
      return '';
    }
    // Check if it already has the data URL prefix
    if (base64Image.startsWith('data:image')) {
      return base64Image;
    }
    return `data:image/jpeg;base64,${base64Image}`;
  }

  handleImageError(event: any): void {
    console.error('Failed to load annotated image');
    // Hide the broken image
    event.target.style.display = 'none';
  }

  private async optimizeImage(file: File): Promise<File> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();
      
      reader.onload = (e: any) => {
        img.onload = () => {
          // Calculate optimal dimensions (max 1920px width/height)
          const maxDimension = 1920;
          let width = img.width;
          let height = img.height;
          
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = (height / width) * maxDimension;
              width = maxDimension;
            } else {
              width = (width / height) * maxDimension;
              height = maxDimension;
            }
          }
          
          // Create canvas and resize
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            reject('Failed to get canvas context');
            return;
          }
          
          ctx.drawImage(img, 0, 0, width, height);
          
          // Convert to blob with quality optimization
          canvas.toBlob((blob) => {
            if (blob) {
              const optimizedFile = new File([blob], file.name, {
                type: 'image/jpeg',
                lastModified: Date.now()
              });
              
              console.log(`Image optimized: ${(file.size / 1024).toFixed(0)}KB → ${(blob.size / 1024).toFixed(0)}KB`);
              resolve(optimizedFile);
            } else {
              reject('Failed to create blob');
            }
          }, 'image/jpeg', 0.85); // 85% quality for good balance
        };
        
        img.onerror = () => reject('Failed to load image');
        img.src = e.target.result;
      };
      
      reader.onerror = () => reject('Failed to read file');
      reader.readAsDataURL(file);
    });
  }
}
