import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

export interface AwsConfig {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  textract: {
    endpoint: string;
    confidenceThreshold: number;
  };
}

@Injectable({
  providedIn: 'root'
})
export class AwsConfigService {
  private config: AwsConfig | null = null;

  constructor(private http: HttpClient) {}

  /**
   * For development: Load AWS credentials from a local config file
   * For production: This should call a secure backend endpoint
   */
  loadConfig(): Observable<AwsConfig> {
    if (this.config) {
      return of(this.config);
    }

    // For development only - reading from a local config file
    // In production, this should be a secure backend endpoint
    return this.http.get<AwsConfig>('/assets/aws-config.json').pipe(
      map(config => {
        this.config = config;
        return config;
      }),
      catchError(() => {
        // Fallback config for development
        const fallbackConfig: AwsConfig = {
          accessKeyId: '',
          secretAccessKey: '',
          region: 'us-east-1',
          textract: {
            endpoint: 'https://textract.us-east-1.amazonaws.com',
            confidenceThreshold: 80
          }
        };
        this.config = fallbackConfig;
        return of(fallbackConfig);
      })
    );
  }

  getConfig(): AwsConfig | null {
    return this.config;
  }
}
