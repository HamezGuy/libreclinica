const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// Test the OCR endpoint with a sample base64 image
async function testOCR() {
  // Create a simple test document (base64 encoded text image)
  // This is a minimal test - in production you'd use a real document
  const testDocument = {
    document: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    documentType: 'PNG'
  };

  try {
    console.log('Testing OCR endpoint...');
    const response = await fetch('http://localhost:3001/api/textract/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testDocument)
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Error response:', error);
      return;
    }

    const result = await response.json();
    console.log('OCR Response received:');
    console.log('- Elements found:', result.elements?.length || 0);
    console.log('- Tables found:', result.tables?.length || 0);
    console.log('- Success:', result.success);
    
    if (result.error) {
      console.log('- Error:', result.error);
    }
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testOCR();
