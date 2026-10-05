# Chat2Bill - Backend REST API Server

High-performance Node.js / Express AI Engine powering **Chat2Bill** (Voice Billing POS and SmartPO Purchase Order extraction).

---

## 🚀 Features

- **Google Gemini AI Vision**: Multi-image PO parsing and structured data extraction.
- **Groq Whisper Large V3**: Real-time Hindi, Hinglish, and English voice transcription.
- **Deterministic Heuristic Engine**: Resilient offline parser for tabular OCR invoices and PO line items.
- **Universal OCR Proxy**: Flexible OCR integration (Docker, Gemini Vision, OCR.space).
- **CORS Enabled**: Out-of-the-box support for standalone Frontend clients on any domain/port.
- **1-Click Vercel / Render / Railway Ready**: Fully configured with `vercel.json`.

---

## 🛠️ Tech Stack

- **Runtime**: Node.js 18+ / Express
- **AI Providers**: Groq SDK, Google Generative AI (Gemini)
- **Audio Processing**: Multer (in-memory 25MB audio buffers)
- **CORS**: Enabled for all origins

---

## 📦 Installation & Local Setup

1. **Navigate to the Backend directory**:
   ```bash
   cd backend
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   Add your API keys:
   - `GEMINI_API_KEY`: [Get from Google AI Studio](https://aistudio.google.com/app/apikey)
   - `GROQ_API_KEY`: [Get from Groq Console](https://console.groq.com/keys)
   - `PORT`: `5000` (or your preferred port)

4. **Run the API server**:
   ```bash
   # Development with auto-reload:
   npm run dev

   # Production:
   npm start
   ```

5. **Run Automated Test Suite**:
   ```bash
   npm test
   ```

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` or `/api/health` | Health check & API status |
| `POST` | `/api/extract-po` | Multi-image & text Purchase Order extraction |
| `POST` | `/api/ocr` | Optical Character Recognition on uploaded document images |
| `POST` | `/api/ocr/test` | Connectivity test for OCR provider |
| `POST` | `/api/transcribe` | Audio file speech-to-text (Whisper Large V3) |
| `POST` | `/api/bill` | Server-side invoice and bill calculation |
| `GET` | `/api/voice-config` | Check configured voice AI provider status |
| `GET` | `/api/ai-config` | Check configured Gemini AI status |

---

## 🌐 Deploy to Vercel (1-Click)

1. Push this `backend` repository to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Chat2Bill Backend API"
   git remote add origin https://github.com/YOUR_USERNAME/Chat2Bill-Backend.git
   git push -u origin main
   ```
2. Import the repository in [Vercel](https://vercel.com).
3. Under **Environment Variables**, add:
   - `GEMINI_API_KEY`
   - `GROQ_API_KEY`
4. Click **Deploy**. Vercel will deploy the serverless API endpoints instantly!

---

## 📄 License
MIT License
