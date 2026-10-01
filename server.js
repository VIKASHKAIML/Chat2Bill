/**
 * Voice Billing Web Application - Express Backend
 * Handles static hosting, voice log ingestion, and server-side bill validation & calculation.
 */

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware for parsing JSON requests and serving static assets
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/**
 * Helper: Round a number safely to 2 decimal places
 */
function roundToTwo(num) {
  return Math.round((Number(num) + Number.EPSILON) * 100) / 100;
}

/**
 * POST /api/speech
 * Logs or echoes voice transcripts received from the client.
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

// Fallback error handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error occurred.'
  });
});

app.listen(PORT, () => {
  console.log(`Voice Billing Server running at http://localhost:${PORT}`);
});