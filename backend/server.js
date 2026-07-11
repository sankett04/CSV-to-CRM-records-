require('dotenv').config();

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

let OpenAI;
try {
  ({ OpenAI } = require('openai'));
} catch (error) {
  OpenAI = null;
}

const app = express();
const port = Number(process.env.PORT) || 5000;

app.use(cors());
app.use(express.json());

const uploadDir = path.join(__dirname, 'uploads');

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.toLowerCase().endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  },
});

function normalizeHeader(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function buildDateStamp(value) {
  if (!value) {
    return new Date().toISOString();
  }

  const parsedDate = new Date(value);
  if (!Number.isNaN(parsedDate.getTime())) {
    return parsedDate.toISOString();
  }

  return new Date().toISOString();
}

function parseCsv(content) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const parsedRows = [];

  for (const line of lines) {
    if (!line.trim()) continue;

    const values = [];
    let current = '';
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];

      if (char === '"') {
        if (inQuotes && line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    values.push(current);
    parsedRows.push(values);
  }

  if (parsedRows.length === 0) {
    return { headers: [], rows: [], rawRows: [] };
  }

  const [headers, ...dataRows] = parsedRows;
  const normalizedHeaders = headers.map(normalizeHeader);

  const mappedRows = dataRows.map((row) => {
    const object = {};
    normalizedHeaders.forEach((header, index) => {
      object[header] = row[index] || '';
    });
    return object;
  });

  return {
    headers: normalizedHeaders,
    rows: mappedRows,
    rawRows: dataRows,
  };
}

function buildRowObjects(rows, headers = []) {
  if (!Array.isArray(rows)) {
    return [];
  }

  if (rows.every((row) => row && typeof row === 'object' && !Array.isArray(row))) {
    return rows;
  }

  return rows.map((row) => {
    const object = {};
    headers.forEach((header, index) => {
      object[header] = row[index] || '';
    });
    return object;
  });
}

function buildFallbackRecords(rows) {
  const crmFields = [
    'created_at',
    'name',
    'email',
    'country_code',
    'mobile_without_country_code',
    'company',
    'city',
    'state',
    'country',
    'lead_owner',
    'crm_status',
    'crm_note',
    'data_source',
    'possession_time',
    'description',
  ];

  return rows.map((row, index) => {
    const record = {};

    crmFields.forEach((field) => {
      record[field] = row[field] || '';
    });

    if (!record.name) {
      record.name = row.full_name || row.lead_name || row.contact_name || `Lead ${index + 1}`;
    }
    if (!record.email) {
      record.email = row.email_address || row.email || '';
    }
    if (!record.mobile_without_country_code) {
      record.mobile_without_country_code = row.mobile || row.phone || row.phone_number || '';
    }
    if (!record.company) {
      record.company = row.company_name || row.organization || row.company || '';
    }
    const rowDateValue = row.created_at || row.created || row.date || '';
    record.created_at = buildDateStamp(rowDateValue);
    record.crm_status = 'NEW_LEAD';
    record.data_source = 'csv_upload';
    if (!record.description) {
      record.description = Object.entries(row)
        .filter(([, value]) => value)
        .slice(0, 5)
        .map(([key, value]) => `${key}: ${value}`)
        .join(' | ');
    }

    return record;
  });
}

function coalesceValue(record, candidates, fallback = '') {
  const normalizedCandidates = candidates.map((item) => normalizeHeader(item));
  const matchingKey = Object.keys(record || {}).find((key) => normalizedCandidates.includes(normalizeHeader(key)));

  if (!matchingKey) {
    return fallback;
  }

  const value = record[matchingKey];
  return value === null || value === undefined ? fallback : String(value);
}

function normalizeRecord(record, index) {
  const normalized = {
    created_at: buildDateStamp(coalesceValue(record, ['created_at', 'created', 'date'])),
    name: coalesceValue(record, ['name', 'full_name', 'lead_name', 'contact_name']) || `Lead ${index + 1}`,
    email: coalesceValue(record, ['email', 'email_address']) || '',
    country_code: coalesceValue(record, ['country_code', 'countrycode']) || '',
    mobile_without_country_code: coalesceValue(record, ['mobile_without_country_code', 'mobile', 'phone', 'phone_number']) || '',
    company: coalesceValue(record, ['company', 'company_name', 'organization']) || '',
    city: coalesceValue(record, ['city']) || '',
    state: coalesceValue(record, ['state', 'province']) || '',
    country: coalesceValue(record, ['country']) || '',
    lead_owner: coalesceValue(record, ['lead_owner', 'owner']) || '',
    crm_status: 'NEW_LEAD',
    crm_note: coalesceValue(record, ['crm_note', 'notes']) || '',
    data_source: 'csv_upload',
    possession_time: coalesceValue(record, ['possession_time', 'possession']) || '',
    description: coalesceValue(record, ['description', 'notes']) || '',
  };

  if (!normalized.description) {
    normalized.description = Object.entries(record || {})
      .filter(([, value]) => value)
      .slice(0, 5)
      .map(([key, value]) => `${key}: ${value}`)
      .join(' | ');
  }

  return normalized;
}

function buildAiPrompt(rows) {
  return `You are an expert CRM data extraction engine.
Convert each CSV row into a JSON object that follows these CRM fields:
created_at, name, email, country_code, mobile_without_country_code, company, city, state, country, lead_owner, crm_status, crm_note, data_source, possession_time, description.
Use the available values from each row. If a field is missing, leave it empty or use reasonable defaults. Always set crm_status to NEW_LEAD and data_source to csv_upload.
For every record, include a created_at value. If the source row has a date, use it; otherwise use a UTC ISO timestamp.
Return ONLY a valid JSON array of objects. Do not wrap it in markdown.

CSV rows (as JSON objects):
${JSON.stringify(rows, null, 2)}`;
}

function parseJsonResponse(text) {
  const cleaned = String(text || '').trim();
  const match = cleaned.match(/```json\s*([\s\S]*?)```/i) || cleaned.match(/```([\s\S]*?)```/i);
  const jsonText = match ? match[1] : cleaned;

  try {
    return JSON.parse(jsonText);
  } catch (error) {
    const start = jsonText.indexOf('[');
    const end = jsonText.lastIndexOf(']');
    if (start >= 0 && end > start) {
      return JSON.parse(jsonText.slice(start, end + 1));
    }
    throw error;
  }
}

async function extractRecords(rows) {
  const aiBaseUrl = process.env.AI_BASE_URL || process.env.AI_API_BASE_URL || process.env.VLLM_BASE_URL || '';
  const aiApiKey = process.env.AI_API_KEY || process.env.HF_API_TOKEN || process.env.OPENAI_API_KEY || '';
  const modelName = process.env.AI_MODEL_NAME || process.env.HF_MODEL || 'Qwen/Qwen2.5-7B-Instruct:together';

  if (!aiBaseUrl) {
    return {
      records: buildFallbackRecords(rows),
      aiUsed: false,
      note: 'No AI endpoint configured. Used local fallback mapping.',
    };
  }

  try {
    let content = '';

    if (OpenAI) {
      const client = new OpenAI({
        baseURL: aiBaseUrl.includes('/chat/completions') ? aiBaseUrl.replace(/\/chat\/completions$/, '') : aiBaseUrl.replace(/\/$/, ''),
        apiKey: aiApiKey,
      });

      const completion = await client.chat.completions.create({
        model: modelName,
        temperature: 0.1,
        max_tokens: 3000,
        messages: [
          {
            role: 'system',
            content: 'You extract CRM data from CSV rows into structured JSON objects.',
          },
          {
            role: 'user',
            content: buildAiPrompt(rows),
          },
        ],
      });

      content = completion.choices?.[0]?.message?.content || '';
    } else {
      const endpoint = aiBaseUrl.includes('/chat/completions')
        ? aiBaseUrl
        : `${aiBaseUrl.replace(/\/$/, '')}/chat/completions`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(aiApiKey ? { Authorization: `Bearer ${aiApiKey}` } : {}),
        },
        body: JSON.stringify({
          model: modelName,
          temperature: 0.1,
          max_tokens: 3000,
          messages: [
            {
              role: 'system',
              content: 'You extract CRM data from CSV rows into structured JSON objects.',
            },
            {
              role: 'user',
              content: buildAiPrompt(rows),
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`AI request failed with status ${response.status}`);
      }

      const payload = await response.json();
      content = payload.choices?.[0]?.message?.content || payload.output_text || '';
    }

    const parsed = parseJsonResponse(content);

    if (!Array.isArray(parsed)) {
      throw new Error('AI response was not a JSON array');
    }

    return {
      records: parsed.map((record, index) => normalizeRecord(record, index)),
      aiUsed: true,
      note: 'AI extraction completed successfully.',
    };
  } catch (error) {
    console.error('AI extraction failed:', error.message);
    return {
      records: buildFallbackRecords(rows),
      aiUsed: false,
      note: `AI extraction failed. Used fallback mapping: ${error.message}`,
    };
  }
}

app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const fileContent = req.file.buffer.toString('utf8');
    const parsed = parseCsv(fileContent);

    return res.json({
      message: 'CSV uploaded and parsed successfully',
      fileName: req.file.originalname,
      originalName: req.file.originalname,
      savedAt: 'memory',
      headers: parsed.headers,
      totalRows: parsed.rows.length,
      rows: parsed.rawRows,
      rowObjects: parsed.rows,
    });
  } catch (error) {
    console.error('Upload processing failed:', error);
    return res.status(500).json({ message: 'Failed to process CSV upload', error: error.message });
  }
});

app.post('/api/import', async (req, res) => {
  try {
    const { fileName, rowObjects, rows, headers } = req.body || {};
    const normalizedHeaders = Array.isArray(headers) ? headers : [];
    const normalizedRows = Array.isArray(rowObjects) && rowObjects.every((item) => item && typeof item === 'object' && !Array.isArray(item))
      ? rowObjects
      : buildRowObjects(Array.isArray(rows) ? rows : [], normalizedHeaders);

    if (!normalizedRows.length) {
      if (!fileName) {
        return res.status(400).json({ message: 'No CSV rows provided for import' });
      }

      const filePath = path.join(uploadDir, fileName);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: 'Uploaded file not found' });
      }

      const fileContent = fs.readFileSync(filePath, 'utf8');
      const parsed = parseCsv(fileContent);
      const extraction = await extractRecords(parsed.rows);

      return res.json({
        message: 'CSV imported successfully',
        fileName,
        headers: parsed.headers,
        totalRows: parsed.rows.length,
        records: extraction.records,
        structuredJson: extraction.records,
        aiUsed: extraction.aiUsed,
        note: extraction.note,
      });
    }

    const extraction = await extractRecords(normalizedRows);

    return res.json({
      message: 'CSV imported successfully',
      fileName: fileName || 'uploaded.csv',
      headers: normalizedHeaders,
      totalRows: normalizedRows.length,
      records: extraction.records,
      structuredJson: extraction.records,
      aiUsed: extraction.aiUsed,
      note: extraction.note,
    });
  } catch (error) {
    console.error('Import processing failed:', error);
    return res.status(500).json({ message: 'Failed to import CSV', error: error.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Backend running on http://localhost:${port}`);
  });
}

module.exports = {
  app,
  buildDateStamp,
  buildFallbackRecords,
  normalizeRecord,
  parseCsv,
};
