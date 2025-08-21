# Textract OCR Backend Server

This Node.js/Express server provides a secure proxy for Amazon Textract OCR services, handling document processing for the Electronic Data Capture system.

## Setup

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Configure AWS Credentials
Copy `.env.example` to `.env` and add your AWS credentials:
```bash
cp .env.example .env
```

Edit `.env` with your AWS credentials:
```
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_key_here
AWS_REGION=us-east-1
PORT=3001
```

### 3. Start the Server
```bash
npm start
```

The server will run on `http://localhost:3001`

## API Endpoints

### POST /api/textract/analyze
Analyzes a document using Amazon Textract.

**Request Body:**
```json
{
  "document": "base64_encoded_document_or_data_url",
  "documentType": "PNG|JPEG|PDF"
}
```

**Response:**
```json
{
  "success": true,
  "elements": [...],
  "tables": [...],
  "metadata": {
    "pageCount": 1,
    "processingTime": 1234
  }
}
```

## Features

- **CORS Support**: Configured for Angular app on localhost:4200
- **File Upload**: Supports both base64 and multipart file uploads
- **AWS Textract Integration**: Extracts text, forms, and tables
- **Error Handling**: Comprehensive error responses
- **Security**: AWS credentials kept server-side only

## Testing

Run the test script to verify the OCR endpoint:
```bash
node test-ocr.js
```

## Troubleshooting

1. **AWS Credentials Error**: Ensure your `.env` file has valid AWS credentials
2. **CORS Issues**: Check that the Angular app is running on port 4200
3. **Port Conflicts**: Change the PORT in `.env` if 3001 is already in use
4. **AWS Region**: Ensure Textract is available in your configured region

## Security Notes

- Never commit `.env` file to version control
- Keep AWS credentials secure and rotate regularly
- Use IAM roles with minimal required permissions
- Consider implementing rate limiting for production use
