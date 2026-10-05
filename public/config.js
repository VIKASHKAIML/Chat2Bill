/**
 * Chat2Bill Frontend Configuration
 * Manages the connection between the Frontend UI and Backend REST API.
 */
(function() {
  // Read configured Backend API URL from localStorage, or default to current origin (same-origin)
  const storedApiUrl = localStorage.getItem('chat2bill_api_url') || '';

  window.CHAT2BILL_CONFIG = {
    // If empty (''), API calls use relative paths (same origin).
    // When deploying frontend and backend to separate domains/ports:
    // Set this to your Backend API URL (e.g. 'http://localhost:5000' or 'https://chat2bill-backend.vercel.app')
    API_BASE_URL: storedApiUrl,

    // Helper to update backend URL at runtime
    setApiBaseUrl: function(url) {
      const clean = (url || '').trim().replace(/\/+$/, '');
      this.API_BASE_URL = clean;
      if (clean) {
        localStorage.setItem('chat2bill_api_url', clean);
      } else {
        localStorage.removeItem('chat2bill_api_url');
      }
      console.log('[Chat2Bill Config] Backend API URL set to:', clean || '(Same Origin)');
    }
  };

  /**
   * Helper function to construct full API endpoint URL
   * @param {string} endpoint e.g. '/api/extract-po'
   * @returns {string} Full URL e.g. 'https://chat2bill-backend.vercel.app/api/extract-po'
   */
  window.getApiUrl = function(endpoint) {
    const base = (window.CHAT2BILL_CONFIG && window.CHAT2BILL_CONFIG.API_BASE_URL)
      ? window.CHAT2BILL_CONFIG.API_BASE_URL.replace(/\/+$/, '')
      : '';
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
    return base ? (base + cleanEndpoint) : cleanEndpoint;
  };

  console.log('[Chat2Bill Config] Initialized. Target Backend API:', window.CHAT2BILL_CONFIG.API_BASE_URL || '(Same Origin)');
})();
