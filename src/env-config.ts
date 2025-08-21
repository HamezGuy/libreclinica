// This file loads environment variables from .env file
// Note: This is for development only. In production, use proper environment variables

declare global {
  interface Window {
    env: any;
  }
}

// For development, we'll use a different approach since Angular doesn't support process.env
// The actual environment variables will be injected at build time or runtime
export const loadEnvConfig = () => {
  // In a real implementation, you would:
  // 1. Use a build tool like webpack to inject env vars at build time
  // 2. Or load them from a config endpoint at runtime
  // 3. Or use Angular's environment files with proper build configurations
  
  // For now, return empty config that will be overridden by environment.ts
  return {
    AWS_ACCESS_KEY_ID: '',
    AWS_SECRET_ACCESS_KEY: '',
    AWS_REGION: 'us-east-1',
    TEXTRACT_ENDPOINT: 'https://textract.us-east-1.amazonaws.com',
    TEXTRACT_CONFIDENCE_THRESHOLD: '80',
    AWS_S3_BUCKET_NAME: '',
    AWS_S3_REGION: 'us-east-1'
  };
};
