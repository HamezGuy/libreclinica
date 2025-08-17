# Amazon Textract OCR Setup Guide

This guide will help you set up Amazon Textract OCR for the Electronic Data Capture (EDC) system.

## Prerequisites

1. **AWS Account**: You need an active AWS account
2. **IAM User**: Create an IAM user with Textract permissions
3. **Access Keys**: Generate AWS Access Key ID and Secret Access Key

## Step 1: Create AWS IAM User

1. Log in to AWS Console
2. Go to IAM (Identity and Access Management)
3. Click "Users" → "Add users"
4. Create a user with programmatic access
5. Attach the following policies:
   - `AmazonTextractFullAccess`
   - `AmazonS3ReadOnlyAccess` (if using S3 for document storage)

## Step 2: Configure Environment Variables

Update the `.env` file in your project root with your AWS credentials:

```bash
# Amazon Textract Configuration
AWS_ACCESS_KEY_ID=your_actual_access_key_here
AWS_SECRET_ACCESS_KEY=your_actual_secret_key_here
AWS_REGION=us-east-1

# Amazon Textract Specific Settings
TEXTRACT_ENDPOINT=https://textract.us-east-1.amazonaws.com
TEXTRACT_CONFIDENCE_THRESHOLD=80

# Optional: S3 Bucket for document storage
AWS_S3_BUCKET_NAME=your-s3-bucket-name
AWS_S3_REGION=us-east-1
```

## Step 3: Security Best Practices

### For Development:
- Keep `.env` file local only (it's already in `.gitignore`)
- Never commit AWS credentials to version control

### For Production:
1. **Use Environment Variables**: Set AWS credentials as environment variables on your server
2. **Use IAM Roles**: If deploying to AWS, use IAM roles instead of access keys
3. **Implement Backend Proxy**: Create a backend service to handle Textract calls to protect credentials

## Step 4: Backend Proxy Implementation (Recommended)

Since the Angular app runs in the browser, it's not secure to include AWS credentials in the frontend. Create a Firebase Cloud Function to proxy Textract requests:

```typescript
// functions/src/ocr-proxy.ts
import * as functions from 'firebase-functions';
import * as AWS from 'aws-sdk';

const textract = new AWS.Textract({
  region: functions.config().aws.region,
  accessKeyId: functions.config().aws.access_key_id,
  secretAccessKey: functions.config().aws.secret_access_key
});

export const processDocument = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { documentBase64 } = data;
  
  const params = {
    Document: {
      Bytes: Buffer.from(documentBase64, 'base64')
    },
    FeatureTypes: ['FORMS', 'TABLES']
  };

  try {
    const result = await textract.analyzeDocument(params).promise();
    return result;
  } catch (error) {
    throw new functions.https.HttpsError('internal', 'Failed to process document');
  }
});
```

## Step 5: Deploy Firebase Function

1. Set Firebase config:
```bash
firebase functions:config:set aws.access_key_id="YOUR_KEY" aws.secret_access_key="YOUR_SECRET" aws.region="us-east-1"
```

2. Deploy the function:
```bash
firebase deploy --only functions:processDocument
```

## Step 6: Update Angular Service

Update the Textract service to use the Firebase function instead of direct AWS calls:

```typescript
// src/app/services/ocr/textract-ocr.service.ts
import { Functions, httpsCallable } from '@angular/fire/functions';

private async callTextractAPI(base64Document: string): Promise<any> {
  const processDocument = httpsCallable(this.functions, 'processDocument');
  const result = await processDocument({ documentBase64: base64Document });
  return result.data;
}
```

## Step 7: Test the Integration

1. Start the development server:
```bash
npm start
```

2. Navigate to the dashboard and click "OCR Template"
3. Upload a scanned form document
4. Verify that Textract processes the document and extracts form fields

## Troubleshooting

### Common Issues:

1. **CORS Errors**: Ensure Firebase functions have proper CORS configuration
2. **Authentication Errors**: Verify IAM user has correct permissions
3. **Region Mismatch**: Ensure AWS region is consistent across configuration
4. **File Size Limits**: Textract has a 5MB limit for synchronous processing

### Debug Mode:

Enable debug logging in the Textract service:
```typescript
// Set in environment.ts
aws: {
  debug: true
}
```

## Cost Considerations

Amazon Textract pricing:
- First 1,000 pages/month: Free
- Additional pages: $0.015 per page for form extraction
- Tables extraction: Additional $0.015 per page

Monitor usage in AWS Cost Explorer to avoid unexpected charges.

## Next Steps

1. Implement error handling for failed OCR processing
2. Add progress indicators for long-running OCR operations
3. Cache OCR results to reduce API calls
4. Implement batch processing for multiple documents

## Support

For issues or questions:
- Check AWS Textract documentation: https://docs.aws.amazon.com/textract/
- Review Firebase Functions logs: `firebase functions:log`
- Check browser console for client-side errors
