# AssoConnect Odoo User Importer

## Overview
The **AssoConnect Odoo User Importer** is a Google Apps Script web application designed to synchronize user data from an Odoo export (`.csv`) into AssoConnect (`.xlsx`). 

## Conceptual Design
Odoo serves as the primary source of truth for user identities, while AssoConnect maintains a richer, broader dataset of members. This synchronization operates strictly **one-way** (Odoo $\rightarrow$ AssoConnect):
1. **No Pruning**: Records existing in AssoConnect but absent in Odoo are ignored and never deleted, acknowledging that AssoConnect contains superset data.
2. **Schema Validation**: If any field (column header) exists in Odoo that is not present in AssoConnect, the application immediately throws an exception and halts execution. This safeguards against upstream export corruptions or schema drift.
3. **Change Detection**:
   - **Insert**: Users present in Odoo (by `Email`) but missing in AssoConnect are collected in the "Insert" output.
   - **Update**: Users present in both systems whose attribute values differ are collected in the "Update" output.
   - **No Action**: Users with identical attribute values require no action.

## Security & Data Privacy (Zero Data Retention)
Data privacy is paramount. 
- Input files uploaded via the web interface are temporarily loaded into Google Sheets solely for programmatic parsing.
- Immediately after reading, these temporary Google Sheet files are **explicitly marked as trashed** (`setTrashed(true)`), ensuring no persistent copies or residual sensitive data remain in Google Drive.
