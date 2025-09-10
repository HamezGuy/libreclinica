import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ImageRecognitionService {
  private apiUrl = 'https://ai-image-recognition-api-415455874994.us-central1.run.app';

  constructor(private http: HttpClient) { }

  checkHealth(): Observable<any> {
    return this.http.get(`${this.apiUrl}/api/health`);
  }

  getSystemInfo(): Observable<any> {
    return this.http.get(`${this.apiUrl}/api/info`);
  }

  processImage(file: File, drawAnnotations: boolean = true): Observable<any> {
    const formData = new FormData();
    formData.append('image', file);
    formData.append('draw_annotations', drawAnnotations.toString());

    return this.http.post(`${this.apiUrl}/api/process`, formData);
  }

  processBatch(files: File[]): Observable<any> {
    const formData = new FormData();
    files.forEach(file => {
      formData.append('images', file);
    });

    return this.http.post(`${this.apiUrl}/api/batch`, formData);
  }
}
