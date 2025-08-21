const axios = require('axios');

// Test the OCR proxy endpoint that forwards to Firebase Function
async function testOCRProxy() {
  // Create a test request with base64 data
  const testRequest = {
    base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    config: {
      confidenceThreshold: 80,
      extractTables: true,
      extractForms: true
    }
  };

  try {
    console.log('Testing OCR proxy endpoint...');
    console.log('Endpoint: http://localhost:3001/api/textract');
    
    const response = await axios.post('http://localhost:3001/api/textract', testRequest, {
      headers: {
        'Content-Type': 'application/json',
      },
      validateStatus: () => true // Don't throw on non-2xx status
    });

    console.log('Response status:', response.status);

    const result = response.data;
    
    if (response.status >= 400) {
      console.error('Error response:', result);
      return;
    }

    console.log('\nOCR Proxy Response:');
    console.log('- Success:', !!result.data || !!result.elements);
    console.log('- Elements found:', result.data?.elements?.length || result.elements?.length || 0);
    console.log('- Tables found:', result.data?.tables?.length || result.tables?.length || 0);
    
    if (result.error) {
      console.log('- Error:', result.error);
    }
    
    if (result.data?.metadata || result.metadata) {
      console.log('- Metadata:', result.data?.metadata || result.metadata);
    }
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testOCRProxy();
