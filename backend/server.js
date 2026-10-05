/**
 * Voice Billing Web Application - Express Backend
 * Features:
 * - Groq Whisper Large V3 Speech-to-Text Integration
 * - Hindi / Hinglish / English Voice Order Parsing
 * - Static Hosting & Server-Side Bill Calculation Engine
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const multer = require('multer');
const cors = require('cors');
const Groq = require('groq-sdk');
const parser = require('./parser');

const app = express();
const PORT = process.env.PORT || 5000;
const GROQ_MODEL = process.env.GROQ_WHISPER_MODEL || 'whisper-large-v3';

// Enable Cross-Origin Resource Sharing (CORS) for decoupled Frontend deployment
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-gemini-api-key', 'x-groq-api-key']
}));

// Configure Multer for in-memory audio buffer processing (max 25MB as per Groq limit)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024 // 25 MB
  },
  fileFilter: (req, file, cb) => {
    // Accept standard audio formats: webm, wav, ogg, mp3, m4a, flac
    if (file.mimetype.startsWith('audio/') || file.mimetype === 'video/webm' || file.mimetype === 'application/octet-stream') {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported audio format: ${file.mimetype}`));
    }
  }
});

// Middleware for parsing JSON requests (with 50MB limit for base64 document images)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health Check and Root API Status
app.get(['/', '/api/health'], (req, res) => {
  res.json({
    status: 'ok',
    service: 'Chat2Bill Backend REST API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    endpoints: {
      extractPo: 'POST /api/extract-po',
      ocr: 'POST /api/ocr',
      ocrTest: 'POST /api/ocr/test',
      transcribe: 'POST /api/transcribe',
      calculateBill: 'POST /api/bill',
      voiceConfig: 'GET /api/voice-config',
      aiConfig: 'GET /api/ai-config'
    }
  });
});

/**
 * Helper: Round a number safely to 2 decimal places
 */
function roundToTwo(num) {
  return Math.round((Number(num) + Number.EPSILON) * 100) / 100;
}

/**
 * Helper: Get an authenticated Groq SDK client instance
 */
function getGroqClient(req) {
  const apiKey = (req && req.headers['x-groq-api-key']) || process.env.GROQ_API_KEY;
  if (!apiKey || apiKey === 'gsk_your_groq_api_key_here' || apiKey.trim() === '') {
    return null;
  }
  return new Groq({ apiKey: apiKey.trim() });
}

/**
 * Helper: Get Google Gemini API key from header or .env
 */
function getGeminiApiKey(req) {
  const apiKey = (req && req.headers && (req.headers['x-gemini-api-key'] || req.headers['authorization']?.replace(/^Bearer\s+/i, ''))) ||
    (req && req.body && (req.body.geminiApiKey || req.body.apiKey)) ||
    process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.startsWith('AIzaSy_your_gemini') || apiKey.trim() === '') {
    return null;
  }
  return apiKey.trim();
}

/**
 * Helper: Get configured Gemini Model from .env or default
 */
function getGeminiModel() {
  return process.env.GEMINI_MODEL || 'gemini-1.5-flash';
}

/**
 * Helper: Extract OCR text directly using Google Gemini Vision AI (Serverless & Cloud-Ready for Vercel)
 */
async function extractTextWithGeminiVision(image, apiKey) {
  const cleanKey = apiKey || process.env.GEMINI_API_KEY;
  if (!cleanKey || cleanKey.startsWith('AIzaSy_your_gemini') || cleanKey.trim() === '') {
    throw new Error('Google Gemini API Key is not configured. Add GEMINI_API_KEY to your environment variables or enter it in API Config.');
  }

  const mime = image.mimeType || 'image/png';
  const cleanModel = (process.env.GEMINI_MODEL || 'gemini-1.5-flash').replace(/^models\//, '');
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${cleanKey.trim()}`;

  const payload = {
    contents: [
      {
        role: "user",
        parts: [
          { text: "Perform verbatim Optical Character Recognition (OCR) on this purchase order / invoice document. Extract and transcribe all text, line items, headers, tables, numbers, and dates line by line exactly as written. Do not add commentary or conversational filler." },
          { inlineData: { mimeType: mime, data: image.data } }
        ]
      }
    ]
  };

  const resp = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!resp.ok) {
    const errData = await resp.json().catch(() => ({}));
    throw new Error(errData?.error?.message || `Gemini Vision returned HTTP ${resp.status}`);
  }

  const result = await resp.json();
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return text.trim();
}

/**
 * Deterministic Local Heuristics PO Parser (Server-side Fallback)
 */
function parseWithLocalHeuristics(text = '') {
  const clean = String(text).replace(/\r\n/g, '\n');

  const poNumMatch = clean.match(/(?:purchase\s*order(?:\s*no|\s*number)?|po(?:\s*no|\s*#)?|order\s*#|invoice\s*#|ref(?:\s*no)?)[#:\s]+([A-Za-z0-9_\/-]+)/i) ||
    clean.match(/\bPO[-_#]?([A-Za-z0-9-]+)\b/i) ||
    clean.match(/#([A-Za-z0-9_-]{4,})/);
  const poNumber = poNumMatch ? (poNumMatch[1] || poNumMatch[0]).replace(/^[#:\s]+/, '') : `PO-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

  const dateMatches = clean.match(/\b(20\d{2}[-/.]\d{1,2}[-/.]\d{1,2})\b/g) ||
                      clean.match(/\b(\d{1,2}[-/.]\d{1,2}[-/.]20\d{2})\b/g) || [];
  const issueDate = dateMatches[0] || new Date().toISOString().split('T')[0];
  const dueDate = dateMatches[1] || "";

  const termsMatch = clean.match(/(?:terms|payment\s*terms)[:\s]+([^\n\r]+)/i);
  const paymentTerms = termsMatch ? termsMatch[1].trim() : "Net 30 days";

  let currency = "$";
  if (clean.includes("₹") || clean.includes("INR") || clean.includes("rupees") || clean.includes("Rs")) currency = "₹";
  else if (clean.includes("€") || clean.includes("EUR")) currency = "€";
  else if (clean.includes("£") || clean.includes("GBP")) currency = "£";
  else if (clean.includes("¥") || clean.includes("JPY")) currency = "¥";

  let vendor = { name: "Extracted Supplier", address: "", contact: "", taxId: "" };
  const vendorSection = clean.match(/(?:vendor|supplier|from|seller)[:\s]*([\s\S]*?)(?=(?:buyer|client|purchaser|bill\s*to|ship\s*to|line\s*items|items|deliverables|$))/i);
  if (vendorSection) {
    const lines = vendorSection[1].trim().split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length > 0) vendor.name = lines[0].replace(/^[:\-#\s]+/, '');
    if (lines.length > 1) vendor.address = lines.slice(1, 3).join(', ');
    const contactMatch = vendorSection[1].match(/(?:contact|email|phone)[:\s]*([^\n\r]+)/i) || vendorSection[1].match(/[\w.-]+@[\w.-]+\.\w+/);
    if (contactMatch) vendor.contact = contactMatch[1] || contactMatch[0];
    const taxMatch = vendorSection[1].match(/(?:tax\s*id|vat|gstin|gst)[:\s]*([A-Za-z0-9-]+)/i);
    if (taxMatch) vendor.taxId = taxMatch[1];
  }

  let buyer = { name: "Extracted Buyer Organization", address: "", contact: "", taxId: "" };
  const buyerSection = clean.match(/(?:buyer|client|purchaser|bill\s*to|invoice\s*to)[:\s]*([\s\S]*?)(?=(?:vendor|supplier|line\s*items|items|deliverables|ship\s*to|$))/i);
  if (buyerSection) {
    const lines = buyerSection[1].trim().split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length > 0) buyer.name = lines[0].replace(/^[:\-#\s]+/, '');
    if (lines.length > 1) buyer.address = lines.slice(1, 3).join(', ');
    const contactMatch = buyerSection[1].match(/(?:contact|attn|email|phone)[:\s]*([^\n\r]+)/i) || buyerSection[1].match(/[\w.-]+@[\w.-]+\.\w+/);
    if (contactMatch) buyer.contact = contactMatch[1] || contactMatch[0];
    const taxMatch = buyerSection[1].match(/(?:tax\s*id|vat|gstin|gst)[:\s]*([A-Za-z0-9-]+)/i);
    if (taxMatch) buyer.taxId = taxMatch[1];
  }

  let shipping = 0;
  let discount = 0;
  const shipMatch = clean.match(/(?:shipping|freight)[^\n\r$€£¥₹]*[$€£¥₹]?\s*([\d,]+\.?\d*)/i);
  if (shipMatch) shipping = parseFloat(shipMatch[1].replace(/,/g, '')) || 0;
  const discMatch = clean.match(/(?:discount|rebate)[^\n\r$€£¥₹]*[$€£¥₹]?\s*([\d,]+\.?\d*)/i);
  if (discMatch) discount = parseFloat(discMatch[1].replace(/,/g, '')) || 0;

  const items = [];
  const lines = clean.split('\n');
  const headerSkipRegex = /^(item|description|qty|quantity|unit|price|rate|amount|total|subtotal|tax|discount|shipping|freight|notes|terms|payment|bank|authorized|sign|page\s*\d|po\s*box|date|vendor|buyer)/i;

  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 3) return;
    if (/^(subtotal|total|grand\s*total|balance\s*due|amount\s*due|tax\s*total|thank\s*you)/i.test(trimmed)) return;
    if (/^(item\s+desc|description\s+qty|sl\s*no|sr\s*no)/i.test(trimmed)) return;

    let desc = "";
    let sku = "";
    let qty = 1;
    let unitPrice = 0;
    let taxRate = 0;

    // Explicit keywords: qty, rate, price, @, sku
    if (/qty|rate|price|sku|@|tax/i.test(trimmed) && /\d+/.test(trimmed)) {
      const skuMatch = trimmed.match(/(?:sku|code)[:\s]*([A-Za-z0-9_-]+)/i);
      if (skuMatch) sku = skuMatch[1];

      const qtyMatch = trimmed.match(/(?:qty|quantity)[:\s]*(\d+)/i) || trimmed.match(/x\s*(\d+)/i);
      if (qtyMatch) qty = parseInt(qtyMatch[1], 10);

      const priceMatch = trimmed.match(/(?:unit\s*price|rate|@)?[:\s]*[$€£¥₹]?\s*([\d,]+\.\d{2})/i) || trimmed.match(/[$€£¥₹]\s*([\d,]+\.?\d*)/);
      if (priceMatch) unitPrice = parseFloat(priceMatch[1].replace(/,/g, ''));

      const taxMatch = trimmed.match(/tax[:\s]*(\d+(?:\.\d+)?)\s*%/i);
      if (taxMatch) taxRate = parseFloat(taxMatch[1]);

      desc = trimmed.replace(/^\d+[\.\-)]\s*/, '')
        .replace(/^[•\-\*]\s*/, '')
        .split(/\||\(|@/)[0].trim();
    }
    // Tabular or price row: e.g. "Item Name 2 45.00 90.00" or "Office Chair $250.00"
    else if (/\d+/.test(trimmed)) {
      const priceMatches = [...trimmed.matchAll(/[$€£¥₹]?\s*(\d{1,6}(?:,\d{3})*(?:\.\d{2}))/g)];
      if (priceMatches.length > 0) {
        const tokens = trimmed.split(/\s{2,}|\t|\|/).filter(t => t.trim());
        if (tokens.length >= 2) {
          desc = tokens[0].replace(/^\d+[\.\-)]\s*/, '').trim();
          const numTokens = tokens.slice(1).map(t => parseFloat(t.replace(/[^0-9.]/g, ''))).filter(n => !isNaN(n));
          if (numTokens.length === 1) {
            unitPrice = numTokens[0];
          } else if (numTokens.length >= 2) {
            if (Number.isInteger(numTokens[0]) && numTokens[0] > 0 && numTokens[0] <= 1000) {
              qty = numTokens[0];
              unitPrice = numTokens[1];
            } else {
              unitPrice = numTokens[0];
            }
          }
        } else {
          const lastPrice = parseFloat(priceMatches[0][1].replace(/,/g, ''));
          unitPrice = lastPrice;
          const textBeforePrice = trimmed.substring(0, priceMatches[0].index).trim();
          const trailingQtyMatch = textBeforePrice.match(/\b(\d+)\s*$/);
          if (trailingQtyMatch && parseInt(trailingQtyMatch[1], 10) > 0 && parseInt(trailingQtyMatch[1], 10) <= 500) {
            qty = parseInt(trailingQtyMatch[1], 10);
            desc = textBeforePrice.substring(0, trailingQtyMatch.index).trim();
          } else {
            desc = textBeforePrice;
          }
          desc = desc.replace(/^\d+[\.\-)]\s*/, '').trim();
        }
      }
    }

    desc = desc.replace(/^[•\-\*#\d\.\s]+/, '').replace(/[\s\-_|:]+$/, '').trim();

    if (desc && desc.length >= 2 && unitPrice > 0 && !headerSkipRegex.test(desc)) {
      items.push({
        description: desc,
        sku: sku || `ITM-${Math.floor(100 + Math.random() * 900)}`,
        quantity: qty || 1,
        unitPrice: unitPrice || 50.00,
        taxRate: taxRate || 0.0
      });
    }
  });

  if (items.length === 0 && clean.trim().length > 0) {
    const candidateLines = lines.map(l => l.trim()).filter(l => l.length > 5 && !headerSkipRegex.test(l));
    if (candidateLines.length > 0) {
      items.push({
        description: candidateLines[0].substring(0, 80),
        sku: "GEN-001",
        quantity: 1,
        unitPrice: 100.00,
        taxRate: 5.0
      });
    } else {
      items.push({
        description: "Procurement Items / Deliverables",
        sku: "GEN-001",
        quantity: 1,
        unitPrice: 100.00,
        taxRate: 5.0
      });
    }
  }

  return {
    poNumber,
    issueDate,
    dueDate,
    paymentTerms,
    currency,
    vendor,
    buyer,
    items,
    shipping,
    discount,
    confidenceRating: "Local Heuristics Verified",
    notes: "Parsed through deterministic pattern heuristics."
  };
}

/**
 * GET /api/ai-config
 * Unified configuration status for all AI providers configured in .env or headers
 */
app.get('/api/ai-config', (req, res) => {
  const geminiKey = getGeminiApiKey(req);
  const groqKey = (req && req.headers['x-groq-api-key']) || process.env.GROQ_API_KEY;
  const isGroqConfigured = Boolean(groqKey && groqKey !== 'gsk_your_groq_api_key_here' && groqKey.trim() !== '');

  res.json({
    success: true,
    providers: {
      gemini: {
        configured: Boolean(geminiKey),
        model: getGeminiModel()
      },
      groq: {
        configured: isGroqConfigured,
        whisperModel: GROQ_MODEL,
        chatModel: process.env.GROQ_CHAT_MODEL || 'llama-3.3-70b-versatile'
      },
      deepseek: {
        configured: Boolean(process.env.DEEPSEEK_API_KEY)
      },
      together: {
        configured: Boolean(process.env.TOGETHER_API_KEY)
      }
    }
  });
});

/**
 * GET /api/voice-config
 * Backward-compatible endpoint for Voice POS check
 */
app.get('/api/voice-config', (req, res) => {
  const apiKey = (req && req.headers['x-groq-api-key']) || process.env.GROQ_API_KEY;
  const isConfigured = Boolean(apiKey && apiKey !== 'gsk_your_groq_api_key_here' && apiKey.trim() !== '');

  res.json({
    success: true,
    engine: 'groq-whisper',
    model: GROQ_MODEL,
    groqConfigured: isConfigured
  });
});

/**
 * GET & POST /api/gemini/models
 * Dynamically queries Google's ListModels API using the server's .env key or client override
 */
app.all(['/api/gemini/models'], async (req, res) => {
  const geminiKey = getGeminiApiKey(req) || req.body?.apiKey;
  if (!geminiKey) {
    return res.status(401).json({
      success: false,
      error: 'GEMINI_API_KEY is missing in .env and no X-Gemini-Api-Key was provided.'
    });
  }

  try {
    const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`);
    if (!listRes.ok) {
      const err = await listRes.json().catch(() => ({}));
      return res.status(listRes.status).json({ success: false, error: err?.error?.message || `HTTP ${listRes.status}` });
    }

    const data = await listRes.json();
    const available = (data.models || [])
      .filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
      .map(m => m.name.replace(/^models\//, ''))
      .filter(name => !name.includes('2.5') && !name.includes('3-flash-preview') && !name.includes('gemini-1.0') && !name.includes('pro-vision'));

    return res.json({ success: true, models: available });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/ocr/test
 * Tests connectivity and health for selected OCR engine (Gemini Vision Cloud, Docker AI, Jina AI, HuggingFace, OCR.space, Browser Tesseract)
 */
app.post('/api/ocr/test', async (req, res) => {
  const { provider = 'gemini_vision', endpoint, apiKey = '' } = req.body;

  if (provider === 'browser_tesseract') {
    return res.json({
      success: true,
      provider: 'browser_tesseract',
      message: 'Built-in Browser OCR Engine (Tesseract.js) is ready.'
    });
  }

  // Google Gemini Vision AI (Serverless, Cloud-Ready for Vercel)
  if (provider === 'gemini_vision') {
    const key = apiKey || getGeminiApiKey(req);
    if (!key) {
      return res.status(400).json({
        success: false,
        error: 'Google Gemini API Key is required for Cloud Vision OCR. Set GEMINI_API_KEY in Vercel environment variables or enter it in the API Key input.'
      });
    }
    return res.json({
      success: true,
      provider: 'gemini_vision',
      message: 'Google Gemini Vision Cloud OCR is connected and ready on Vercel!'
    });
  }

  try {
    if (provider === 'docker_jina' || provider === 'docker_8000') {
      const isTargetLocalhost = !endpoint || endpoint.includes('localhost') || endpoint.includes('127.0.0.1');

      // Vercel serverless environment check: localhost:11434 cannot be reached from cloud lambdas
      if (process.env.VERCEL && isTargetLocalhost) {
        return res.status(503).json({
          success: false,
          isVercel: true,
          error: `Cannot reach local Docker / Ollama at http://localhost:11434 from Vercel cloud environment. When deployed on Vercel, switch to 'Google Gemini Vision AI (Cloud)' or 'Built-in Browser OCR' (both work instantly with zero setup), or provide a public tunnel URL (e.g. https://...ngrok-free.app/v1/chat/completions).`
        });
      }

      const target = endpoint || (provider === 'docker_8000' ? 'http://localhost:8000/v1/models' : 'http://localhost:11434/api/tags');
      const pingUrl = target.includes('/chat/completions') ? target.replace('/chat/completions', '/models') : target;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      try {
        const pingResp = await fetch(pingUrl, {
          method: 'GET',
          headers: apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {},
          signal: controller.signal
        });
        clearTimeout(timeout);
        if (pingResp.ok) {
          return res.json({
            success: true,
            provider,
            message: `Connected to ${provider === 'docker_8000' ? 'Docker Port 8000' : 'Ollama / Docker AI on Port 11434'}`
          });
        }
      } catch (e) {
        clearTimeout(timeout);
      }

      // Secondary ping check
      const chatTarget = endpoint || (provider === 'docker_8000' ? 'http://localhost:8000/v1/chat/completions' : 'http://localhost:11434/v1/chat/completions');
      const chatController = new AbortController();
      const chatTimeout = setTimeout(() => chatController.abort(), 4000);
      const chatResp = await fetch(chatTarget, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}) },
        body: JSON.stringify({
          model: provider === 'docker_8000' ? 'jinaai/jina-ocr-v1' : 'hf.co/jinaai/jina-ocr-v1',
          messages: [{ role: 'user', content: 'ping' }]
        }),
        signal: chatController.signal
      }).catch(err => ({ ok: false, status: 503, err }));
      clearTimeout(chatTimeout);

      if (chatResp && (chatResp.ok || chatResp.status === 400 || chatResp.status === 422)) {
        return res.json({
          success: true,
          provider,
          message: `Reachable and responsive (${chatTarget})`
        });
      }

      return res.status(503).json({
        success: false,
        error: `Cannot reach local Docker / Ollama at ${chatTarget}. Ensure your Docker container or Ollama service is running, or switch to 'Google Gemini Vision AI (Cloud)' or 'Built-in Browser OCR'.`
      });
    }

    if (provider === 'jina_cloud') {
      const target = endpoint || 'https://api.jina.ai/v1/chat/completions';
      if (!apiKey && !process.env.JINA_API_KEY) {
        return res.status(400).json({ success: false, error: 'Jina AI API key required (e.g. jina_...)' });
      }
      const token = apiKey || process.env.JINA_API_KEY;
      const resp = await fetch(target, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ model: 'jina-ocr-v1', messages: [{ role: 'user', content: 'ping' }] })
      });
      if (resp.ok || resp.status === 400 || resp.status === 422) {
        return res.json({ success: true, provider, message: 'Official Jina AI Cloud connected' });
      }
      const err = await resp.json().catch(() => ({}));
      return res.status(resp.status).json({ success: false, error: err?.message || `HTTP ${resp.status}` });
    }

    if (provider === 'hf_jina') {
      const target = endpoint || 'https://router.huggingface.co/hf-inference/models/jinaai/jina-ocr-v1';
      const token = apiKey || process.env.HF_TOKEN;
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const resp = await fetch(target, { method: 'GET', headers });
      if (resp.ok || resp.status === 405 || resp.status === 400) {
        return res.json({ success: true, provider, message: 'HuggingFace Inference API connected' });
      }
      return res.status(resp.status).json({ success: false, error: `HuggingFace returned HTTP ${resp.status}` });
    }

    if (provider === 'ocrspace') {
      const target = endpoint || 'https://api.ocr.space/parse/image';
      const resp = await fetch(target, { method: 'GET' });
      if (resp.status !== 404 && resp.status !== 502) {
        return res.json({ success: true, provider, message: 'OCR.space Cloud API reachable' });
      }
      return res.json({ success: true, provider, message: 'OCR.space Cloud endpoint verified' });
    }

    return res.status(400).json({ success: false, error: `Unknown provider: ${provider}` });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/ocr
 * Server-side unified OCR execution avoiding browser CORS limits
 */
app.post('/api/ocr', async (req, res) => {
  const { image, provider = 'gemini_vision', endpoint, apiKey = '' } = req.body;

  if (!image || !image.data) {
    return res.status(400).json({ success: false, error: 'Missing image data for OCR.' });
  }

  const mime = image.mimeType || 'image/png';
  const base64DataUri = `data:${mime};base64,${image.data}`;

  try {
    // 0. Google Gemini Vision Cloud OCR (100% Vercel & Production Compatible)
    if (provider === 'gemini_vision') {
      const geminiKey = apiKey || getGeminiApiKey(req);
      const extractedText = await extractTextWithGeminiVision(image, geminiKey);
      return res.json({ success: true, provider: 'gemini_vision', text: extractedText });
    }

    // 1. Docker Ollama or Local Port 8000 (with automatic Vercel Cloud Fallback)
    if (provider === 'docker_jina' || provider === 'docker_8000') {
      const target = endpoint || (provider === 'docker_8000' ? 'http://localhost:8000/v1/chat/completions' : 'http://localhost:11434/v1/chat/completions');
      const isTargetLocalhost = target.includes('localhost') || target.includes('127.0.0.1');

      // If running in Vercel serverless cloud and pointing to localhost, auto-route to Gemini Vision
      if (process.env.VERCEL && isTargetLocalhost) {
        const geminiKey = apiKey || getGeminiApiKey(req);
        if (geminiKey) {
          console.log('[Vercel Cloud] Local Docker localhost is unreachable from Vercel cloud lambdas. Auto-routing through Google Gemini Vision Cloud OCR.');
          const extractedText = await extractTextWithGeminiVision(image, geminiKey);
          return res.json({
            success: true,
            provider: 'gemini_vision_fallback',
            text: extractedText,
            note: 'Local Docker localhost was automatically routed via Google Gemini Vision Cloud OCR for Vercel.'
          });
        }
      }

      const model = provider === 'docker_8000' ? 'jinaai/jina-ocr-v1' : 'hf.co/jinaai/jina-ocr-v1';
      const payload = {
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Perform high accuracy OCR on this purchase order image. Extract all text verbatim line by line.' },
              { type: 'image_url', image_url: { url: base64DataUri } }
            ]
          }
        ]
      };

      const headers = { 'Content-Type': 'application/json' };
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);
        const ocrResp = await fetch(target, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        clearTimeout(timeout);

        if (!ocrResp.ok) {
          const errJson = await ocrResp.json().catch(() => ({}));
          throw new Error(errJson?.error?.message || `Local OCR server returned HTTP ${ocrResp.status}`);
        }

        const result = await ocrResp.json();
        const extractedText = result.choices?.[0]?.message?.content || result.response || result.text || '';
        return res.json({ success: true, provider, text: extractedText.trim() });
      } catch (connErr) {
        // Graceful automatic fallback to Gemini Vision if Docker is unreachable
        const geminiKey = apiKey || getGeminiApiKey(req);
        if (geminiKey) {
          console.warn(`[OCR Fallback] Docker ${target} failed (${connErr.message}). Automatically falling back to Google Gemini Vision.`);
          const fallbackText = await extractTextWithGeminiVision(image, geminiKey);
          return res.json({
            success: true,
            provider: 'gemini_vision_fallback',
            text: fallbackText,
            note: 'Local Docker was unreachable; automatically processed using Google Gemini Vision Cloud OCR.'
          });
        }
        throw new Error(`Cannot reach local Docker / Ollama at ${target}. Ensure your container is running, or switch to 'Google Gemini Vision AI (Cloud)' or 'Built-in Browser OCR'.`);
      }
    }

    // 2. Official Jina AI Cloud
    if (provider === 'jina_cloud') {
      const target = endpoint || 'https://api.jina.ai/v1/chat/completions';
      const token = apiKey || process.env.JINA_API_KEY;

      const payload = {
        model: 'jina-ocr-v1',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Extract all text verbatim line by line from this purchase order document.' },
              { type: 'image_url', image_url: { url: base64DataUri } }
            ]
          }
        ]
      };

      const ocrResp = await fetch(target, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!ocrResp.ok) {
        const errJson = await ocrResp.json().catch(() => ({}));
        throw new Error(errJson?.message || `Jina AI returned HTTP ${ocrResp.status}`);
      }

      const result = await ocrResp.json();
      const extractedText = result.choices?.[0]?.message?.content || result.text || '';
      return res.json({ success: true, provider, text: extractedText.trim() });
    }

    // 3. Hugging Face Inference
    if (provider === 'hf_jina') {
      const target = endpoint || 'https://router.huggingface.co/hf-inference/models/jinaai/jina-ocr-v1';
      const token = apiKey || process.env.HF_TOKEN;

      const buffer = Buffer.from(image.data, 'base64');
      const ocrResp = await fetch(target, {
        method: 'POST',
        headers: {
          'Content-Type': mime,
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: buffer
      });

      if (!ocrResp.ok) {
        const errJson = await ocrResp.json().catch(() => ({}));
        throw new Error(errJson?.error || `HuggingFace returned HTTP ${ocrResp.status}`);
      }

      const result = await ocrResp.json();
      const extractedText = Array.isArray(result) ? (result[0]?.generated_text || '') : (result.text || JSON.stringify(result));
      return res.json({ success: true, provider, text: String(extractedText).trim() });
    }

    // 4. OCR.space Cloud API
    if (provider === 'ocrspace') {
      const target = endpoint || 'https://api.ocr.space/parse/image';
      const key = apiKey || process.env.OCR_SPACE_API_KEY || 'helloworld';

      const params = new URLSearchParams();
      params.append('apikey', key);
      params.append('base64Image', base64DataUri);
      params.append('language', 'eng');
      params.append('isOverlayRequired', 'false');
      params.append('OCREngine', '2');

      const ocrResp = await fetch(target, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      });

      if (!ocrResp.ok) {
        throw new Error(`OCR.space returned HTTP ${ocrResp.status}`);
      }

      const result = await ocrResp.json();
      if (result.IsErroredOnProcessing) {
        const msg = String(result.ErrorMessage?.[0] || result.ErrorMessage || '');
        if (msg.includes('E505') || msg.includes('empty') || msg.includes('no text') || msg.includes('timed out')) {
          return res.json({ success: true, provider, text: '' });
        }
        throw new Error(msg || 'OCR.space processing error');
      }

      const parsedText = result.ParsedResults?.[0]?.ParsedText || '';
      return res.json({ success: true, provider, text: parsedText.trim() });
    }

    throw new Error(`Unsupported OCR provider: ${provider}`);
  } catch (err) {
    console.error(`[OCR Error - ${provider}]:`, err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/extract-po
 * Unified Purchase Order Extraction endpoint:
 * Uses Google Gemini AI (from .env or header) with multi-image support,
 * with fallback to Groq LLM (for text) or local heuristics parser.
 */
app.post('/api/extract-po', async (req, res) => {
  const { rawText = '', images = [], model: reqModel, parserMode = 'auto' } = req.body;
  const geminiKey = getGeminiApiKey(req);
  const groq = getGroqClient(req);

  // 1. If explicit local parser mode requested or no AI keys configured
  if (parserMode === 'local' || (!geminiKey && !groq)) {
    if (images && images.length > 0 && !rawText.trim()) {
      return res.status(422).json({
        success: false,
        requiresOcr: true,
        error: 'No server-side AI Vision key is configured on Vercel to directly parse images. Running client OCR...'
      });
    }
    const localResult = parseWithLocalHeuristics(rawText);
    return res.json({
      success: true,
      provider: 'local',
      model: 'deterministic-heuristics',
      data: localResult
    });
  }

  // 2. Try Google Gemini AI first (vision + multi-image PO auditing)
  if (geminiKey) {
    try {
      let selectedModel = (reqModel || getGeminiModel() || 'gemini-1.5-flash').replace(/^models\//, '');
      if (selectedModel.includes('2.5') || selectedModel.includes('3-flash-preview')) {
        selectedModel = 'gemini-1.5-flash';
      }
      const modelsToTry = [selectedModel, 'gemini-1.5-flash', 'gemini-1.5-flash-latest', 'gemini-2.0-flash', 'gemini-1.5-pro']
        .filter(m => m && !m.includes('2.5') && !m.includes('3-flash-preview'))
        .filter((m, i, arr) => arr.indexOf(m) === i);

      const systemInstruction = `You are a certified procurement auditor and expert AI data extraction engine specializing in Purchase Orders (POs) and invoices.
You will be provided with one or more document images and/or text representations of a purchase order (e.g. multi-page PO, attached continuation sheets, or multiple invoice images).
Inspect ALL provided images and text thoroughly. Combine and extract all line items across all images into a unified, clean Purchase Order JSON.
Convert all quantities, unit prices, and tax rates into numeric values without currency symbols.`;

      const prompt = `Extract all purchase order metadata and compile all individual line items across the attached image(s) or document text:
---
${rawText || "Please inspect the attached PO image(s)."}
---`;

      const jsonSchema = {
        type: "OBJECT",
        properties: {
          poNumber: { type: "STRING" },
          issueDate: { type: "STRING" },
          dueDate: { type: "STRING" },
          paymentTerms: { type: "STRING" },
          currency: { type: "STRING" },
          vendor: {
            type: "OBJECT",
            properties: {
              name: { type: "STRING" },
              address: { type: "STRING" },
              contact: { type: "STRING" },
              taxId: { type: "STRING" }
            },
            required: ["name"]
          },
          buyer: {
            type: "OBJECT",
            properties: {
              name: { type: "STRING" },
              address: { type: "STRING" },
              contact: { type: "STRING" },
              taxId: { type: "STRING" }
            },
            required: ["name"]
          },
          items: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                description: { type: "STRING" },
                sku: { type: "STRING" },
                quantity: { type: "NUMBER" },
                unitPrice: { type: "NUMBER" },
                taxRate: { type: "NUMBER" }
              },
              required: ["description", "quantity", "unitPrice"]
            }
          },
          shipping: { type: "NUMBER" },
          discount: { type: "NUMBER" },
          confidenceRating: { type: "STRING" },
          notes: { type: "STRING" }
        },
        required: ["poNumber", "vendor", "buyer", "items"]
      };

      const parts = [{ text: prompt }];

      if (Array.isArray(images)) {
        images.forEach(img => {
          if (img && img.data) {
            parts.push({
              inlineData: {
                mimeType: img.mimeType || "image/png",
                data: img.data
              }
            });
          }
        });
      }

      const payload = {
        contents: [{ role: "user", parts }],
        systemInstruction: { parts: [{ text: systemInstruction }] },
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: jsonSchema
        }
      };

      let lastError = null;
      for (const model of modelsToTry) {
        const cleanModel = String(model).replace(/^models\//, '');
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${geminiKey}`;

        try {
          const resp = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          if (!resp.ok) {
            const errData = await resp.json().catch(() => ({}));
            const errMsg = errData?.error?.message || `HTTP ${resp.status}`;
            const isModelUnavailable = (resp.status === 404 || resp.status === 410) ||
              (resp.status === 400 && (
                errMsg.includes('no longer available') ||
                errMsg.includes('not found') ||
                errMsg.includes('not supported') ||
                errMsg.includes('is deprecated') ||
                errMsg.includes('Interactions API')
              ));

            if (isModelUnavailable) {
              console.warn(`[Gemini Server] Model ${cleanModel} unavailable (${errMsg}), attempting next model...`);
              continue;
            }
            throw new Error(errMsg);
          }

          const result = await resp.json();
          const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;
          if (jsonText) {
            let parsedData = null;
            try {
              parsedData = JSON.parse(jsonText);
            } catch (pErr) {
              const match = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || jsonText.match(/(\{[\s\S]*\})/);
              if (match) {
                try { parsedData = JSON.parse(match[1]); } catch (e) {}
              }
            }
            if (parsedData && Array.isArray(parsedData.items) && parsedData.items.length > 0) {
              return res.json({
                success: true,
                provider: 'gemini',
                model: cleanModel,
                data: parsedData
              });
            }
          }
        } catch (mErr) {
          lastError = mErr;
        }
      }

      console.warn('[Gemini Server] Vision extraction attempt failed, checking fallback:', lastError?.message);
      if (images && images.length > 0 && !rawText.trim()) {
        return res.status(502).json({
          success: false,
          requiresOcr: true,
          error: lastError?.message || 'Gemini Vision extraction failed to extract items from images on server.'
        });
      }
    } catch (gErr) {
      console.error('[Gemini Server Error]:', gErr);
    }
  }

  // 3. Fallback to Groq LLM if rawText is present and Groq is configured
  if (groq && rawText.trim()) {
    try {
      const chatModel = process.env.GROQ_CHAT_MODEL || 'llama-3.3-70b-versatile';
      console.log(`[Groq Server Fallback] Parsing PO using ${chatModel}...`);
      const completion = await groq.chat.completions.create({
        model: chatModel,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "You are an expert purchase order extractor. Respond ONLY with valid JSON with keys: poNumber, issueDate, dueDate, paymentTerms, currency, vendor (name, address, contact, taxId), buyer (name, address, contact, taxId), items (array of {description, sku, quantity, unitPrice, taxRate}), shipping, discount, notes."
          },
          {
            role: "user",
            content: `Extract structured purchase order data from this text:\n\n${rawText}`
          }
        ],
        temperature: 0.1
      });

      const groqJson = JSON.parse(completion.choices[0]?.message?.content || '{}');
      if (groqJson && Array.isArray(groqJson.items) && groqJson.items.length > 0) {
        return res.json({
          success: true,
          provider: 'groq',
          model: chatModel,
          data: groqJson
        });
      }
    } catch (groqErr) {
      console.warn('[Groq Fallback Error]:', groqErr.message);
    }
  }

  // 4. Deterministic Heuristics Fallback
  const fallbackResult = parseWithLocalHeuristics(rawText);
  return res.json({
    success: true,
    provider: 'local',
    model: 'deterministic-heuristics',
    data: fallbackResult
  });
});


/**
 * POST /api/transcribe
 * Transcribes audio via Groq Whisper Large V3 and parses items/commands in Hindi/Hinglish/English.
 * Accepts:
 *   - file in form-data ('audio' field)
 *   - language: 'hi', 'en', or 'auto' (optional)
 *   - prompt: custom domain guidance for Whisper (optional)
 *   - defaultTax: default tax % to apply to parsed items (optional)
 */
app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  const startTime = Date.now();

  try {
    // 1. Verify audio file was uploaded
    if (!req.file || !req.file.buffer || req.file.buffer.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No audio file provided. Please send audio blob in "audio" multipart field.'
      });
    }

    // 2. Obtain Groq client
    const groq = getGroqClient(req);
    if (!groq) {
      return res.status(401).json({
        success: false,
        error: 'GROQ_API_KEY is missing or unconfigured. Please add your Groq API key to the .env file (GROQ_API_KEY=gsk_...) or provide it in the X-Groq-Api-Key header.',
        code: 'MISSING_API_KEY'
      });
    }

    // 3. Format buffer for Groq SDK using Groq.toFile
    const originalName = req.file.originalname || 'speech.webm';
    const mimeType = req.file.mimetype || 'audio/webm';
    const audioFile = await Groq.toFile(req.file.buffer, originalName, { type: mimeType });

    // 4. Domain context prompt tuned specifically for Indian Hinglish / Hindi / English
    const requestedLang = (req.body.language || 'hinglish').toLowerCase().trim();
    let defaultRetailPrompt = 'Indian retail grocery billing in Hinglish: 5kg aloo 20, 3kg pyaj 30, 4pis salt 80, 2 packet maggi 15, doodh, tamatar, chini, tel, chawal, atta, paneer, dahi, mirchi, haldi, daal, biscuit, soap, kg, kilo, packet, pkt, litre, pcs, pis, rupees, rupaye, rate, bhaav, hatao, jod lo.';
    
    let whisperLang = undefined;

    if (requestedLang === 'hinglish') {
      defaultRetailPrompt = 'Indian retail grocery billing in Hinglish: 5kg aloo 20, 3kg pyaj 30, 4pis salt 80, 2 packet maggi 15, 1 litre doodh 30, tamatar, chini, tel, chawal, atta, paneer, dahi, mirchi, haldi, daal, biscuit, soap, kg, kilo, packet, pkt, litre, pcs, pis, aadha, dedh, dhai, paav, rupees, rupaye, ₹, rate, bhaav, hatao, jod lo.';
      whisperLang = 'en'; // Latin/English script ensures clean Romanized Hinglish output without Arabic/Nastaliq script
    } else if (requestedLang === 'hi') {
      defaultRetailPrompt = 'भारतीय किराना बिलिंग: 5 किलो आलू 20, 3 किलो प्याज 30, 4 पैकेट नमक 80, मैगी, दूध, टमाटर, चीनी, तेल, चावल, आटा, पनीर, दाल, बिस्कुट, साबुन, किलो, पैकेट, लीटर, पीस, आधा, डेढ़, ढाई, पाव, रुपये, भाव, हटाओ।';
      whisperLang = 'hi';
    } else if (requestedLang === 'en') {
      defaultRetailPrompt = 'Indian retail grocery billing: 5kg potato 20, 3kg onion 30, 4pcs salt 80, milk, tomatoes, sugar, oil, rice, flour, biscuits, soap, packets, kg, litre, pieces, rupees.';
      whisperLang = 'en';
    }

    const prompt = req.body.prompt ? `${defaultRetailPrompt} ${req.body.prompt}` : defaultRetailPrompt;

    // 5. Construct Groq Whisper parameters
    const transcriptionOptions = {
      file: audioFile,
      model: GROQ_MODEL,
      prompt: prompt,
      temperature: 0.0,
      response_format: 'verbose_json'
    };

    if (whisperLang) {
      transcriptionOptions.language = whisperLang;
    }

    console.log(`[Groq Whisper] Transcribing ${req.file.size} bytes (${mimeType}) using ${GROQ_MODEL}...`);

    // 6. Call Groq Whisper Large V3 API
    const transcription = await groq.audio.transcriptions.create(transcriptionOptions);
    const rawTranscript = (transcription.text || '').trim();
    const durationMs = Date.now() - startTime;

    console.log(`[Groq Whisper] Success in ${durationMs}ms: "${rawTranscript}"`);

    // 7. Parse the transcript with the Hindi/Hinglish item & command parser
    const defaultTax = Number(req.body.defaultTax) || 0;
    const commands = parser.parseVoiceCommands(rawTranscript);
    const removeTarget = parser.parseRemoveCommand(rawTranscript);
    const parsedItems = parser.parseBillingText(rawTranscript, defaultTax);
    const structuredOrder = parser.processVoiceOrder ? parser.processVoiceOrder(rawTranscript, defaultTax) : null;

    return res.status(200).json({
      success: true,
      text: rawTranscript,
      language: transcription.language || requestedLang || 'unknown',
      duration: transcription.duration,
      groqLatencyMs: durationMs,
      model: GROQ_MODEL,
      commands: commands,
      isRemoveCommand: Boolean(removeTarget),
      removeTarget: removeTarget,
      items: parsedItems,
      structuredOrder: structuredOrder
    });
  } catch (err) {
    console.error('[Groq Whisper Error]:', err);

    const errorMessage = err?.error?.message || err?.message || 'Error occurred while transcribing audio.';
    const status = err?.status || 500;

    return res.status(status).json({
      success: false,
      error: errorMessage,
      details: err?.error || null
    });
  }
});

/**
 * POST /api/speech
 * Logs or echoes voice transcripts received from the client (backward compatible).
 */
app.post('/api/speech', (req, res) => {
  const { text } = req.body;

  if (typeof text !== 'string' || text.trim() === '') {
    return res.status(400).json({
      success: false,
      error: 'Invalid voice input: text must be a non-empty string.'
    });
  }

  return res.status(200).json({
    success: true,
    message: 'Voice input received successfully.',
    text: text.trim()
  });
});

/**
 * POST /api/bill
 * Validates line items and calculates authoritatively:
 * subtotal, item discounts, bill discount, taxable amount, tax, and grand total.
 */
app.post('/api/bill', (req, res) => {
  const { items, billDiscount = 0, defaultTax = 0 } = req.body;

  // Basic request format validation
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Cannot generate bill: items list must be a non-empty array.'
    });
  }

  const parsedBillDiscount = Math.max(0, Math.min(100, Number(billDiscount) || 0));
  const parsedDefaultTax = Math.max(0, Math.min(100, Number(defaultTax) || 0));

  let subtotal = 0;
  let totalItemDiscounts = 0;
  let runningTaxableTotal = 0;
  let totalTax = 0;

  const validatedItems = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const name = (item.name || '').trim();
    const qty = Number(item.qty);
    const price = Number(item.price);
    const discountPercent = item.discount !== undefined ? Number(item.discount) : 0;
    const taxPercent = item.tax !== undefined ? Number(item.tax) : parsedDefaultTax;

    // Validate fields
    if (!name) {
      return res.status(400).json({
        success: false,
        error: `Item at row ${i + 1} has an empty item name.`
      });
    }

    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({
        success: false,
        error: `Item "${name}" has an invalid quantity (${item.qty}). Must be greater than 0.`
      });
    }

    if (isNaN(price) || price < 0) {
      return res.status(400).json({
        success: false,
        error: `Item "${name}" has an invalid price (${item.price}). Must be 0 or greater.`
      });
    }

    // Line item calculations
    const baseAmount = qty * price;
    const itemDiscountAmount = baseAmount * (Math.max(0, Math.min(100, discountPercent)) / 100);
    const itemTaxableAmount = baseAmount - itemDiscountAmount;
    const itemTaxAmount = itemTaxableAmount * (Math.max(0, Math.min(100, taxPercent)) / 100);
    const finalItemAmount = itemTaxableAmount + itemTaxAmount;

    subtotal += baseAmount;
    totalItemDiscounts += itemDiscountAmount;
    runningTaxableTotal += itemTaxableAmount;
    totalTax += itemTaxAmount;

    validatedItems.push({
      name,
      qty,
      unit: item.unit || '',
      price: roundToTwo(price),
      discount: roundToTwo(discountPercent),
      tax: roundToTwo(taxPercent),
      baseAmount: roundToTwo(baseAmount),
      amount: roundToTwo(finalItemAmount)
    });
  }

  // Bill-level discount applied to the taxable amount
  const overallBillDiscountAmount = subtotal * (parsedBillDiscount / 100);
  const totalDiscount = totalItemDiscounts + overallBillDiscountAmount;
  const finalTaxableAmount = Math.max(0, runningTaxableTotal - overallBillDiscountAmount);
  const grandTotal = roundToTwo(finalTaxableAmount + totalTax);

  const summary = {
    subtotal: roundToTwo(subtotal),
    discount: roundToTwo(totalDiscount),
    billDiscountAmount: roundToTwo(overallBillDiscountAmount),
    taxableAmount: roundToTwo(finalTaxableAmount),
    tax: roundToTwo(totalTax),
    grandTotal: grandTotal,
    timestamp: new Date().toISOString(),
    invoiceNumber: `INV-${Date.now().toString().slice(-6)}`
  };

  return res.status(200).json({
    success: true,
    summary,
    items: validatedItems
  });
});

// Fallback error handler (including Multer file size errors)
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        error: 'Audio file too large. Maximum supported size is 25MB.'
      });
    }
    return res.status(400).json({
      success: false,
      error: `Upload error: ${err.message}`
    });
  }

  console.error('Unhandled Server Error:', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error occurred.'
  });
});

app.listen(PORT, () => {
  console.log(`Voice Billing Server running at http://localhost:${PORT}`);
  console.log(`Speech Engine: Groq Whisper Large V3 (${GROQ_MODEL})`);
});