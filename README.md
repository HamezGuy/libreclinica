# LibreClinica - Reference & OCR Backend

## Status

The Angular frontend that was previously in this directory has been **removed** 
(it was superseded by `ElectronicDataCaptureReal`).

## What Remains

### `backend/` - OCR/Textract Proxy Server
An Express.js proxy server (port 3001) for Amazon Textract OCR requests.
This is a standalone service that can be used for document OCR if needed.

### `tools/` - i18n Utility Scripts
Translation extraction and verification tools.

## Architecture Context

The LibreClinica **business layer** is provided by:
- **`libreclinica-core/`** - Java/Tomcat application that creates the PostgreSQL 
  schema (100+ tables) and provides SOAP web services
- **`libreclinicaapi/`** - Node.js REST API that bridges the Angular frontend 
  with LibreClinica Core via SOAP and direct database access

See `ARCHITECTURE.md` in the project root for the full system architecture.
