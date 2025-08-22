const functions = require('firebase-functions/v1');
const { TextractClient, AnalyzeDocumentCommand } = require('@aws-sdk/client-textract');
const cors = require('cors');

// Initialize CORS with allowed origins
const corsHandler = cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:4200',
      'http://localhost:4201',
      'http://localhost:4202',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5000',
      'http://localhost:5001',
      'http://localhost:8080',
      'http://localhost:8081',
      'http://127.0.0.1:4200',
      'http://127.0.0.1:4201',
      'http://127.0.0.1:4202',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5000',
      'http://127.0.0.1:8080',
      'https://www.accuratrials.com',
      'https://accuratrials.com',
      'https://electronic-data-capture-project.vercel.app',
      'https://electronic-data-capture-project-*.vercel.app',
      'https://data-entry-project-465905.firebaseapp.com',
      'https://data-entry-project-465905.web.app',
      'https://edc-project-j9m0xtl1m-james-guis-projects.vercel.app',
      'https://edc-project-*.vercel.app'
    ];
    
    // Allow any localhost or 127.0.0.1 origin in development
    if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
      return callback(null, true);
    }
    
    // Check against allowed origins list
    if (allowedOrigins.includes(origin) || 
        allowedOrigins.some(allowed => {
          if (allowed.includes('*')) {
            const pattern = allowed.replace('*', '.*');
            return new RegExp(pattern).test(origin);
          }
          return false;
        })) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400 // Cache preflight response for 24 hours
});

exports.analyzeDocument = functions.runWith({
  timeoutSeconds: 120,
  memory: '1GB'
}).https.onRequest((req, res) => {
  // Handle CORS
  corsHandler(req, res, async () => {
    // Configure AWS Textract client (v3) - moved inside function to access config
    const textractClient = new TextractClient({
      region: functions.config().aws?.region || process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: functions.config().aws?.access_key_id || process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: functions.config().aws?.secret_access_key || process.env.AWS_SECRET_ACCESS_KEY
      }
    });
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    try {
      console.log('Received OCR request from origin:', req.headers.origin || 'no origin');
      console.log('Request method:', req.method);
      console.log('Request headers:', JSON.stringify(req.headers));
      
      const requestData = req.body;
      
      if (!requestData.base64) {
        res.status(400).json({ error: 'No document provided' });
        return;
      }

      // Convert base64 to buffer
      let base64Data = requestData.base64.replace(/^data:.*,/, '');
      const documentBytes = Buffer.from(base64Data, 'base64');
      
      // Check document size (Textract sync API supports up to 5MB)
      const maxSizeBytes = 5 * 1024 * 1024; // 5MB
      if (documentBytes.length > maxSizeBytes) {
        throw new Error(`Document size (${Math.round(documentBytes.length / 1024 / 1024)}MB) exceeds maximum allowed size of 5MB for direct processing`);
      }
      
      // Check if document is PDF (PDFs start with %PDF which is JVBERi in base64)
      const isPDF = base64Data.startsWith('JVBERi');
      
      console.log(`Processing ${isPDF ? 'PDF' : 'image'} document (${Math.round(documentBytes.length / 1024)}KB)...`);
      
      // Process both PDFs and images directly using synchronous API
      // Textract's analyzeDocument API supports both formats up to 5MB
      const command = new AnalyzeDocumentCommand({
        Document: {
          Bytes: documentBytes
        },
        FeatureTypes: ['FORMS', 'TABLES']
      });
      
      let result;
      try {
        result = await textractClient.send(command);
        console.log(`Textract analysis complete. Found ${result.Blocks?.length || 0} blocks`);
      } catch (textractError) {
        console.error('Textract API error:', textractError);
        
        // Provide helpful error messages
        if (textractError.name === 'InvalidParameterException' && textractError.message?.includes('PDF')) {
          throw new Error('PDF processing failed. The document may be corrupted or use unsupported PDF features.');
        } else if (textractError.name === 'InvalidParameterException') {
          throw new Error('Document format not supported. Please upload a valid PDF or image file (JPEG, PNG).');
        } else if (textractError.name === 'ProvisionedThroughputExceededException') {
          throw new Error('Textract service is currently busy. Please try again in a few moments.');
        } else if (textractError.name === 'BadDocumentException') {
          throw new Error('Document could not be processed. Please ensure the file is not corrupted.');
        } else if (textractError.name === 'AccessDeniedException') {
          throw new Error('AWS credentials lack Textract permissions. Please contact your administrator.');
        }
        throw textractError;
      }
      
      // Process and structure the response
      const processedResult = processTextractResponse(result);
      
      res.json({
        success: true,
        data: processedResult,
        rawData: result
      });
      
    } catch (error) {
      console.error('Textract error:', error);
      
      res.status(500).json({ 
        error: 'Failed to analyze document',
        message: error.message,
        code: error.code || error.name
      });
    }
  });
});

// Process Textract response into structured format
function processTextractResponse(textractResult) {
  const blocks = textractResult.Blocks || [];
  const elements = [];
  const tables = [];
  const keyValuePairs = new Map();
  
  // First pass: collect all blocks by ID for relationship lookup
  const blockMap = new Map();
  blocks.forEach(block => {
    blockMap.set(block.Id, block);
  });
  
  // Second pass: extract key-value pairs
  blocks.forEach(block => {
    if (block.BlockType === 'KEY_VALUE_SET' && block.EntityTypes?.includes('KEY')) {
      const keyText = getTextFromBlock(block, blockMap);
      let valueText = '';
      let valueBoundingBox = null;
      
      if (block.Relationships) {
        const valueRelation = block.Relationships.find(r => r.Type === 'VALUE');
        if (valueRelation && valueRelation.Ids) {
          const valueBlock = blocks.find(b => 
            valueRelation.Ids.includes(b.Id) && b.BlockType === 'KEY_VALUE_SET'
          );
          if (valueBlock) {
            valueText = getTextFromBlock(valueBlock, blockMap);
            valueBoundingBox = valueBlock.Geometry?.BoundingBox;
          }
        }
      }
      
      if (keyText) {
        keyValuePairs.set(keyText, {
          value: valueText,
          keyBoundingBox: block.Geometry?.BoundingBox,
          valueBoundingBox: valueBoundingBox,
          confidence: block.Confidence
        });
      }
    }
  });
  
  // Third pass: extract form elements
  let elementId = 0;
  
  // Add key-value pairs as form elements
  keyValuePairs.forEach((data, key) => {
    // Add label element
    elements.push({
      id: `element-${elementId++}`,
      type: 'label',
      text: key,
      confidence: data.confidence || 95,
      boundingBox: convertBoundingBox(data.keyBoundingBox),
      relatedElements: data.value ? [`element-${elementId}`] : []
    });
    
    // Add input element if there's a value
    if (data.value) {
      elements.push({
        id: `element-${elementId++}`,
        type: 'input',
        text: data.value,
        confidence: data.confidence || 95,
        boundingBox: convertBoundingBox(data.valueBoundingBox),
        relatedElements: [`element-${elementId - 2}`]
      });
    }
  });
  
  // Add selection elements (checkboxes, radio buttons)
  blocks.forEach(block => {
    if (block.BlockType === 'SELECTION_ELEMENT') {
      elements.push({
        id: `element-${elementId++}`,
        type: block.SelectionStatus === 'SELECTED' ? 'checkbox' : 'checkbox',
        text: block.SelectionStatus === 'SELECTED' ? '☑' : '☐',
        confidence: block.Confidence || 95,
        boundingBox: convertBoundingBox(block.Geometry?.BoundingBox),
        value: block.SelectionStatus === 'SELECTED' ? 'checked' : 'unchecked'
      });
    }
  });
  
  // Extract tables
  blocks.forEach(block => {
    if (block.BlockType === 'TABLE') {
      const table = extractTable(block, blockMap);
      if (table) {
        tables.push(table);
      }
    }
  });
  
  // Add regular text blocks
  blocks.forEach(block => {
    if (block.BlockType === 'LINE' && !isPartOfKeyValue(block, blocks)) {
      elements.push({
        id: `element-${elementId++}`,
        type: 'text',
        text: block.Text || '',
        confidence: block.Confidence || 95,
        boundingBox: convertBoundingBox(block.Geometry?.BoundingBox)
      });
    }
  });
  
  return {
    elements: elements,
    tables: tables,
    metadata: {
      pageCount: 1,
      processingTime: Date.now(),
      provider: 'Amazon Textract',
      documentType: 'form',
      confidence: calculateAverageConfidence(elements)
    }
  };
}

// Helper function to get text from a block
function getTextFromBlock(block, blockMap) {
  let text = '';
  
  if (block.Text) {
    return block.Text;
  }
  
  if (block.Relationships) {
    const childRelation = block.Relationships.find(r => r.Type === 'CHILD');
    if (childRelation && childRelation.Ids) {
      const childTexts = [];
      childRelation.Ids.forEach(childId => {
        const childBlock = blockMap.get(childId);
        if (childBlock && (childBlock.BlockType === 'WORD' || childBlock.BlockType === 'LINE')) {
          childTexts.push(childBlock.Text || '');
        }
      });
      text = childTexts.join(' ');
    }
  }
  
  return text.trim();
}

// Helper function to convert AWS bounding box to our format
function convertBoundingBox(awsBoundingBox) {
  if (!awsBoundingBox) {
    return null;
  }
  
  // Keep coordinates normalized (0-1 range) for frontend to display correctly
  return {
    left: awsBoundingBox.Left,
    top: awsBoundingBox.Top,
    width: awsBoundingBox.Width,
    height: awsBoundingBox.Height,
    normalized: true  // Flag to indicate these are normalized coordinates
  };
}

// Check if a block is part of a key-value pair
function isPartOfKeyValue(block, allBlocks) {
  return allBlocks.some(b => 
    b.BlockType === 'KEY_VALUE_SET' && 
    b.Relationships?.some(r => 
      r.Type === 'CHILD' && r.Ids?.includes(block.Id)
    )
  );
}

// Extract table from TABLE block
function extractTable(tableBlock, blockMap) {
  if (!tableBlock.Relationships) return null;
  
  const cellRelation = tableBlock.Relationships.find(r => r.Type === 'CHILD');
  if (!cellRelation || !cellRelation.Ids) return null;
  
  const cells = [];
  let maxRow = 0;
  let maxCol = 0;
  
  cellRelation.Ids.forEach(cellId => {
    const cellBlock = blockMap.get(cellId);
    if (cellBlock && cellBlock.BlockType === 'CELL') {
      const rowIndex = cellBlock.RowIndex || 1;
      const colIndex = cellBlock.ColumnIndex || 1;
      const text = getTextFromBlock(cellBlock, blockMap);
      
      maxRow = Math.max(maxRow, rowIndex);
      maxCol = Math.max(maxCol, colIndex);
      
      cells.push({
        text: text,
        rowIndex: rowIndex - 1,
        columnIndex: colIndex - 1,
        rowSpan: cellBlock.RowSpan || 1,
        columnSpan: cellBlock.ColumnSpan || 1,
        confidence: cellBlock.Confidence || 95
      });
    }
  });
  
  // Create 2D array for cells
  const cellArray = Array(maxRow).fill(null).map(() => Array(maxCol).fill(null));
  cells.forEach(cell => {
    if (cellArray[cell.rowIndex]) {
      cellArray[cell.rowIndex][cell.columnIndex] = cell;
    }
  });
  
  return {
    id: `table-${Date.now()}`,
    rows: maxRow,
    columns: maxCol,
    cells: cellArray,
    confidence: tableBlock.Confidence || 95,
    boundingBox: convertBoundingBox(tableBlock.Geometry?.BoundingBox)
  };
}

// Calculate average confidence
function calculateAverageConfidence(elements) {
  if (elements.length === 0) return 0;
  const sum = elements.reduce((acc, el) => acc + (el.confidence || 0), 0);
  return Math.round(sum / elements.length);
}
