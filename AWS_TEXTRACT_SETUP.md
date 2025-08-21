# AWS Textract OCR Setup Guide

## Overview
This guide explains how to configure AWS Textract for OCR functionality in the Electronic Data Capture application. The system uses a secure backend proxy architecture to handle AWS credentials.

## Architecture
- **Frontend**: Angular application sends documents to backend for processing
- **Backend Proxy**: Express.js server handles AWS authentication and Textract API calls
- **Security**: AWS credentials are stored only on the backend, never exposed to frontend

## Setup Instructions

### 1. AWS Account Configuration

#### Create IAM User for Textract
1. Log into AWS Console
2. Navigate to IAM → Users → Add User
3. User name: `edc-textract-user`
4. Select "Programmatic access"
5. Attach policy: `AmazonTextractFullAccess`
6. Save the Access Key ID and Secret Access Key

#### Alternative: Use Existing IAM User
Ensure the user has the following permissions:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "textract:AnalyzeDocument",
        "textract:DetectDocumentText",
        "textract:GetDocumentAnalysis",
        "textract:StartDocumentAnalysis"
      ],
      "Resource": "*"
    }
  ]
}
```

### 2. Backend Configuration

#### Configure Environment Variables
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Edit the `.env` file with your AWS credentials:
   ```env
   # AWS Configuration
   AWS_ACCESS_KEY_ID=your_actual_access_key_here
   AWS_SECRET_ACCESS_KEY=your_actual_secret_key_here
   AWS_REGION=us-east-1

   # Server Configuration
   PORT=3001
   ```

   **Important**: 
   - Replace placeholder values with your actual AWS credentials
   - Never commit the `.env` file to version control
   - The `.env` file is already in `.gitignore`

#### Start the Backend Server
```bash
cd backend
npm install
npm start
```

The server will start on `http://localhost:3001`

### 3. Frontend Configuration

The frontend is already configured to use the backend proxy. No additional setup needed.

Environment configuration (`src/environments/environment.ts`):
- Development: Uses `http://localhost:3001/api/textract`
- Production: Uses relative path `/api/textract`

### 4. Testing the Integration

#### Start Both Servers
1. Terminal 1 - Backend:
   ```bash
   cd backend
   npm start
   ```

2. Terminal 2 - Frontend:
   ```bash
   ng serve
   ```

#### Test OCR Functionality
1. Navigate to the application
2. Go to Form Builder or OCR Template Builder
3. Upload a document (PDF, PNG, JPG, etc.)
4. The system will:
   - Convert the document to base64
   - Send to backend proxy
   - Backend authenticates with AWS using env variables
   - Textract processes the document
   - Results returned to frontend

### 5. Troubleshooting

#### Common Issues

**Backend server not starting:**
- Check if port 3001 is available
- Verify `.env` file exists in backend directory
- Check npm dependencies are installed

**AWS Authentication Errors:**
- Verify AWS credentials in `.env` are correct
- Check IAM user has Textract permissions
- Ensure AWS region is correct (default: us-east-1)

**CORS Errors:**
- Backend is configured for localhost:4200 (Angular default)
- If using different port, update CORS in `backend/server.js`

**OCR Not Processing:**
- Check browser console for errors
- Verify backend server is running
- Check network tab for API calls to `/api/textract/analyze`

### 6. Production Deployment

For production deployment:

1. **Environment Variables**: Set AWS credentials as environment variables on your hosting platform
2. **API Endpoint**: Frontend will automatically use relative paths in production
3. **Security**: Ensure HTTPS is enabled for production deployments
4. **CORS**: Update allowed origins in backend for your production domain

### 7. Security Best Practices

- ✅ AWS credentials stored only on backend
- ✅ Backend proxy validates and sanitizes input
- ✅ Environment variables for sensitive data
- ✅ CORS configured for specific origins
- ✅ No AWS SDK in frontend code
- ✅ Rate limiting can be added to backend

### 8. API Endpoint Details

**Endpoint**: `POST /api/textract/analyze`

**Request Body**:
```json
{
  "base64": "base64_encoded_document",
  "config": {
    "confidenceThreshold": 80,
    "extractTables": true,
    "extractForms": true
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "elements": [...],
    "tables": [...],
    "metadata": {...}
  }
}
```

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review backend logs for detailed error messages
3. Ensure AWS Textract service is available in your region
