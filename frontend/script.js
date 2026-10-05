/**
 * Voice Billing Web Application - Client Controller
 * Powered by Groq Whisper Large V3 & Live Speech Parsing
 */

document.addEventListener('DOMContentLoaded', () => {
    // -------------------------------------------------------------------------
    // Central Billing State
    // -------------------------------------------------------------------------
    let billItems = [
        { id: generateId(), name: 'Maggi', normalizedName: 'maggi', category: 'Grocery', qty: 2, unit: 'packet', price: 15, discount: 0, tax: 0 },
        { id: generateId(), name: 'Pepsi', normalizedName: 'pepsi', category: 'Grocery', qty: 3, unit: 'bottle', price: 40, discount: 0, tax: 0 }
    ];

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let currentEngine = SpeechRecognition ? 'browser' : 'groq'; // Default to live browser speech streaming
    let currentLanguage = 'hinglish'; // 'hinglish', 'hi', 'en'
    let isListening = false;
    let shouldBeListening = false; // Controlled strictly by user action (Mic / Stop button)
    let accumulatedTranscript = ''; // Persists text across continuous speech recognition sessions

    function getRecognitionLang(lang) {
        if (lang === 'hi') return 'hi-IN';
        if (lang === 'hinglish') return 'en-IN';
        return 'en-IN'; // Default to Indian English / Hinglish
    }

    // MediaRecorder state for Groq Whisper
    let mediaRecorder = null;
    let audioStream = null;
    let audioChunks = [];
    let recordTimerInterval = null;
    let recordStartTime = 0;

    // Web Speech API instance
    let recognitionInstance = null;

    // Deduplication tracking
    let lastProcessedTranscript = '';
    let lastProcessedTime = 0;

    // -------------------------------------------------------------------------
    // DOM Elements
    // -------------------------------------------------------------------------
    const micButton = document.getElementById('micButton');
    const micStatusText = document.getElementById('micStatusText');
    const recordTimer = document.getElementById('recordTimer');
    const audioWaveVisualizer = document.getElementById('audioWaveVisualizer');
    const transcriptInput = document.getElementById('transcriptInput');
    const transcriptMeta = document.getElementById('transcriptMeta');
    const addToBillButton = document.getElementById('addToBillButton');
    const stopButton = document.getElementById('stopButton');
    const clearTextButton = document.getElementById('clearTextButton');
    const testSampleBtn = document.getElementById('testSampleBtn');

    const speechEngineSelect = document.getElementById('speechEngineSelect');
    if (speechEngineSelect) {
        speechEngineSelect.value = currentEngine;
    }
    const languageSelect = document.getElementById('languageSelect');
    const engineBadge = document.getElementById('engineBadge');
    const statusDot = document.getElementById('statusDot');
    const systemStatusText = document.getElementById('systemStatusText');

    const apiKeyConfigBtn = document.getElementById('apiKeyConfigBtn');
    const apiKeyModal = document.getElementById('apiKeyModal');
    const closeApiKeyModalBtn = document.getElementById('closeApiKeyModalBtn');
    const cancelApiKeyBtn = document.getElementById('cancelApiKeyBtn');
    const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
    const groqApiKeyInput = document.getElementById('groqApiKeyInput');

    const billTableBody = document.getElementById('billItemsBody');
    const addItemButton = document.getElementById('addItemButton');
    const billDiscountInput = document.getElementById('billDiscount');
    const defaultTaxInput = document.getElementById('defaultTax');

    const summarySubtotal = document.getElementById('summarySubtotal');
    const summaryDiscount = document.getElementById('summaryDiscount');
    const summaryTaxable = document.getElementById('summaryTaxable');
    const summaryTax = document.getElementById('summaryTax');
    const summaryGrandTotal = document.getElementById('summaryGrandTotal');

    const generateBillButton = document.getElementById('generateBillButton');
    const clearBillButton = document.getElementById('clearBillButton');

    const invoiceModal = document.getElementById('invoiceModal');
    const invoiceReceiptContent = document.getElementById('invoiceReceiptContent');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const modalDismissBtn = document.getElementById('modalDismissBtn');

    // -------------------------------------------------------------------------
    // Initialization & System Status
    // -------------------------------------------------------------------------
    checkGroqConfiguration();

    async function checkGroqConfiguration() {
        const storedKey = localStorage.getItem('GROQ_API_KEY') || '';
        if (groqApiKeyInput && storedKey) {
            groqApiKeyInput.value = storedKey;
        }

        try {
            const headers = {};
            if (storedKey) {
                headers['X-Groq-Api-Key'] = storedKey;
            }
            const apiUrl = (typeof window.getApiUrl === 'function') ? window.getApiUrl('/api/voice-config') : '/api/voice-config';
            const res = await fetch(apiUrl, { headers });
            const data = await res.json();

            if (statusDot && systemStatusText) {
                if (data.groqConfigured || storedKey) {
                    statusDot.className = 'status-indicator ready';
                    systemStatusText.textContent = `Groq Whisper V3 Ready`;
                    if (engineBadge && currentEngine === 'groq') {
                        engineBadge.textContent = `⚡ Groq Whisper V3`;
                        engineBadge.className = 'badge badge-ai';
                    }
                } else {
                    statusDot.className = 'status-indicator ready';
                    systemStatusText.textContent = `System Ready`;
                    if (engineBadge && currentEngine === 'groq') {
                        engineBadge.textContent = `⚠️ Groq Key Needed`;
                    }
                }
            }
        } catch (err) {
            if (statusDot && systemStatusText) {
                statusDot.className = 'status-indicator ready';
                systemStatusText.textContent = `System Ready`;
            }
        }
    }

    // -------------------------------------------------------------------------
    // Utility Functions
    // -------------------------------------------------------------------------
    function generateId() {
        return 'item_' + Math.random().toString(36).substr(2, 9);
    }

    function formatCurrency(val) {
        return '₹' + (Number(val) || 0).toFixed(2);
    }

    function escapeHtml(string) {
        if (!string) return '';
        return String(string)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function setStatus(text, recording = null) {
        if (micStatusText) {
            micStatusText.textContent = text;
        }
        const active = (recording !== null) ? Boolean(recording) : Boolean(isListening || shouldBeListening);
        if (active) {
            micButton.classList.add('listening');
            if (audioWaveVisualizer) audioWaveVisualizer.classList.remove('hidden');
            if (recordTimer) recordTimer.classList.remove('hidden');
            if (statusDot) statusDot.className = 'status-indicator recording';
        } else {
            micButton.classList.remove('listening');
            if (audioWaveVisualizer) audioWaveVisualizer.classList.add('hidden');
            if (recordTimer) recordTimer.classList.add('hidden');
            if (statusDot) statusDot.className = 'status-indicator ready';
        }
    }

    function startTimer() {
        recordStartTime = Date.now();
        if (recordTimer) recordTimer.textContent = '00:00';
        clearInterval(recordTimerInterval);
        recordTimerInterval = setInterval(() => {
            if (recordTimer) {
                const elapsed = Math.floor((Date.now() - recordStartTime) / 1000);
                const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
                const secs = String(elapsed % 60).padStart(2, '0');
                recordTimer.textContent = `${mins}:${secs}`;
            }
        }, 500);
    }

    function stopTimer() {
        clearInterval(recordTimerInterval);
        recordTimerInterval = null;
    }

    // -------------------------------------------------------------------------
    // Modular Normalization & Parsing Functions (Requirement #16)
    // -------------------------------------------------------------------------
    function normalizeItemName(name) {
        if (window.VoiceBillingParser && window.VoiceBillingParser.normalizeItemName) {
            return window.VoiceBillingParser.normalizeItemName(name);
        }
        if (!name) return '';
        let str = String(name).toLowerCase().trim();
        str = str.replace(/\s*\([^)]*\)/g, '').trim();
        str = str.replace(/^(the|item|ek|one)\s+/gi, '').trim();
        str = str.replace(/\s+(item|wala|waala)$/gi, '').trim();
        return str;
    }

    function normalizeTranscript(text) {
        if (window.VoiceBillingParser && window.VoiceBillingParser.normalizeTranscript) {
            return window.VoiceBillingParser.normalizeTranscript(text);
        }
        if (!text) return '';
        return text.toLowerCase().replace(/[.,!?;:₹]/g, ' ').replace(/\s+/g, ' ').trim();
    }

    function normalizeNumbers(text) {
        if (window.VoiceBillingParser && window.VoiceBillingParser.normalizeNumbers) {
            return window.VoiceBillingParser.normalizeNumbers(text);
        }
        return text;
    }

    function normalizeUnits(unit) {
        if (window.VoiceBillingParser && window.VoiceBillingParser.normalizeUnits) {
            return window.VoiceBillingParser.normalizeUnits(unit);
        }
        return unit;
    }

    function detectCategory(itemName) {
        if (window.VoiceBillingParser && window.VoiceBillingParser.detectCategory) {
            return window.VoiceBillingParser.detectCategory(itemName);
        }
        return 'Grocery';
    }

    function detectIntent(text) {
        if (window.VoiceBillingParser && window.VoiceBillingParser.detectIntent) {
            return window.VoiceBillingParser.detectIntent(text);
        }
        return 'ADD_ITEM';
    }

    function segmentMultipleItems(text) {
        if (window.VoiceBillingParser && window.VoiceBillingParser.segmentMultipleItems) {
            return window.VoiceBillingParser.segmentMultipleItems(text);
        }
        return [];
    }

    function extractItemData(rawQty, rawUnit1, rawName, rawUnit2, rawPrice) {
        if (window.VoiceBillingParser && window.VoiceBillingParser.extractItemData) {
            return window.VoiceBillingParser.extractItemData(rawQty, rawUnit1, rawName, rawUnit2, rawPrice);
        }
        return {
            name: rawName,
            rawName: rawName,
            normalizedName: normalizeItemName(rawName),
            category: detectCategory(rawName),
            quantity: parseFloat(rawQty) || 1,
            unit: normalizeUnits(rawUnit1 || rawUnit2 || ''),
            price: parseFloat(rawPrice) || null,
            currency: 'INR'
        };
    }

    function validateItemData(item) {
        if (window.VoiceBillingParser && window.VoiceBillingParser.validateItemData) {
            return window.VoiceBillingParser.validateItemData(item);
        }
        const missing = [];
        if (!item.name) missing.push('name');
        if (item.quantity === undefined || isNaN(item.quantity) || item.quantity <= 0) missing.push('quantity');
        if (item.price === undefined || isNaN(item.price) || item.price < 0) missing.push('price');
        return { valid: missing.length === 0, missing };
    }

    // -------------------------------------------------------------------------
    // Modular State & Execution Operations (Requirement #16)
    // -------------------------------------------------------------------------
    function matchExistingItem(targetName) {
        if (!targetName) return -1;
        const normTarget = normalizeItemName(targetName);
        // 1. Try exact normalized name match
        const exactIdx = billItems.findIndex(it => {
            if (!it.name || it.name.trim() === '') return false;
            const itNorm = it.normalizedName || normalizeItemName(it.name);
            return itNorm === normTarget;
        });
        if (exactIdx !== -1) return exactIdx;

        // 2. Substring match only if term has >= 3 chars
        if (normTarget && normTarget.length >= 3) {
            return billItems.findIndex(it => {
                if (!it.name || it.name.trim() === '') return false;
                const itNorm = it.normalizedName || normalizeItemName(it.name);
                return itNorm.includes(normTarget) || normTarget.includes(itNorm);
            });
        }
        return -1;
    }

    function executeAdd(itemData) {
        const targetRaw = itemData.rawName || itemData.name || itemData.item || '';
        const normTarget = itemData.normalizedName || normalizeItemName(targetRaw);
        const existingIndex = matchExistingItem(targetRaw);
        const defaultTax = parseFloat(defaultTaxInput.value) || 0;
        const cap = targetRaw ? (targetRaw.charAt(0).toUpperCase() + targetRaw.slice(1)) : 'Item';

        if (existingIndex !== -1) {
            // Update existing item in place - NEVER create duplicate rows!
            const existing = billItems[existingIndex];
            existing.qty = Number(itemData.quantity || itemData.qty || 1);
            if (itemData.unit) existing.unit = itemData.unit;
            if (itemData.price !== undefined && itemData.price !== null) existing.price = Number(itemData.price);
            existing.name = cap;
            renderBillTable();
            return {
                success: true,
                action: 'updated',
                message: `Updated: ${existing.name} (Qty: ${existing.qty} ${existing.unit || ''}, ₹${existing.price})`.trim()
            };
        } else {
            // Remove initial blank row if present
            billItems = billItems.filter(it => it.name && it.name.trim() !== '');

            const newItem = {
                id: generateId(),
                name: cap,
                normalizedName: normTarget,
                category: itemData.category || detectCategory(normTarget),
                qty: Number(itemData.quantity || itemData.qty || 1),
                unit: itemData.unit || null,
                price: Number(itemData.price) || 0,
                discount: 0,
                tax: defaultTax
            };
            billItems.push(newItem);
            renderBillTable();
            return {
                success: true,
                action: 'added',
                message: `Added: ${newItem.name} (Qty: ${newItem.qty} ${newItem.unit || ''}, ₹${newItem.price})`.trim()
            };
        }
    }

    function executeRemove(targetName) {
        const existingIndex = matchExistingItem(targetName);
        if (existingIndex !== -1) {
            const removed = billItems.splice(existingIndex, 1)[0];
            renderBillTable();
            // Purge deleted item references from accumulatedTranscript so continuous speech doesn't re-add it
            if (accumulatedTranscript && (targetName || removed.name)) {
                const wordsToPurge = [targetName, removed.name, removed.normalizedName].filter(Boolean);
                const esc = wordsToPurge.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
                if (esc) {
                    const purgeRegex = new RegExp(`(?:\\d+(?:\\.\\d+)?\\s*(?:[a-zA-Z\\u0900-\\u097F]+)?\\s*)?(?:${esc})[^,.]*?(?:\\d+\\s*(?:rupees|rupaye|rs|\\/-)?|delete|remove|hata\\s*do|hatao|detete|cancel)?`, 'gi');
                    accumulatedTranscript = accumulatedTranscript.replace(purgeRegex, ' ').replace(/\s+/g, ' ').trim();
                }
            }
            return {
                success: true,
                action: 'deleted',
                message: `Removed: ${removed.name}`
            };
        }
        return {
            success: false,
            action: 'not_found',
            message: `${targetName || 'Item'} is not in the bill.`
        };
    }

    function executeUpdate(targetName, updates) {
        const existingIndex = matchExistingItem(targetName);
        if (existingIndex !== -1) {
            const existing = billItems[existingIndex];
            if (updates.quantity !== undefined && !isNaN(updates.quantity)) {
                existing.qty = Number(updates.quantity);
            }
            if (updates.unit !== undefined && updates.unit) {
                existing.unit = updates.unit;
            }
            if (updates.price !== undefined && !isNaN(updates.price)) {
                existing.price = Number(updates.price);
            }
            renderBillTable();
            return {
                success: true,
                action: 'updated',
                message: `Updated: ${existing.name} -> Qty: ${existing.qty} ${existing.unit || ''}, ₹${existing.price}`.trim()
            };
        }
        return {
            success: false,
            action: 'not_found',
            message: `${targetName || 'Item'} is not in the bill.`
        };
    }

    function applyBillingCommand(command) {
        if (!command || !command.intent) {
            return { success: false, message: 'Invalid command.' };
        }

        switch (command.intent) {
            case 'CLEAR_BILL':
                billItems = [];
                renderBillTable();
                accumulatedTranscript = '';
                if (transcriptInput) transcriptInput.value = '';
                return {
                    success: true,
                    action: 'cleared',
                    message: 'Bill cleared.'
                };

            case 'ADD_ITEM':
                return executeAdd(command);

            case 'UPDATE_QUANTITY':
                return executeUpdate(command.item || command.normalizedName, {
                    quantity: command.quantity,
                    unit: command.unit
                });

            case 'UPDATE_PRICE':
                return executeUpdate(command.item || command.normalizedName, {
                    price: command.price
                });

            case 'DELETE_ITEM':
                return executeRemove(command.item || command.normalizedName);

            case 'UPDATE_ITEM':
                return executeUpdate(command.item || command.normalizedName, {
                    quantity: command.quantity,
                    unit: command.unit,
                    price: command.price
                });

            default:
                return {
                    success: false,
                    action: 'ignored',
                    message: 'Command not recognized.'
                };
        }
    }

    // -------------------------------------------------------------------------
    // Automatic Live Transcript Clearing
    // Automatically clears the live transcript box and speech buffer once items
    // have been successfully parsed and updated into the current bill.
    // -------------------------------------------------------------------------
    let clearLiveTranscriptTimer = null;

    function scheduleClearLiveTranscript(delayMs = 1000) {
        clearTimeout(clearLiveTranscriptTimer);
        clearLiveTranscriptTimer = setTimeout(() => {
            accumulatedTranscript = '';
            lastProcessedTranscript = '';
            if (transcriptInput) {
                transcriptInput.value = '';
            }
            if (transcriptMeta) {
                transcriptMeta.textContent = isListening ? '(Listening... Speak next item)' : '';
            }
        }, delayMs);
    }

    function cancelClearLiveTranscript() {
        if (clearLiveTranscriptTimer) {
            clearTimeout(clearLiveTranscriptTimer);
            clearLiveTranscriptTimer = null;
        }
    }

    /**
     * Executes parsed commands sequentially in real-time.
     * Prevents duplicate transcript processing and updates UI immediately.
     */
    function processVoiceResult(transcript, serverData = null) {
        if (!transcript || !transcript.trim()) {
            setStatus('No speech detected. Please try again.');
            return;
        }

        // Deduplication check
        const normTranscript = normalizeTranscript(transcript);
        const now = Date.now();
        if (normTranscript && normTranscript === lastProcessedTranscript && (now - lastProcessedTime) < 1200) {
            return;
        }
        lastProcessedTranscript = normTranscript;
        lastProcessedTime = now;

        // Retrieve structured order representation (Requirement #12)
        let structuredOrder = null;
        let commands = [];

        if (serverData && serverData.structuredOrder) {
            structuredOrder = serverData.structuredOrder;
            commands = serverData.commands || [];
        } else if (window.VoiceBillingParser) {
            structuredOrder = window.VoiceBillingParser.processVoiceOrder(transcript, parseFloat(defaultTaxInput.value) || 0);
            commands = structuredOrder.commands || [];
        }

        // Handle clarify action if price is missing (Requirement #13)
        if (structuredOrder && structuredOrder.action === 'clarify') {
            const missingNames = (structuredOrder.items || []).map(i => i.rawName || i.name).join(', ');
            setStatus(`Price needed for: ${missingNames}. Please speak price (e.g. "${missingNames} 20 rupees").`);
            return;
        }

        if (!commands || commands.length === 0 || (commands.length === 1 && commands[0].intent === 'UNKNOWN')) {
            return;
        }

        // Real-time item-by-item live update with resilient skipping of mismatched data
        const feedbackList = [];
        let appliedCommandsCount = 0;
        for (const cmd of commands) {
            if (!cmd || cmd.intent === 'UNKNOWN') continue;

            // For ADD_ITEM, ensure valid item name and numeric price
            if (cmd.intent === 'ADD_ITEM') {
                if (!cmd.item || isNaN(cmd.price) || cmd.price < 0) {
                    continue;
                }
            }
            if (cmd.intent === 'DELETE_ITEM') {
                if (!cmd.item || !cmd.item.trim()) continue;
            }

            const res = applyBillingCommand(cmd);
            if (res && res.message) {
                feedbackList.push(res.message);
                if (res.success && res.action !== 'ignored' && res.action !== 'not_found') {
                    appliedCommandsCount++;
                }
            }
        }

        // If some items were incomplete alongside valid items
        if (structuredOrder && Array.isArray(structuredOrder.incomplete) && structuredOrder.incomplete.length > 0) {
            const incompNames = structuredOrder.incomplete.map(i => i.rawName || i.name).join(', ');
            feedbackList.push(`Incomplete: "${incompNames}" missing price`);
        }

        if (feedbackList.length > 0) {
            setStatus(feedbackList.join(' | '));
        }

        // AUTOMATIC CLEAR: When item(s) are transcribed and live updated into the current bill,
        // automatically clear the live transcript previous data so old items don't linger
        if (appliedCommandsCount > 0) {
            accumulatedTranscript = '';
            if (transcriptMeta) {
                transcriptMeta.textContent = '(Updated in bill ✓)';
            }
            scheduleClearLiveTranscript(1000);
        }
    }

    function recognizeSpeech(engine = currentEngine) {
        if (engine === 'groq') {
            startGroqRecording();
        } else {
            startBrowserListening();
        }
    }

    // -------------------------------------------------------------------------
    // Live Input Event Listener on Transcript Box
    // Updates current bill live as text is spoken, typed, or edited!
    // -------------------------------------------------------------------------
    let liveInputTimer = null;
    transcriptInput.addEventListener('input', () => {
        clearTimeout(liveInputTimer);
        liveInputTimer = setTimeout(() => {
            const text = transcriptInput.value.trim();
            if (text) {
                processVoiceResult(text);
            }
        }, 300);
    });

    // -------------------------------------------------------------------------
    // Groq Whisper Large V3 Microphone Audio Recording
    // -------------------------------------------------------------------------
    async function startGroqRecording() {
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                useWebSpeechFallback();
                return;
            }

            shouldBeListening = true;
            isListening = true;
            audioChunks = [];
            accumulatedTranscript = '';
            lastProcessedTranscript = '';

            audioStream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
            });

            const mimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/wav'];
            let selectedType = '';
            for (const t of mimeTypes) {
                if (window.MediaRecorder && MediaRecorder.isTypeSupported(t)) {
                    selectedType = t;
                    break;
                }
            }

            mediaRecorder = new MediaRecorder(audioStream, selectedType ? { mimeType: selectedType } : undefined);

            mediaRecorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) audioChunks.push(e.data);
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: selectedType || 'audio/webm' });
                if (audioStream) {
                    audioStream.getTracks().forEach(tr => tr.stop());
                    audioStream = null;
                }
                if (audioBlob.size > 0) {
                    await sendAudioToGroqWhisper(audioBlob);
                }
            };

            mediaRecorder.start(250);
            startTimer();
            setStatus('Listening continuously... Speak items anytime. Click Stop when done.', true);

            // Also run live browser stream in background for instantaneous interim feedback
            startLiveInterimStream();
        } catch (err) {
            console.warn('MediaRecorder error, falling back to Web Speech API:', err);
            useWebSpeechFallback();
        }
    }

    function stopGroqRecording() {
        shouldBeListening = false;
        isListening = false;
        stopLiveInterimStream();
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
        stopTimer();
        setStatus('Processing speech with Groq Whisper Large V3...');
    }

    async function sendAudioToGroqWhisper(audioBlob) {
        setStatus('⚡ Transcribing with Groq Whisper Large V3...');
        if (transcriptMeta) transcriptMeta.textContent = 'Transcribing...';

        const formData = new FormData();
        const ext = audioBlob.type.includes('ogg') ? 'ogg' : (audioBlob.type.includes('wav') ? 'wav' : 'webm');
        formData.append('audio', audioBlob, `voice_${Date.now()}.${ext}`);
        formData.append('language', languageSelect ? languageSelect.value : (currentLanguage || 'hinglish'));
        formData.append('defaultTax', defaultTaxInput.value || 0);

        const storedKey = localStorage.getItem('GROQ_API_KEY') || '';
        const headers = {};
        if (storedKey) {
            headers['X-Groq-Api-Key'] = storedKey;
        }

        try {
            const apiUrl = (typeof window.getApiUrl === 'function') ? window.getApiUrl('/api/transcribe') : '/api/transcribe';
            const res = await fetch(apiUrl, {
                method: 'POST',
                headers,
                body: formData
            });

            const data = await res.json();

            if (!res.ok || !data.success) {
                if (data.code === 'MISSING_API_KEY' && apiKeyModal) {
                    setStatus('Groq API Key required.');
                    apiKeyModal.removeAttribute('hidden');
                }
                throw new Error(data.error || 'Groq Whisper transcription failed.');
            }

            const transcript = data.text || '';
            transcriptInput.value = transcript;
            if (transcriptMeta) {
                transcriptMeta.textContent = `(Whisper V3 • ${data.groqLatencyMs || 0}ms • ${data.language || 'hinglish'})`;
            }

            // Process transcript through the Voice Command Processing Layer
            processVoiceResult(transcript, data);
        } catch (err) {
            console.error('Groq Whisper error:', err);
            if (transcriptMeta) transcriptMeta.textContent = '(Error)';
            setStatus(`Groq Whisper error: ${err.message}`);
        }
    }

    // -------------------------------------------------------------------------
    // Browser Web Speech API (Live Continuous Speech Recognition)
    // -------------------------------------------------------------------------
    function initBrowserWebSpeech() {
        if (!SpeechRecognition) return;

        recognitionInstance = new SpeechRecognition();
        recognitionInstance.continuous = true;
        recognitionInstance.interimResults = true; // Provides LIVE speech results as words are spoken!
        recognitionInstance.lang = getRecognitionLang(languageSelect ? languageSelect.value : currentLanguage);

        recognitionInstance.onstart = () => {
            isListening = true;
            startTimer();
            setStatus('Listening continuously... Speak items anytime. Click Stop when done.', true);
        };

        recognitionInstance.onresult = (event) => {
            let sessionInterim = '';
            let sessionFinal = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                const res = event.results[i];
                if (res.isFinal) {
                    sessionFinal += res[0].transcript + ' ';
                } else {
                    sessionInterim += res[0].transcript + ' ';
                }
            }

            // User is actively speaking new words: cancel pending auto-clear
            const activeSpeech = (sessionFinal || sessionInterim).trim();
            if (activeSpeech) {
                cancelClearLiveTranscript();
            }

            if (sessionFinal) {
                accumulatedTranscript += sessionFinal;
            }
            const liveTranscript = (accumulatedTranscript + ' ' + sessionInterim).replace(/\s+/g, ' ').trim();

            if (liveTranscript) {
                transcriptInput.value = liveTranscript;
                if (transcriptMeta) transcriptMeta.textContent = '(Live Speech)';
                // LIVE BILL UPDATE AS YOU SPEAK!
                processVoiceResult(liveTranscript);
            }
        };

        recognitionInstance.onerror = (e) => {
            if (e.error === 'no-speech' || e.error === 'aborted') {
                return; // User silent or browser cycling, keep listening
            }
            console.warn('Browser speech recognition error:', e.error);
            if (e.error === 'not-allowed') {
                shouldBeListening = false;
                isListening = false;
                setStatus('Microphone access denied. Please click the lock or camera/mic icon in your browser address bar to allow microphone access.', false);
            } else if (e.error === 'network') {
                setStatus('Network issue with speech recognition. Switching to Groq Whisper...');
                currentEngine = 'groq';
                if (speechEngineSelect) speechEngineSelect.value = 'groq';
                stopBrowserListening();
                startGroqRecording();
            } else {
                setStatus(`Speech recognition status: ${e.error}`);
            }
        };

        recognitionInstance.onend = () => {
            // Keep continuously listening until user explicitly clicks Stop!
            if (shouldBeListening && currentEngine === 'browser') {
                setTimeout(() => {
                    if (shouldBeListening && currentEngine === 'browser') {
                        try {
                            recognitionInstance.start();
                        } catch (err) {
                            setTimeout(() => {
                                if (shouldBeListening && currentEngine === 'browser') {
                                    try { recognitionInstance.start(); } catch (e) {}
                                }
                            }, 250);
                        }
                    }
                }, 50);
            } else if (!shouldBeListening) {
                isListening = false;
                stopTimer();
                setStatus('Ready. Tap microphone to speak.');
            }
        };
    }

    initBrowserWebSpeech();

    // Secondary interim helper for Groq mode
    let interimRecognizer = null;
    function startLiveInterimStream() {
        if (!SpeechRecognition) return;
        try {
            if (interimRecognizer) {
                try { interimRecognizer.abort(); } catch (e) {}
            }
            interimRecognizer = new SpeechRecognition();
            interimRecognizer.continuous = true;
            interimRecognizer.interimResults = true;
            interimRecognizer.lang = getRecognitionLang(languageSelect ? languageSelect.value : currentLanguage);
            interimRecognizer.onresult = (event) => {
                let sessionInterim = '';
                let sessionFinal = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    const res = event.results[i];
                    if (res.isFinal) {
                        sessionFinal += res[0].transcript + ' ';
                    } else {
                        sessionInterim += res[0].transcript + ' ';
                    }
                }

                const activeSpeech = (sessionFinal || sessionInterim).trim();
                if (activeSpeech) {
                    cancelClearLiveTranscript();
                }

                if (sessionFinal) {
                    accumulatedTranscript += sessionFinal;
                }
                const live = (accumulatedTranscript + ' ' + sessionInterim).replace(/\s+/g, ' ').trim();
                if (live) {
                    transcriptInput.value = live;
                    if (transcriptMeta) transcriptMeta.textContent = '(Live...)';
                    processVoiceResult(live);
                }
            };

            interimRecognizer.onerror = (e) => {
                if (e.error === 'no-speech' || e.error === 'aborted') return;
            };

            interimRecognizer.onend = () => {
                // Auto-reconnect continuously while Groq is recording until user clicks Stop!
                if (shouldBeListening && currentEngine === 'groq') {
                    setTimeout(() => {
                        if (shouldBeListening && currentEngine === 'groq') {
                            try {
                                interimRecognizer.start();
                            } catch (e) {
                                setTimeout(() => {
                                    if (shouldBeListening && currentEngine === 'groq') {
                                        try { interimRecognizer.start(); } catch (err) {}
                                    }
                                }, 250);
                            }
                        }
                    }, 50);
                }
            };

            interimRecognizer.start();
        } catch (e) {
            console.warn('Interim recognition stream not available:', e);
        }
    }

    function stopLiveInterimStream() {
        if (interimRecognizer) {
            try { interimRecognizer.stop(); } catch (e) { }
            interimRecognizer = null;
        }
    }

    function startBrowserListening() {
        if (!recognitionInstance) {
            initBrowserWebSpeech();
        }
        if (!recognitionInstance) {
            console.warn('Live Web Speech is not supported in this browser. Switching to Groq Whisper.');
            currentEngine = 'groq';
            if (speechEngineSelect) speechEngineSelect.value = 'groq';
            startGroqRecording();
            return;
        }
        shouldBeListening = true;
        isListening = true;
        accumulatedTranscript = '';
        lastProcessedTranscript = '';
        setStatus('Listening continuously... Speak items anytime.', true);
        startTimer();
        try {
            recognitionInstance.lang = getRecognitionLang(languageSelect ? languageSelect.value : currentLanguage);
            recognitionInstance.start();
        } catch (e) {
            console.warn('Browser speech recognition start note:', e.message);
        }
    }

    function stopBrowserListening() {
        shouldBeListening = false;
        isListening = false;
        if (recognitionInstance) {
            try { recognitionInstance.stop(); } catch (e) {}
        }
        stopTimer();
        setStatus('Stopped listening.');
    }

    function useWebSpeechFallback() {
        if (!SpeechRecognition) {
            setStatus('Speech recognition not supported in this browser.');
            micButton.disabled = true;
            return;
        }
        startBrowserListening();
    }

    // -------------------------------------------------------------------------
    // Voice Event Listeners
    // -------------------------------------------------------------------------
    if (speechEngineSelect) {
        speechEngineSelect.addEventListener('change', () => {
            currentEngine = speechEngineSelect.value;
            if (currentEngine === 'groq') {
                if (engineBadge) {
                    engineBadge.textContent = '⚡ Groq Whisper V3';
                    engineBadge.className = 'badge badge-ai';
                }
                setStatus('Engine: Groq Whisper Large V3. Tap mic to speak.');
            } else {
                if (engineBadge) {
                    engineBadge.textContent = '🌐 Live Browser Speech';
                    engineBadge.className = 'badge';
                }
                setStatus('Engine: Live Browser Speech. Real-time streaming active.');
            }
        });
    }

    if (languageSelect) {
        languageSelect.addEventListener('change', () => {
            currentLanguage = languageSelect.value;
            if (recognitionInstance) {
                recognitionInstance.lang = getRecognitionLang(currentLanguage);
            }
        });
    }

    micButton.addEventListener('click', () => {
        if (isListening || shouldBeListening) {
            if (currentEngine === 'groq') {
                stopGroqRecording();
            } else {
                stopBrowserListening();
            }
        } else {
            if (currentEngine === 'groq') {
                startGroqRecording();
            } else {
                startBrowserListening();
            }
        }
    });

    stopButton.addEventListener('click', () => {
        if (isListening || shouldBeListening) {
            if (currentEngine === 'groq') {
                stopGroqRecording();
            } else {
                stopBrowserListening();
            }
        } else {
            setStatus('Not listening. Tap microphone to start.');
        }
    });

    clearTextButton.addEventListener('click', () => {
        transcriptInput.value = '';
        accumulatedTranscript = '';
        lastProcessedTranscript = '';
        if (transcriptMeta) transcriptMeta.textContent = '';
    });

    addToBillButton.addEventListener('click', () => {
        const rawText = transcriptInput.value.trim();
        if (!rawText) {
            alert('Transcript is empty. Speak or type items first.');
            return;
        }
        processVoiceResult(rawText);
    });

    // Test sample inputs including user requested format
    const sampleSentences = [
        '3 piece laptop teen Hazar rupee',
        '2 pcs laptop 3000 rupees 5 kg aloo 200 rupaye sawa kilo pyaz 100 rupees 3 pieces mouse 500 रुपए',
        '3 piece laptop teen hazar paanch sau rupee 5 kg aloo ek sau rupaye',
        '5 kg aloo 20 rupees 3 kg pyaz 20 rupees',
        '5 kg aloo 20 rupaye 3 kg pyaz 20 rupaye 2 packet biscuit 60 rupaye',
        'aloo ki quantity 10 kg kar do',
        'aloo ka price 50 rupees kar do',
        'aloo hata do',
        '5 kilo aloo 20 rupaye 2 kilo tamatar 40 rupaye',
        '2 packet biscuit 60 rupees 5 kg rice 300 rupees',
        '3 pieces charger 900 rupees 2 earphone 500 rupees',
        '2 paracetamol strip 50 rupees',
        '5 kg aloo 20 rupees 3 kg pyaz 20 rupees 2 packet biscuit 60 rupees 1 litre milk 60 rupees',
        'bhai 5 kilo aloo 20 rupaye 3 kilo pyaz 30 rupaye',
        'aloo hata do aur pyaz ki quantity 5 kg kar do'
    ];
    let sampleIdx = 0;

    if (testSampleBtn) {
        testSampleBtn.addEventListener('click', () => {
            const sample = sampleSentences[sampleIdx % sampleSentences.length];
            sampleIdx++;
            transcriptInput.value = sample;
            if (transcriptMeta) transcriptMeta.textContent = '(Sample Test)';
            processVoiceResult(sample);
        });
    }

    // -------------------------------------------------------------------------
    // Groq API Key Configuration Modal
    // -------------------------------------------------------------------------
    if (apiKeyConfigBtn && apiKeyModal) {
        apiKeyConfigBtn.addEventListener('click', () => {
            if (groqApiKeyInput) {
                groqApiKeyInput.value = localStorage.getItem('GROQ_API_KEY') || '';
            }
            apiKeyModal.removeAttribute('hidden');
            if (groqApiKeyInput) groqApiKeyInput.focus();
        });

        function closeApiKeyModal() {
            apiKeyModal.setAttribute('hidden', '');
        }

        if (closeApiKeyModalBtn) closeApiKeyModalBtn.addEventListener('click', closeApiKeyModal);
        if (cancelApiKeyBtn) cancelApiKeyBtn.addEventListener('click', closeApiKeyModal);

        if (saveApiKeyBtn) {
            saveApiKeyBtn.addEventListener('click', async () => {
                const key = groqApiKeyInput ? groqApiKeyInput.value.trim() : '';
                if (key) {
                    localStorage.setItem('GROQ_API_KEY', key);
                } else {
                    localStorage.removeItem('GROQ_API_KEY');
                }
                closeApiKeyModal();
                await checkGroqConfiguration();
                alert('Groq API Key saved successfully in your browser!');
            });
        }
    }

    // -------------------------------------------------------------------------
    // Billing Table Rendering & Calculations
    // -------------------------------------------------------------------------
    function calculateLineAmount(item) {
        const base = Number(item.qty) * Number(item.price);
        const discount = base * ((Number(item.discount) || 0) / 100);
        const taxable = base - discount;
        const tax = taxable * ((Number(item.tax) || 0) / 100);
        return taxable + tax;
    }

    function calculateBillTotals() {
        let subtotal = 0;
        let itemDiscountsTotal = 0;
        let taxableTotal = 0;
        let taxTotal = 0;

        const overallDiscountPct = Math.max(0, Math.min(100, parseFloat(billDiscountInput.value) || 0));

        billItems.forEach(item => {
            const base = Number(item.qty) * (Number(item.price) || 0);
            const discAmt = base * ((Number(item.discount) || 0) / 100);
            const taxable = base - discAmt;
            const taxAmt = taxable * ((Number(item.tax) || 0) / 100);

            subtotal += base;
            itemDiscountsTotal += discAmt;
            taxableTotal += taxable;
            taxTotal += taxAmt;
        });

        const billLevelDiscountAmt = subtotal * (overallDiscountPct / 100);
        const grandTaxable = Math.max(0, taxableTotal - billLevelDiscountAmt);
        const grandDiscount = itemDiscountsTotal + billLevelDiscountAmt;
        const grandTotal = grandTaxable + taxTotal;

        summarySubtotal.textContent = formatCurrency(subtotal);
        summaryDiscount.textContent = '-' + formatCurrency(grandDiscount);
        summaryTaxable.textContent = formatCurrency(grandTaxable);
        summaryTax.textContent = formatCurrency(taxTotal);
        summaryGrandTotal.textContent = formatCurrency(grandTotal);
    }

    function renderBillTable() {
        billTableBody.innerHTML = '';

        if (billItems.length === 0) {
            const emptyRow = document.createElement('tr');
            emptyRow.innerHTML = `
                <td colspan="8" style="text-align: center; color: var(--muted-text); padding: 24px;">
                    No items added yet. Speak items (e.g. <em>5kg aloo 20 rupees 3kg pyaj 20 rupees</em>) or click <strong>+ Add item</strong>.
                </td>
            `;
            billTableBody.appendChild(emptyRow);
            calculateBillTotals();
            return;
        }

        billItems.forEach((item) => {
            const tr = document.createElement('tr');
            const isMissingPrice = !item.price || Number(item.price) <= 0;
            if (isMissingPrice) {
                tr.classList.add('warning-row');
            }

            tr.innerHTML = `
                <td>
                    <input 
                        type="text" 
                        class="table-input item-name-input ${!item.name ? 'input-error' : ''}" 
                        value="${escapeHtml(item.name)}" 
                        placeholder="Item name"
                        data-id="${item.id}"
                        data-field="name">
                    ${isMissingPrice ? '<span class="row-warning-text">⚠ Enter price</span>' : ''}
                </td>
                <td>
                    <div class="qty-control">
                        <button type="button" class="qty-btn btn-qty-minus" data-id="${item.id}" aria-label="Decrease quantity">-</button>
                        <input 
                            type="number" 
                            class="qty-input" 
                            min="0.1" 
                            step="any"
                            value="${item.qty}" 
                            data-id="${item.id}" 
                            data-field="qty">
                        <button type="button" class="qty-btn btn-qty-plus" data-id="${item.id}" aria-label="Increase quantity">+</button>
                    </div>
                </td>
                <td>
                    <input 
                        type="text" 
                        class="table-input" 
                        value="${escapeHtml(item.unit || '')}" 
                        placeholder="kg, pcs, pkt"
                        data-id="${item.id}" 
                        data-field="unit">
                </td>
                <td>
                    <input 
                        type="number" 
                        class="table-input ${isMissingPrice ? 'input-error' : ''}" 
                        min="0" 
                        step="0.5" 
                        value="${item.price !== undefined && item.price !== null ? item.price : ''}" 
                        placeholder="0.00"
                        data-id="${item.id}" 
                        data-field="price">
                </td>
                <td>
                    <input 
                        type="number" 
                        class="table-input" 
                        min="0" 
                        max="100" 
                        step="0.5" 
                        value="${item.discount || 0}" 
                        data-id="${item.id}" 
                        data-field="discount">
                </td>
                <td>
                    <input 
                        type="number" 
                        class="table-input" 
                        min="0" 
                        max="100" 
                        step="0.5" 
                        value="${item.tax !== undefined ? item.tax : 0}" 
                        data-id="${item.id}" 
                        data-field="tax">
                </td>
                <td style="font-weight: 600;">
                    ${formatCurrency(calculateLineAmount(item))}
                </td>
                <td>
                    <button 
                        type="button" 
                        class="btn-remove" 
                        data-id="${item.id}" 
                        title="Remove item">Remove</button>
                </td>
            `;

            billTableBody.appendChild(tr);
        });

        calculateBillTotals();
    }

    // -------------------------------------------------------------------------
    // Table Event Delegation
    // -------------------------------------------------------------------------
    billTableBody.addEventListener('input', (e) => {
        const target = e.target;
        const id = target.getAttribute('data-id');
        const field = target.getAttribute('data-field');

        if (!id || !field) return;

        const item = billItems.find(it => it.id === id);
        if (!item) return;

        if (field === 'name') {
            item.name = target.value;
            item.normalizedName = normalizeItemName(target.value);
        } else if (field === 'unit') {
            item.unit = target.value.trim();
        } else if (field === 'qty') {
            const parsed = parseFloat(target.value);
            item.qty = isNaN(parsed) || parsed <= 0 ? 1 : parsed;
        } else if (field === 'price') {
            const parsed = parseFloat(target.value);
            item.price = isNaN(parsed) ? 0 : parsed;
        } else if (field === 'discount') {
            const parsed = parseFloat(target.value);
            item.discount = isNaN(parsed) ? 0 : Math.max(0, Math.min(100, parsed));
        } else if (field === 'tax') {
            const parsed = parseFloat(target.value);
            item.tax = isNaN(parsed) ? 0 : Math.max(0, Math.min(100, parsed));
        }

        renderBillTable();
    });

    billTableBody.addEventListener('click', (e) => {
        const target = e.target;
        const id = target.getAttribute('data-id');
        if (!id) return;

        if (target.classList.contains('btn-qty-minus')) {
            const item = billItems.find(it => it.id === id);
            if (item && item.qty > 1) {
                item.qty = Number((item.qty - 1).toFixed(2));
                renderBillTable();
            }
        } else if (target.classList.contains('btn-qty-plus')) {
            const item = billItems.find(it => it.id === id);
            if (item) {
                item.qty = Number((item.qty + 1).toFixed(2));
                renderBillTable();
            }
        } else if (target.classList.contains('btn-remove')) {
            billItems = billItems.filter(it => it.id !== id);
            renderBillTable();
        }
    });

    // Bill Settings Events
    billDiscountInput.addEventListener('input', calculateBillTotals);
    defaultTaxInput.addEventListener('input', () => {
        const defTax = parseFloat(defaultTaxInput.value) || 0;
        billItems.forEach(it => {
            it.tax = defTax;
        });
        renderBillTable();
    });

    // Add manual blank item row
    addItemButton.addEventListener('click', () => {
        billItems.push({
            id: generateId(),
            name: '',
            normalizedName: '',
            qty: 1,
            unit: null,
            price: 0,
            discount: 0,
            tax: parseFloat(defaultTaxInput.value) || 0
        });
        renderBillTable();
    });

    // Clear bill
    clearBillButton.addEventListener('click', () => {
        if (billItems.length > 0 && !confirm('Are you sure you want to clear the bill?')) {
            return;
        }
        billItems = [];
        billDiscountInput.value = 0;
        defaultTaxInput.value = 0;
        renderBillTable();
    });

    // -------------------------------------------------------------------------
    // Invoice Submission to Server
    // -------------------------------------------------------------------------
    generateBillButton.addEventListener('click', async () => {
        const validItems = billItems.filter(it => it.name.trim() !== '');

        if (validItems.length === 0) {
            alert('Cannot generate bill: Please add at least one item with a valid name.');
            return;
        }

        const missingPriceItem = validItems.find(it => !it.price || Number(it.price) <= 0);
        if (missingPriceItem) {
            alert(`Item "${missingPriceItem.name}" has no price. Please specify price before generating.`);
            return;
        }

        const payload = {
            items: validItems.map(it => ({
                name: it.name,
                qty: Number(it.qty),
                unit: it.unit || '',
                price: Number(it.price),
                discount: Number(it.discount || 0),
                tax: Number(it.tax || 0)
            })),
            billDiscount: parseFloat(billDiscountInput.value) || 0,
            defaultTax: parseFloat(defaultTaxInput.value) || 0
        };

        generateBillButton.disabled = true;
        generateBillButton.textContent = 'Generating...';

        try {
            const apiUrl = (typeof window.getApiUrl === 'function') ? window.getApiUrl('/api/bill') : '/api/bill';
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Server rejected bill payload.');
            }

            displayReceiptModal(data.summary, data.items);
        } catch (err) {
            console.error(err);
            alert(`Bill Generation Failed: ${err.message}`);
        } finally {
            generateBillButton.disabled = false;
            generateBillButton.textContent = 'Generate invoice';
        }
    });

    // -------------------------------------------------------------------------
    // Receipt Modal Rendering
    // -------------------------------------------------------------------------
    function displayReceiptModal(summary, items) {
        let rowsHtml = '';
        items.forEach(it => {
            rowsHtml += `
                <tr>
                    <td>${escapeHtml(it.name)}</td>
                    <td style="text-align: center;">${it.qty}</td>
                    <td style="text-align: center;">${escapeHtml(it.unit || '-')}</td>
                    <td style="text-align: right;">${formatCurrency(it.price)}</td>
                    <td style="text-align: right;">${formatCurrency(it.amount)}</td>
                </tr>
            `;
        });

        invoiceReceiptContent.innerHTML = `
            <div class="receipt">
                <div class="receipt-head">
                    <div style="display:flex; align-items:center; justify-content:center; gap:8px; margin-bottom:6px;">
                        <img src="logo.png" alt="Chat2Bill" style="width:28px; height:28px; border-radius:6px; object-fit:cover;">
                        <span style="font-weight:700; font-size:1.15rem; color:#1e293b; letter-spacing:-0.02em;">Chat2Bill</span>
                    </div>
                    <h4>RETAIL STORE TAX INVOICE</h4>
                    <p style="font-size: 0.8rem; color: var(--muted-text);">Thank you for shopping with us!</p>
                </div>
                <div class="receipt-meta">
                    <span><strong>Invoice:</strong> ${summary.invoiceNumber}</span>
                    <span><strong>Date:</strong> ${new Date(summary.timestamp).toLocaleDateString()}</span>
                </div>
                <table class="receipt-table">
                    <thead>
                        <tr>
                            <th style="text-align: left;">Item</th>
                            <th style="text-align: center;">Qty</th>
                            <th style="text-align: center;">Unit</th>
                            <th style="text-align: right;">Price</th>
                            <th style="text-align: right;">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>
                <div class="receipt-totals">
                    <div class="receipt-total-row">
                        <span>Subtotal:</span>
                        <span>${formatCurrency(summary.subtotal)}</span>
                    </div>
                    <div class="receipt-total-row">
                        <span>Discount:</span>
                        <span class="text-danger">-${formatCurrency(summary.discount)}</span>
                    </div>
                    <div class="receipt-total-row">
                        <span>Taxable Amount:</span>
                        <span>${formatCurrency(summary.taxableAmount)}</span>
                    </div>
                    <div class="receipt-total-row">
                        <span>Tax:</span>
                        <span>${formatCurrency(summary.tax)}</span>
                    </div>
                    <div class="receipt-total-row grand">
                        <span>Grand Total:</span>
                        <span>${formatCurrency(summary.grandTotal)}</span>
                    </div>
                </div>
            </div>
        `;

        invoiceModal.removeAttribute('hidden');
    }

    function closeModal() {
        invoiceModal.setAttribute('hidden', '');
    }

    closeModalBtn.addEventListener('click', closeModal);
    modalDismissBtn.addEventListener('click', closeModal);
    invoiceModal.addEventListener('click', (e) => {
        if (e.target === invoiceModal) closeModal();
    });

    // -------------------------------------------------------------------------
    // SmartPO Studio Import Integration
    // -------------------------------------------------------------------------
    const importBanner = document.getElementById('importBanner');
    const importBannerTitle = document.getElementById('importBannerTitle');
    const importBannerDesc = document.getElementById('importBannerDesc');
    const dismissImportBanner = document.getElementById('dismissImportBanner');

    if (dismissImportBanner && importBanner) {
        dismissImportBanner.addEventListener('click', () => {
            importBanner.classList.add('hidden');
        });
    }

    function checkSmartPoImport() {
        const transferData = localStorage.getItem('chat2bill_po_transfer');
        if (!transferData) return;

        try {
            const parsed = JSON.parse(transferData);
            if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
                billItems = parsed.items.map(item => {
                    const desc = item.description || 'Imported Item';
                    return {
                        id: generateId(),
                        name: desc,
                        normalizedName: normalizeItemName(desc),
                        category: 'Procurement',
                        qty: parseFloat(item.quantity) || 1,
                        unit: 'pcs',
                        price: parseFloat(item.unitPrice) || 0,
                        discount: 0,
                        tax: parseFloat(item.taxRate) || 0
                    };
                });

                if (importBanner && importBannerTitle && importBannerDesc) {
                    importBannerTitle.textContent = `Purchase Order ${parsed.poNumber || ''} Imported!`;
                    importBannerDesc.textContent = `Loaded ${billItems.length} line items from ${parsed.vendor || 'Supplier'} directly into current bill.`;
                    importBanner.classList.remove('hidden');
                }

                localStorage.removeItem('chat2bill_po_transfer');

                if (window.history && window.history.replaceState) {
                    const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
                    window.history.replaceState({ path: cleanUrl }, '', cleanUrl);
                }
            }
        } catch (e) {
            console.error('Error importing SmartPO items:', e);
        }
    }

    checkSmartPoImport();

    // Initial render
    renderBillTable();
});