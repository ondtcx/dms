# Document PDF Extraction Specification

## Purpose

Define the existing PDF text-extraction behavior updated for the installed PDFParse v2 lifecycle while preserving best-effort upload preparation.

## Requirements

### Requirement: Use the PDFParse v2 input contract

The system MUST construct PDFParse with the PDF data represented as a Uint8Array before requesting extracted text.

#### Scenario: Buffer input is adapted for PDFParse v2

- GIVEN a PDF data buffer is provided for text extraction
- WHEN extraction starts
- THEN PDFParse is constructed with the equivalent Uint8Array data
- AND text extraction is requested from that parser instance

#### Scenario: Parser construction fails

- GIVEN PDFParse cannot be constructed for the provided data
- WHEN extraction starts
- THEN the failure is handled by the fail-soft extraction behavior

### Requirement: Return extracted TextResult text

The system MUST return the `text` value from the result of the parser's text extraction operation when extraction succeeds.

#### Scenario: Text is propagated on success

- GIVEN the parser returns a TextResult containing text
- WHEN extraction completes successfully
- THEN the extracted text value is returned

#### Scenario: Empty text is preserved

- GIVEN the parser returns a successful TextResult with empty text
- WHEN extraction completes
- THEN the empty text value is returned without substitution

### Requirement: Destroy the parser exactly once

The system MUST destroy the parser exactly once after successful extraction and exactly once when extraction fails after parser creation.

#### Scenario: Successful extraction cleanup

- GIVEN a parser instance successfully returns a TextResult
- WHEN extraction completes
- THEN the parser is destroyed exactly once

#### Scenario: Failed extraction cleanup

- GIVEN a parser instance rejects the text extraction operation
- WHEN extraction handles the failure
- THEN the parser is destroyed exactly once

### Requirement: Fail-soft extraction errors

The system MUST log extraction failures and return null instead of propagating parser errors to upload preparation.

#### Scenario: Parser rejection is logged and converted to null

- GIVEN text extraction rejects with an error
- WHEN the service handles the rejection
- THEN the error is logged
- AND extraction returns null

#### Scenario: Cleanup failure remains fail-soft

- GIVEN extraction or parser cleanup fails
- WHEN the service completes error handling
- THEN upload preparation does not receive a parser exception
- AND extraction returns null

### Requirement: Upload continues without extracted text

The system MUST allow the existing upload preparation flow to continue when PDF extraction returns null, without requiring extracted text.

#### Scenario: Upload continues after extraction failure

- GIVEN PDF text extraction fails and returns null
- WHEN upload preparation continues
- THEN the upload proceeds through its existing persistence path
- AND no extracted text is attached

#### Scenario: Successful extraction remains available to upload preparation

- GIVEN PDF text extraction returns text
- WHEN upload preparation continues
- THEN the existing upload flow receives that extracted text
- AND no additional upload or persistence behavior is introduced
