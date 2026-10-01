/**
 * Voice Billing Web Application
 * Handles Web Speech API, rule-based parsing, billing calculations,
 * reactive table manipulation, and API synchronization with Express.
 */

document.addEventListener('DOMContentLoaded', () => {
    // -------------------------------------------------------------------------
    // Spoken Number Dictionary (English & Hindi/Hinglish to Numeric Digits)
    // -------------------------------------------------------------------------
    const spokenNumberMap = {
        // English singles & teens
        'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4,
        'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9,
        'ten': 10, 'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14,
        'fifteen': 15, 'sixteen': 16, 'seventeen': 17, 'eighteen': 18, 'nineteen': 19,
        // English tens
        'twenty': 20, 'thirty': 30, 'forty': 40, 'fifty': 50,
        'sixty': 60, 'seventy': 70, 'eighty': 80, 'ninety': 90, 'hundred': 100,
        // Hindi / Hinglish numbers
        'shunya': 0, 'ek': 1, 'do': 2, 'teen': 3, 'char': 4, 'chaar': 4,
        'paanch': 5, 'panch': 5, 'chhe': 6, 'chhah': 6, 'saat': 7, 'aath': 8,
        'nau': 9, 'das': 10, 'gyarah': 11, 'barah': 12, 'terah': 13,
        'chaudah': 14, 'pandrah': 15, 'solah': 16, 'satrah': 17, 'atharah': 18,
        'unnis': 19, 'bees': 20, 'ikkees': 21, 'baees': 22, 'teees': 23,
        'chaubees': 24, 'pachees': 25, 'pachis': 25, 'chhabees': 26, 'sattaees': 27,
        'atthaees': 28, 'untees': 29, 'tees': 30, 'chalis': 40, 'pachaas': 50,
        'pachas': 50, 'saath': 60, 'sattar': 70, 'assi': 80, 'nabbe': 90, 'sau': 100
    };

    // Helper to convert spoken words into numeric figures
    function normalizeSpokenNumbers(text) {
        if (!text) return '';
        let processed = text.toLowerCase();

        // Replace combined compound numbers (e.g. "twenty five" -> "25")
        const compoundTens = ['twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
        compoundTens.forEach((tenWord, idx) => {
            const tenBase = (idx + 2) * 10;
            for (let unit = 1; unit <= 9; unit++) {
                const unitWords = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
                const combo = `${tenWord} ${unitWords[unit - 1]}`;
                const regex = new RegExp(`\\b${combo}\\b`, 'gi');
                processed = processed.replace(regex, (tenBase + unit).toString());
            }
        });

        // Replace individual number words
        for (const [word, val] of Object.entries(spokenNumberMap)) {
            const reg = new RegExp(`\\b${word}\\b`, 'gi');
            processed = processed.replace(reg, val.toString());
        }

        return processed;
    }

    // -------------------------------------------------------------------------
    // Application State
    // -------------------------------------------------------------------------
    let billItems = [
        { id: generateId(), name: 'Maggi', qty: 2, price: 15, discount: 0, tax: 0 },
        { id: generateId(), name: 'Pepsi', qty: 3, price: 40, discount: 0, tax: 0 }
    ];

    let currentLang = 'hi-IN'; // Default: Hindi (hi-IN)
    let isListening = false;
    let recognitionInstance = null;

    // -------------------------------------------------------------------------
    // DOM Elements
    // -------------------------------------------------------------------------
    const micButton = document.getElementById('micButton');
    const micStatusText = document.getElementById('micStatusText');
    const transcriptInput = document.getElementById('transcriptInput');
    const addToBillButton = document.getElementById('addToBillButton');
    const stopButton = document.getElementById('stopButton');
    const clearTextButton = document.getElementById('clearTextButton');
    const languageBadge = document.getElementById('languageBadge');
    const toggleLangButton = document.getElementById('toggleLangButton');

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
    // Utility Functions
    // -------------------------------------------------------------------------
    function generateId() {
        return 'item_' + Math.random().toString(36).substr(2, 9);
    }

    function formatCurrency(val) {
        return '₹' + (Number(val) || 0).toFixed(2);
    }

    function setStatus(text, listening = false) {
        micStatusText.textContent = text;
        if (listening) {
            micButton.classList.add('listening');
            micButton.setAttribute('aria-label', 'Listening. Click to stop.');
        } else {
            micButton.classList.remove('listening');
            micButton.setAttribute('aria-label', 'Start voice input');
        }
    }

    // -------------------------------------------------------------------------
    // Voice Command: Check and Remove Item by Name
    // -------------------------------------------------------------------------
    function handleVoiceRemoveCommand(spokenText) {
        const cleanText = spokenText.trim().toLowerCase();

        // Matches commands like:
        // "remove aloo", "delete aloo", "remove item aloo"
        // "aloo hatao", "aloo hata do", "aloo delete karo"
        const removePatterns = [
            /^(?:remove|delete|cancel)(?:\s+item)?\s+(.+)$/i,
            /^(.+?)\s+(?:hatao|hata\s+do|delete\s+karo|cancel\s+karo)$/i
        ];

        let targetItemName = null;

        for (const pattern of removePatterns) {
            const match = cleanText.match(pattern);
            if (match) {
                targetItemName = match[1].trim();
                break;
            }
        }

        if (!targetItemName) return false;

        // Clean out filler words if present (e.g. "remove 2 maggi" -> "maggi")
        targetItemName = targetItemName.replace(/^\d+\s*(?:kg|kilo|litre|ltr|g|gm|packet|pkt|pcs)?\s+/i, '').trim();

        // Search for matching item in current bill (case-insensitive substring match)
        const matchIndex = billItems.findIndex(it => {
            const currentItemName = it.name.toLowerCase();
            return currentItemName.includes(targetItemName) || targetItemName.includes(currentItemName.split(' ')[0]);
        });

        if (matchIndex !== -1) {
            const removed = billItems.splice(matchIndex, 1)[0];
            renderBillTable();
            setStatus(`Removed: ${removed.name}`, true);
            return true;
        } else {
            setStatus(`Item "${targetItemName}" not found in bill.`, true);
            return true; // Command recognized even if item wasn't present
        }
    }

    // -------------------------------------------------------------------------
    // Web Speech API Initialization (Continuous & Auto-Add Mode)
    // -------------------------------------------------------------------------
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognition) {
        recognitionInstance = new SpeechRecognition();
        recognitionInstance.continuous = true;
        recognitionInstance.interimResults = false;
        recognitionInstance.lang = currentLang;

        recognitionInstance.onstart = () => {
            isListening = true;
            setStatus('Listening continuously... Speak items or say "remove [item]".', true);
        };

        recognitionInstance.onresult = (event) => {
            const currentIndex = event.resultIndex !== undefined ? event.resultIndex : event.results.length - 1;
            const transcript = event.results[currentIndex][0].transcript.trim();

            transcriptInput.value = transcript;

            // Send voice transcript log to Express server
            fetch('/api/speech', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: transcript })
            }).catch(err => console.warn('Could not post speech log to server:', err));

            // 1. First verify if the spoken sentence is a remove/delete command
            const wasRemoved = handleVoiceRemoveCommand(transcript);
            if (wasRemoved) {
                return;
            }

            // 2. Otherwise parse as adding new item(s)
            const items = parseSpokenBillingText(transcript);
            if (items.length > 0) {
                billItems = billItems.concat(items);
                renderBillTable();
                setStatus(`Added: ${items.map(it => it.name).join(', ')}`, true);
            }
        };

        recognitionInstance.onerror = (event) => {
            if (event.error === 'no-speech') {
                return;
            }

            if (event.error === 'not-allowed') {
                isListening = false;
                setStatus('Microphone permission denied.');
                alert('Microphone access was denied. Please allow microphone permissions.');
            } else if (event.error === 'network') {
                setStatus('Network error occurred during recognition.');
            } else {
                setStatus(`Speech recognition error: ${event.error}`);
            }
        };

        recognitionInstance.onend = () => {
            if (isListening) {
                try {
                    recognitionInstance.start();
                } catch (e) {
                    console.log('Restarting recognition listener...');
                }
            } else {
                micButton.classList.remove('listening');
                setStatus('Ready. Tap the microphone.');
            }
        };
    } else {
        setStatus('Speech recognition is not supported on this browser.');
        micButton.disabled = true;
        micButton.style.opacity = '0.6';
        micButton.title = 'Web Speech API is unsupported in this browser. Use Chrome, Edge, or Safari.';
    }

    // -------------------------------------------------------------------------
    // Language Switcher (Hindi <-> English)
    // -------------------------------------------------------------------------
    toggleLangButton.addEventListener('click', () => {
        if (currentLang === 'hi-IN') {
            currentLang = 'en-US';
            languageBadge.textContent = 'Language: English (en-US)';
            toggleLangButton.textContent = 'Switch to हिन्दी';
        } else {
            currentLang = 'hi-IN';
            languageBadge.textContent = 'Language: हिन्दी (hi-IN)';
            toggleLangButton.textContent = 'Switch to English';
        }
        if (recognitionInstance) {
            recognitionInstance.lang = currentLang;
            if (isListening) {
                recognitionInstance.stop();
                setTimeout(() => {
                    try { recognitionInstance.start(); } catch (err) { }
                }, 200);
            }
        }
    });

    // -------------------------------------------------------------------------
    // Voice Panel Event Listeners
    // -------------------------------------------------------------------------
    micButton.addEventListener('click', () => {
        if (!recognitionInstance) {
            alert('Speech Recognition is not supported by your browser.');
            return;
        }

        if (isListening) {
            isListening = false;
            recognitionInstance.stop();
            setStatus('Stopped listening.');
        } else {
            try {
                isListening = true;
                recognitionInstance.start();
            } catch (err) {
                console.error(err);
            }
        }
    });

    stopButton.addEventListener('click', () => {
        if (recognitionInstance) {
            isListening = false;
            recognitionInstance.stop();
            setStatus('Stopped listening.');
        }
    });

    clearTextButton.addEventListener('click', () => {
        transcriptInput.value = '';
    });

    // -------------------------------------------------------------------------
    // Automatic Continuous Speech Parser
    // -------------------------------------------------------------------------
    function parseSpokenBillingText(rawText) {
        if (!rawText || !rawText.trim()) return [];

        let text = normalizeSpokenNumbers(rawText);
        text = text.replace(/₹|rs\.?|inr/gi, ' ');

        const parsedItems = [];
        const itemPattern = /(\d+(?:\.\d+)?)\s*(kg|kilo|g|gm|gram|grams|ltr|litre|litres|l|packet|packets|pkt|pcs|pc|piece|pieces)?\s+([a-zA-Z\u0900-\u097F\s]+?)\s+(\d+(?:\.\d+)?)(?:\s*(?:each|rupaye|rupees|prati|ke|\/-))?(?=\s+\d|\s*,\s*|\s+(?:and|aur)\s+|$)/gi;

        let match;
        while ((match = itemPattern.exec(text)) !== null) {
            const numericQty = Number(match[1]);
            const unit = match[2] ? match[2].trim() : '';
            let rawName = match[3].trim();
            const numericPrice = Number(match[4]);

            rawName = rawName.replace(/^(and|aur|,)\s+/i, '').trim();

            if (rawName && !isNaN(numericQty) && !isNaN(numericPrice)) {
                let formattedName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
                if (unit) {
                    formattedName = `${formattedName} (${unit})`;
                }

                parsedItems.push({
                    id: generateId(),
                    name: formattedName,
                    qty: numericQty,
                    price: numericPrice,
                    discount: 0,
                    tax: parseFloat(defaultTaxInput.value) || 0
                });
            }
        }

        return parsedItems;
    }

    addToBillButton.addEventListener('click', () => {
        const rawText = transcriptInput.value.trim();
        if (!rawText) {
            alert('Transcript is empty. Please speak or type items first.');
            return;
        }

        // Check if user manually typed or spoke a remove command
        if (handleVoiceRemoveCommand(rawText)) {
            transcriptInput.value = '';
            return;
        }

        const items = parseSpokenBillingText(rawText);
        if (items.length === 0) {
            alert('Could not parse items automatically. Example: "15 kg aloo 20" or "remove aloo".');
            return;
        }

        billItems = billItems.concat(items);
        transcriptInput.value = '';
        setStatus(`Added ${items.length} item(s) to current bill.`, isListening);
        renderBillTable();
    });

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
        <td colspan="7" style="text-align: center; color: var(--muted-text); padding: 24px;">
          No items added yet. Speak items on the left or click <strong>+ Add item</strong>.
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
            type="number" 
            class="table-input ${isMissingPrice ? 'input-error' : ''}" 
            min="0" 
            step="0.5" 
            value="${item.price || ''}" 
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

    function escapeHtml(string) {
        if (!string) return '';
        return String(string)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // -------------------------------------------------------------------------
    // Table Interactions & Event Delegation
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

    // Settings change events
    billDiscountInput.addEventListener('input', calculateBillTotals);
    defaultTaxInput.addEventListener('input', () => {
        const defTax = parseFloat(defaultTaxInput.value) || 0;
        billItems.forEach(it => {
            it.tax = defTax;
        });
        renderBillTable();
    });

    // Add Item manually
    addItemButton.addEventListener('click', () => {
        billItems.push({
            id: generateId(),
            name: '',
            qty: 1,
            price: 0,
            discount: 0,
            tax: parseFloat(defaultTaxInput.value) || 0
        });
        renderBillTable();
    });

    // Clear bill
    clearBillButton.addEventListener('click', () => {
        if (billItems.length > 0 && !confirm('Are you sure you want to clear the current bill?')) {
            return;
        }
        billItems = [{
            id: generateId(),
            name: '',
            qty: 1,
            price: 0,
            discount: 0,
            tax: 0
        }];
        billDiscountInput.value = 0;
        defaultTaxInput.value = 0;
        renderBillTable();
    });

    // -------------------------------------------------------------------------
    // Bill Submission & Express API Integration
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
            const response = await fetch('/api/bill', {
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
            generateBillButton.textContent = 'Generate bill';
        }
    });

    // -------------------------------------------------------------------------
    // Invoice Modal Display
    // -------------------------------------------------------------------------
    function displayReceiptModal(summary, items) {
        let rowsHtml = '';
        items.forEach(it => {
            rowsHtml += `
        <tr>
          <td>${escapeHtml(it.name)}</td>
          <td style="text-align: center;">${it.qty}</td>
          <td style="text-align: right;">${formatCurrency(it.price)}</td>
          <td style="text-align: right;">${formatCurrency(it.amount)}</td>
        </tr>
      `;
        });

        invoiceReceiptContent.innerHTML = `
      <div class="receipt">
        <div class="receipt-head">
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

    // Initial table render
    renderBillTable();
});