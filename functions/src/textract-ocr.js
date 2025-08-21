const functions = require('firebase-functions/v1');
const AWS = require('aws-sdk');
const cors = require('cors');

// Initialize CORS with allowed origins
const corsHandler = cors({
  origin: [
    'http://localhost:4200',
    'http://localhost:4201',
    'http://localhost:4202',
    'https://electronic-data-capture-project.vercel.app',
    'https://electronic-data-capture-project-*.vercel.app',
    'https://data-entry-project-465905.firebaseapp.com',
    'https://data-entry-project-465905.web.app'
  ],
  credentials: true
});

// Configure AWS Textract
const textract = new AWS.Textract({
  accessKeyId: functions.config().aws?.access_key_id || process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: functions.config().aws?.secret_access_key || process.env.AWS_SECRET_ACCESS_KEY,
  region: functions.config().aws?.region || process.env.AWS_REGION || 'us-east-1'
});

exports.analyzeDocument = functions.runWith({
  timeoutSeconds: 120,
  memory: '1GB'
}).https.onRequest((req, res) => {
  // Handle CORS
  corsHandler(req, res, async () => {
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
      console.log('Received OCR request');
      
      const requestData = req.body;
      
      if (!requestData.base64) {
        res.status(400).json({ error: 'No document provided' });
        return;
      }

      // Convert base64 to buffer
      const base64Data = requestData.base64.replace(/^data:.*,/, '');
      const documentBytes = Buffer.from(base64Data, 'base64');

      // Prepare Textract parameters
      const params = {
        Document: {
          Bytes: documentBytes
        },
        FeatureTypes: ['FORMS', 'TABLES']
      };

      console.log('Calling AWS Textract...');
      
      // Call Textract
      const result = await textract.analyzeDocument(params).promise();
      
      console.log(`Textract analysis complete. Found ${result.Blocks?.length || 0} blocks`);
      
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
        code: error.code
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

// Convert Textract bounding box to our format
function convertBoundingBox(bb) {
  if (!bb) {
    return { left: 0, top: 0, width: 0, height: 0, normalized: true };
  }
  
  return {
    left: bb.Left || 0,
    top: bb.Top || 0,
    width: bb.Width || 0,
    height: bb.Height || 0,
    normalized: true
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
