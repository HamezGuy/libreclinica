import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ImageRecognitionComponent } from './image-recognition.component';
import { ImageRecognitionService } from './image-recognition.service';

@NgModule({
  declarations: [
    ImageRecognitionComponent
  ],
  imports: [
    CommonModule,
    HttpClientModule,
    FormsModule
  ],
  providers: [
    ImageRecognitionService
  ],
  exports: [
    ImageRecognitionComponent
  ]
})
export class ImageRecognitionModule { }
