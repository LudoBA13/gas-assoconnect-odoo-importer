function doGet(e)
{
	return HtmlService.createHtmlOutputFromFile('Index')
		.setTitle('Odoo to AssoConnect Importer')
		.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function processImport(odooBase64, odooName, odooMime, assoBase64, assoName, assoMime)
{
	const odooData = parseCsvFile(odooBase64, odooMime, odooName);
	const assoData = parseXlsxFile(assoBase64, assoMime, assoName);
	
	const odooHeaders = odooData[0];
	const assoHeaders = assoData[0];
	
	// Validate that every field in Odoo exists in AssoConnect
	const assoHeaderMap = {};
	for (let i = 0; i < assoHeaders.length; i++)
	{
		assoHeaderMap[String(assoHeaders[i]).trim()] = i;
	}
	
	const odooHeaderMap = {};
	for (let i = 0; i < odooHeaders.length; i++)
	{
		const header = String(odooHeaders[i]).trim();
		if (header === '')
		{
			continue;
		}
		odooHeaderMap[header] = i;
		if (assoHeaderMap[header] === undefined)
		{
			throw new Error('Field "' + header + '" in Odoo does not exist in AssoConnect.');
		}
	}
	
	// Find Email index in Odoo and AssoConnect
	const odooEmailIdx = odooHeaderMap['Email'];
	const assoEmailIdx = assoHeaderMap['Email'];
	
	if (odooEmailIdx === undefined)
	{
		throw new Error('Column "Email" not found in Odoo CSV.');
	}
	if (assoEmailIdx === undefined)
	{
		throw new Error('Column "Email" not found in AssoConnect XLSX.');
	}
	
	// Build AssoConnect lookup map by Email
	const assoUserMap = {};
	for (let r = 1; r < assoData.length; r++)
	{
		const row = assoData[r];
		const email = String(row[assoEmailIdx]).trim().toLowerCase();
		if (email !== '')
		{
			assoUserMap[email] = row;
		}
	}
	
	const insertRows = [];
	const updateRows = [];
	let unchangedCount = 0;
	
	// Process each Odoo row (skipping header)
	for (let r = 1; r < odooData.length; r++)
	{
		const odooRow = odooData[r];
		const emailRaw = String(odooRow[odooEmailIdx]).trim();
		const emailKey = emailRaw.toLowerCase();
		
		if (emailKey === '')
		{
			continue;
		}
		
		const assoRow = assoUserMap[emailKey];
		
		if (!assoRow)
		{
			// No match in AssoConnect -> Insert
			insertRows.push(odooRow);
		}
		else
		{
			// Match found -> check if any value differs in Odoo fields
			let isDifferent = false;
			for (const header in odooHeaderMap)
			{
				const odooColIdx = odooHeaderMap[header];
				const assoColIdx = assoHeaderMap[header];
				
				const odooVal = String(odooRow[odooColIdx] !== undefined ? odooRow[odooColIdx] : '').trim();
				const assoVal = String(assoRow[assoColIdx] !== undefined ? assoRow[assoColIdx] : '').trim();
				
				if (odooVal !== assoVal)
				{
					isDifferent = true;
					break;
				}
			}
			
			if (isDifferent)
			{
				updateRows.push(odooRow);
			}
			else
			{
				unchangedCount++;
			}
		}
	}
	
	// Generate CSV output strings (including header)
	const insertCsv = convertRowsToCsv(odooHeaders, insertRows);
	const updateCsv = convertRowsToCsv(odooHeaders, updateRows);
	
	return {
		insertOutput: insertCsv,
		updateOutput: updateCsv,
		stats: {
			totalOdoo: odooData.length - 1,
			totalAsso: assoData.length - 1,
			inserted: insertRows.length,
			updated: updateRows.length,
			unchanged: unchangedCount
		}
	};
}

function parseCsvFile(base64Data, mimeType, fileName)
{
	const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, fileName);
	const csvString = blob.getDataAsString();
	const data = Utilities.parseCsv(csvString);
	
	if (!data || data.length < 1)
	{
		throw new Error('CSV file is empty or invalid: ' + fileName);
	}
	
	return data;
}

function parseXlsxFile(base64Data, mimeType, fileName)
{
	const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, fileName);
	const resource = {
		title: 'TEMP_ASSO_' + new Date().getTime(),
		mimeType: MimeType.GOOGLE_SHEETS
	};
	
	let fileId = null;
	try
	{
		const convertedFile = Drive.Files.insert(resource, blob, { convertToGoogleSheets: true });
		fileId = convertedFile.id;
		
		const ss = SpreadsheetApp.openById(fileId);
		const sheet = ss.getSheets()[0];
		const data = sheet.getDataRange().getValues();
		
		if (!data || data.length < 1)
		{
			throw new Error('AssoConnect file is empty or invalid.');
		}
		
		return data;
	}
	finally
	{
		if (fileId)
		{
			try
			{
				Drive.Files.remove(fileId);
			}
			catch (e)
			{
				// Ignore cleanup error
			}
		}
	}
}

function convertRowsToCsv(headers, rows)
{
	const lines = [];
	lines.push(escapeCsvRow(headers));
	for (let i = 0; i < rows.length; i++)
	{
		lines.push(escapeCsvRow(rows[i]));
	}
	return lines.join('\n');
}

function escapeCsvRow(row)
{
	const escaped = [];
	for (let i = 0; i < row.length; i++)
	{
		let val = String(row[i] !== undefined && row[i] !== null ? row[i] : '');
		if (val.includes('"') || val.includes(',') || val.includes('\n') || val.includes('\r'))
		{
			val = '"' + val.replace(/"/g, '""') + '"';
		}
		escaped.push(val);
	}
	return escaped.join(',');
}
