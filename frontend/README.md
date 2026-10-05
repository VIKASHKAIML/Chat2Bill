# Chat2Bill - Frontend UI

Smart AI Voice Billing POS and Purchase Order Studio built with modern HTML5, Vanilla JavaScript, and Tailwind CSS.

---

## 🌟 Highlights

- **🎙️ AI Voice Billing POS**: High-speed live speech-to-bill recognition (Hinglish, Hindi, English).
- **📄 SmartPO Studio**: Multi-image Purchase Order data extraction with Gemini Vision AI and Built-in Browser OCR.
- **⚡ Zero Build Step Required**: Works directly in the browser or via lightweight dev server.
- **🌐 Configurable Backend Connection**: Works in tandem with the [Chat2Bill Backend API](https://github.com/VIKASHKAIML/Chat2Bill-Backend).
- **🚀 1-Click Vercel / Netlify / GitHub Pages Ready**.

---

## 📁 Project Structure

```
frontend/
├── index.html        # Voice Billing POS Application
├── smartpo.html      # SmartPO Multi-Image Extraction Studio
├── style.css         # Custom POS styling & theme
├── script.js         # Voice POS client controller
├── parser.js         # Client-side offline voice parser
├── config.js         # Backend API connection config
├── logo.png          # Chat2Bill logo
├── vercel.json       # Vercel deployment configuration
└── package.json      # Local dev server scripts
```

---

## 🚀 Getting Started Locally

### Option 1: Using Node Dev Server
```bash
cd frontend
npm start
# Opens at http://localhost:3000
```

### Option 2: Direct Browser
You can open `index.html` or `smartpo.html` directly in any web browser!

---

## 🔗 Connecting to the Backend API

By default, the frontend sends API requests to the same origin (`/api/...`).

When deploying the **Frontend** and **Backend** to separate domains or ports (e.g. Backend running on `http://localhost:5000` or `https://chat2bill-backend.vercel.app`):

### Method A: In `config.js`
Open `config.js` and set your backend URL:
```javascript
window.CHAT2BILL_CONFIG = {
  API_BASE_URL: 'https://chat2bill-backend.vercel.app' // Your deployed Backend URL
};
```

### Method B: In Browser Console / LocalStorage
You can dynamically configure the target backend anytime in the browser console:
```javascript
window.CHAT2BILL_CONFIG.setApiBaseUrl('https://chat2bill-backend.vercel.app');
```

---

## 🌐 Deploy to Vercel (1-Click)

1. Push this `frontend` directory to its own GitHub repository:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Chat2Bill Frontend UI"
   git remote add origin https://github.com/YOUR_USERNAME/Chat2Bill-Frontend.git
   git push -u origin main
   ```
2. Import the repository in [Vercel](https://vercel.com).
3. Framework Preset: **Other** (Static HTML).
4. Click **Deploy**. Vercel will deploy your frontend as a blazing-fast global edge website!

---

## 📄 License
MIT License
