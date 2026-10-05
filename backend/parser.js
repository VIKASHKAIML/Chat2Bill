/**
 * Voice Billing System - Hindi / Hinglish / English Voice Command Parser
 * Modular Architecture:
 * - normalizeNumbers(rawText)
 * - normalizeUnits(unit)
 * - normalizeItemName(name)
 * - normalizeTranscript(text)
 * - detectCategory(itemName)
 * - detectIntent(text)
 * - segmentMultipleItems(rawText)
 * - extractItemData(segment)
 * - validateItemData(item)
 * - processVoiceOrder(rawText, defaultTax)
 * - parseVoiceCommands(rawText)
 * - parseBillingText(rawText, defaultTax)
 * - parseRemoveCommand(text)
 */

// Devanagari digit conversion map
const DEVANAGARI_DIGITS = {
  '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
  '५': '5', '६': '6', '७': '7', '८': '8', '९': '9'
};

// Spoken numbers map (English, Hinglish, Devanagari terms)
const SPOKEN_NUMBERS = {
  // English
  'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4,
  'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9,
  'ten': 10, 'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14,
  'fifteen': 15, 'sixteen': 16, 'seventeen': 17, 'eighteen': 18, 'nineteen': 19,
  'twenty': 20, 'thirty': 30, 'forty': 40, 'fifty': 50,
  'sixty': 60, 'seventy': 70, 'eighty': 80, 'ninety': 90,

  // Hindi / Hinglish Transliterations
  'shunya': 0, 'ek': 1, 'do': 2, 'teen': 3, 'char': 4, 'chaar': 4,
  'paanch': 5, 'panch': 5, 'chhe': 6, 'chhah': 6, 'che': 6, 'saat': 7, 'aath': 8,
  'nau': 9, 'das': 10, 'dus': 10, 'gyarah': 11, 'barah': 12, 'terah': 13,
  'chaudah': 14, 'pandrah': 15, 'solah': 16, 'satrah': 17, 'atharah': 18,
  'unnis': 19, 'bees': 20, 'ikkees': 21, 'baees': 22, 'teees': 23,
  'chaubees': 24, 'pachees': 25, 'pachis': 25, 'chhabees': 26, 'sattaees': 27,
  'atthaees': 28, 'untees': 29, 'tees': 30, 'iktees': 31, 'battees': 32,
  'tentis': 33, 'chauntis': 34, 'paintis': 35, 'chhattis': 36, 'saintis': 37,
  'adtis': 38, 'untaalees': 39, 'untalis': 39, 'chalis': 40, 'chaalees': 40,
  'pachaas': 50, 'pachas': 50, 'saath': 60, 'sattar': 70, 'assi': 80, 'nabbe': 90,

  // Devanagari Hindi Words
  'शून्य': 0, 'एक': 1, 'दो': 2, 'तीन': 3, 'चार': 4, 'पांच': 5, 'पाँच': 5,
  'छह': 6, 'छः': 6, 'सात': 7, 'आठ': 8, 'नौ': 9, 'दस': 10, 'ग्यारह': 11,
  'बारह': 12, 'तेरह': 13, 'चौदह': 14, 'पंद्रह': 15, 'सोलह': 16, 'सत्रह': 17,
  'अठारह': 18, 'उन्नीस': 19, 'बीस': 20, 'पच्चीस': 25, 'तीस': 30, 'चालीस': 40,
  'पचास': 50, 'साठ': 60, 'सत्तर': 70, 'अस्सी': 80, 'नब्बे': 90
};

// Colloquial Indian Grocery Fractions
const FRACTION_WORDS = [
  { regex: /\b(aadha|adha|half|आधा)\b/gi, val: '0.5' },
  { regex: /\b(paav|pao|pav|quarter|पाव)\b/gi, val: '0.25' },
  { regex: /\b(pauna|pona|powna|पौना)\b/gi, val: '0.75' },
  { regex: /\b(sawa|sawwa|savva|सवा)\b/gi, val: '1.25' },
  { regex: /\b(dedh|dhedh|डेढ़)\b/gi, val: '1.5' },
  { regex: /\b(dhai|dhaye|ढाई)\b/gi, val: '2.5' }
];

// Hindi / Hinglish Synonyms mapping for Item Normalization
const HINDI_ITEM_SYNONYMS = {
  'आलू': 'aloo', 'aalu': 'aloo', 'alu': 'aloo', 'aaloo': 'aloo', 'potato': 'aloo', 'potatoes': 'aloo', 'آلو': 'aloo',
  'प्याज': 'pyaz', 'pyaj': 'pyaz', 'pyaaj': 'pyaz', 'pyaaz': 'pyaz', 'kanda': 'pyaz', 'onion': 'pyaz', 'onions': 'pyaz', 'پیاز': 'pyaz',
  'टमाटर': 'tamatar', 'tomato': 'tamatar', 'tomatoes': 'tamatar', 'tamator': 'tamatar', 'ٹमाٹر': 'tamatar',
  'दूध': 'doodh', 'dudh': 'doodh', 'milk': 'doodh', 'دودھ': 'doodh',
  'चावल': 'chawal', 'rice': 'chawal', 'चवल': 'chawal', 'چاول': 'chawal',
  'दाल': 'dal', 'daal': 'dal', 'pulse': 'dal', 'pulses': 'dal', 'toor': 'dal', 'arhar': 'dal', 'دال': 'dal',
  'चीनी': 'cheeni', 'शक्कर': 'cheeni', 'chini': 'cheeni', 'shakkar': 'cheeni', 'sugar': 'cheeni', 'چینی': 'cheeni',
  'मैगी': 'maggi', 'maggie': 'maggi',
  'पेप्सी': 'pepsi',
  'तेल': 'tel', 'oil': 'tel', 'تیل': 'tel',
  'बिस्कुट': 'biscuit', 'biscuits': 'biscuit',
  'साबुन': 'soap', 'sabun': 'soap',
  'आटा': 'atta', 'aata': 'atta', 'flour': 'atta',
  'पनीर': 'paneer', 'cheese': 'paneer',
  'दही': 'dahi', 'curd': 'dahi', 'yogurt': 'dahi',
  'मसाला': 'masala',
  'नमक': 'namak', 'salt': 'namak', 'نمک': 'namak',
  'हल्दी': 'haldi', 'turmeric': 'haldi',
  'मिर्च': 'mirch', 'chilli': 'mirch', 'chili': 'mirch',
  'धनिया': 'dhaniya', 'coriander': 'dhaniya',
  'ब्रेड': 'bread',
  'अंडा': 'anda', 'ande': 'anda', 'egg': 'anda', 'eggs': 'anda',
  'सेब': 'seb', 'apple': 'seb', 'apples': 'seb',
  'केला': 'kela', 'kele': 'kela', 'banana': 'kela', 'bananas': 'kela',
  'आम': 'aam', 'mango': 'aam', 'mangoes': 'aam',
  'चार्जर': 'charger',
  'इयरफोन': 'earphone', 'ईयरफोन': 'earphone', 'हेडफोन': 'headphone',
  'माउस': 'mouse', 'लैपटॉप': 'laptop',
  'दवा': 'medicine', 'दवाई': 'medicine',
  'पैरासिटामोल': 'paracetamol', 'पैरासीटामोल': 'paracetamol'
};

// Category keywords definition for Grocery, Electronics, Medical
const CATEGORY_MAP = {
  medical: [
    'paracetamol', 'dolo', 'crocin', 'combiflam', 'tablet', 'tablets', 'capsule', 'capsules',
    'syrup', 'bandage', 'bandaid', 'medicine', 'medicines', 'dawa', 'dawai', 'ointment',
    'dettol', 'vicks', 'cotton', 'syringe', 'painkiller', 'antacid', 'digene', 'strip', 'strips',
    'betadine', 'cough syrup', 'drops', 'thermometer'
  ],
  electronics: [
    'laptop', 'laptops', 'mouse', 'mice', 'charger', 'chargers', 'earphone', 'earphones', 'headphone', 'headphones',
    'cable', 'usb', 'phone', 'mobile', 'battery', 'adapter', 'keyboard', 'monitor', 'bulb', 'led',
    'plug', 'wire', 'powerbank', 'power bank', 'speaker', 'speakers', 'mic', 'microphone',
    'remote', 'pendrive', 'pen drive', 'cover', 'glass', 'screen guard', 'tempered glass',
    'smartwatch', 'watch', 'camera', 'tripod'
  ],
  grocery: [
    'aloo', 'potato', 'potatoes', 'pyaz', 'onion', 'onions', 'tamatar', 'tomato', 'tomatoes',
    'doodh', 'milk', 'chawal', 'rice', 'dal', 'daal', 'pulse', 'pulses', 'cheeni', 'sugar',
    'shakkar', 'maggi', 'maggie', 'pepsi', 'coke', 'tel', 'oil', 'biscuit', 'biscuits', 'soap', 'sabun',
    'atta', 'flour', 'paneer', 'cheese', 'dahi', 'curd', 'yogurt', 'masala', 'namak', 'salt', 'haldi',
    'turmeric', 'mirch', 'chilli', 'dhaniya', 'coriander', 'bread', 'anda', 'egg', 'eggs',
    'seb', 'apple', 'apples', 'kela', 'banana', 'bananas', 'aam', 'mango', 'mangoes', 'ghee',
    'butter', 'tea', 'chai', 'coffee', 'garlic', 'lahsun', 'ginger', 'adrak', 'peas', 'matar',
    'besan', 'sooji', 'maida', 'detergent', 'shampoo', 'noodle', 'noodles', 'water', 'biscot'
  ]
};

// Sorted unit variants list (longest first to avoid prefix substring collisions e.g. "pieces" before "piece")
const UNIT_VARIANTS = [
  'kilograms', 'kilogram', 'kilos', 'kilo', 'kg',
  'grams', 'gram', 'gms', 'gm', 'g',
  'litres', 'litre', 'liters', 'liter', 'ltrs', 'ltr', 'l',
  'millilitres', 'millilitre', 'milliliters', 'milliliter', 'ml',
  'packets', 'packet', 'packs', 'pack', 'pkts', 'pkt',
  'pieces', 'piece', 'peices', 'peice', 'peace', 'piss', 'pis', 'pcs', 'pc',
  'strips', 'strip',
  'tablets', 'tablet',
  'bottles', 'bottle',
  'pairs', 'pair', 'jodi',
  'darjan', 'dozen',
  'boxes', 'box', 'dabba',
  'units', 'unit',
  'cans', 'can',
  'sachets', 'sachet', 'pouches', 'pouch',
  'plates', 'plate',
  'bundles', 'bundle',
  'बंडल', 'स्ट्रिप', 'पैकेट', 'लीटर', 'मिलीलीटर', 'किलोग्राम', 'किलो', 'ग्राम', 'बोतल', 'दर्जन', 'डिब्बा', 'जोड़ी', 'पीस', 'गोली', 'यूनिट'
];
UNIT_VARIANTS.sort((a, b) => b.length - a.length);

const UNIT_REGEX_PATTERN = UNIT_VARIANTS.join('|');
const PRICE_INDICATORS = 'rupees|rupaye|rupay|rupya|rs|inr|रुपये|रुपए|रुपया|रپیز|रोپے|each|prati|per|\\/-';
const ITEM_WORD_REGEX = '[a-zA-Z\\u0900-\\u097F\\u0600-\\u06FF]+';

/**
 * Converts Devanagari digits and spoken numbers to numeric figures.
 * Protects verbal phrases where "do" is a verb (kar do, hata do) rather than the number 2.
 */
function normalizeNumbers(rawText) {
  if (!rawText) return '';
  let text = String(rawText).replace(/[०-९]/g, d => DEVANAGARI_DIGITS[d] || d);

  // Pre-clean misplaced ₹ symbol before units (e.g. "₹3 kg" -> "3 kg")
  text = text.replace(new RegExp(`₹\\s*(\\d+(?:\\.\\d+)?)\\s*(${UNIT_REGEX_PATTERN})`, 'gi'), '$1 $2');
  // Handle currency prefixes e.g. "Rs 500", "Rs. 500", "INR 200", "₹100"
  text = text.replace(/(?:rs\.?|inr|₹)\s*(\d+(?:\.\d+)?)/gi, '$1 rupees');
  // Replace commas and semicolons with whitespace
  text = text.replace(/[,;]/g, ' ');

  // 1. Replace colloquial fractions first (sawa, pauna, aadha, dedh, dhai, paav)
  for (const frac of FRACTION_WORDS) {
    text = text.replace(frac.regex, frac.val);
  }

  // 2. Protect verbal phrases where "do" is a verb (kar do, hata do, nikal do) instead of number 2
  text = text.replace(/\b(kar|karo|hata|nikal|de)\s+do\b/gi, '$1 __VERB_DO__');

  // 3. English compound numbers (e.g. "twenty five" -> "25")
  const compoundTens = ['twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  compoundTens.forEach((tenWord, idx) => {
    const tenBase = (idx + 2) * 10;
    const unitWords = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
    unitWords.forEach((unitWord, uIdx) => {
      const regex = new RegExp(`\\b${tenWord}\\s+${unitWord}\\b`, 'gi');
      text = text.replace(regex, (tenBase + uIdx + 1).toString());
    });
  });

  // 4. Spoken individual numbers (English, Hindi, Hinglish base numbers 0-99)
  const sortedWords = Object.keys(SPOKEN_NUMBERS).sort((a, b) => b.length - a.length);
  for (const word of sortedWords) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    text = text.replace(regex, SPOKEN_NUMBERS[word].toString());
  }

  // 5. Indian Number System Multipliers with preceding number:
  // e.g. "3 hazar" -> 3000, "teen hazar" -> 3000, "1.5 lakh" -> 150000, "2 crore" -> 20000000, "5 sau" -> 500
  // Multipliers: crore (10^7), lakh (10^5), hazar (10^3), sau (10^2)
  text = text.replace(/(\d+(?:\.\d+)?)\s*(?:crores?|karod|karor|करोड़)\b/gi, (_, n) => (parseFloat(n) * 10000000).toString());
  text = text.replace(/(\d+(?:\.\d+)?)\s*(?:lakhs?|lacs?|लाख)\b/gi, (_, n) => (parseFloat(n) * 100000).toString());
  text = text.replace(/(\d+(?:\.\d+)?)\s*(?:hazar|hazaaro|hazaar|hajar|hajaar|hazār|thousands?|हजार|हज़ार)\b/gi, (_, n) => (parseFloat(n) * 1000).toString());
  text = text.replace(/(\d+(?:\.\d+)?)\s*(?:sau|so|hundreds?|सौ)\b/gi, (_, n) => (parseFloat(n) * 100).toString());

  // 6. Standalone multipliers without preceding number (e.g. "hazar rupee" -> 1000 rupee, "sau rupaye" -> 100 rupaye)
  text = text.replace(/(?:^|(?<=\s))(?:crores?|karod|karor|करोड़)\b/gi, '10000000');
  text = text.replace(/(?:^|(?<=\s))(?:lakhs?|lacs?|लाख)\b/gi, '100000');
  text = text.replace(/(?:^|(?<=\s))(?:hazar|hazaaro|hazaar|hajar|hajaar|hazār|thousands?|हजार|हज़ार)\b/gi, '1000');
  text = text.replace(/(?:^|(?<=\s))(?:sau|so|hundreds?|सौ)\b/gi, '100');

  // 7. Compound place-value folding (e.g. "3000 500" -> 3500, "3000 200" -> 3200, "100000 20000" -> 120000, "200 50" -> 250)
  const combineRegex = /\b(\d+)\s+(\d+)\b/;
  let prev;
  do {
    prev = text;
    text = text.replace(combineRegex, (match, a, b) => {
      const numA = parseInt(a, 10);
      const numB = parseInt(b, 10);
      if (numA >= 100 && numB < numA && (numA % 10 === 0) && (numA + numB).toString().length <= numA.toString().length) {
        return (numA + numB).toString();
      }
      return match;
    });
  } while (text !== prev);

  // 8. Restore verbal phrases
  text = text.replace(/__VERB_DO__/g, 'do');

  return text;
}

// Alias for backward compatibility
const normalizeSpokenNumbers = normalizeNumbers;

/**
 * Standardizes units (kg, gram, litre, ml, piece, packet, strip, tablet, bottle, pair, dozen, box, unit, etc.)
 * Strictly conforms to Section 2 & 3:
 * pc / pcs / piece / pieces -> piece
 * kg / kilo / kilogram / kilograms -> kg
 * g / gram / grams -> gram
 * litre / liter / litres / liters / ltr -> litre
 * ml -> ml
 * packet / pack / packets -> packet
 * box / boxes -> box
 * bottle / bottles -> bottle
 * pair / pairs -> pair
 * dozen -> dozen
 * strip -> strip
 * tablet -> tablet
 * unit -> unit
 */
function normalizeUnits(unit) {
  if (!unit) return '';
  const u = String(unit).toLowerCase().trim();
  if (/^(kg|kilo|kilos|kilogram|kilograms|किलो|किलोग्राम)$/i.test(u)) return 'kg';
  if (/^(g|gm|gms|gram|grams|ग्राम)$/i.test(u)) return 'gram';
  if (/^(l|ltr|ltrs|litre|litres|liter|liters|लीटर)$/i.test(u)) return 'litre';
  if (/^(ml|millilitre|milliliter|मिलीलीटर)$/i.test(u)) return 'ml';
  if (/^(packet|packets|pack|packs|pkt|pkts|पैकेट)$/i.test(u)) return 'packet';
  if (/^(pc|pcs|piece|pieces|pis|piss|peice|peices|peace|पीस|नग)$/i.test(u)) return 'piece';
  if (/^(strip|strips|स्ट्रिप)$/i.test(u)) return 'strip';
  if (/^(tablet|tablets|गोली)$/i.test(u)) return 'tablet';
  if (/^(bottle|bottles|बोतल)$/i.test(u)) return 'bottle';
  if (/^(pair|pairs|jodi|जोड़ी)$/i.test(u)) return 'pair';
  if (/^(dozen|darjan|दर्जन)$/i.test(u)) return 'dozen';
  if (/^(box|boxes|dabba|डिब्बा)$/i.test(u)) return 'box';
  if (/^(unit|units|यूनिट)$/i.test(u)) return 'unit';
  if (/^(can|cans|कैन)$/i.test(u)) return 'can';
  if (/^(sachet|sachets|pouch|pouches|पाउच)$/i.test(u)) return 'sachet';
  if (/^(plate|plates|प्लेट)$/i.test(u)) return 'plate';
  if (/^(bundle|bundles|बंडल)$/i.test(u)) return 'bundle';
  return u;
}

// Alias for backward compatibility
const normalizeUnit = normalizeUnits;

/**
 * Normalizes item names for internal comparison & duplicate prevention.
 * Case-insensitive, removes units in parentheses, filters articles and Hindi variations.
 */
function normalizeItemName(name) {
  if (!name) return '';
  let str = String(name).toLowerCase().trim();
  // Strip parenthesized units e.g. "Aloo (kg)" -> "Aloo"
  str = str.replace(/\s*\([^)]*\)/g, '').trim();
  // Strip articles & leading fillers
  str = str.replace(/^(the|item|ek|one)\s+/gi, '').trim();
  // Strip trailing fillers
  str = str.replace(/\s+(item|wala|waala)$/gi, '').trim();

  if (HINDI_ITEM_SYNONYMS[str]) {
    return HINDI_ITEM_SYNONYMS[str];
  }
  return str;
}

/**
 * Normalizes transcript text for deduplication
 */
function normalizeTranscript(text) {
  if (!text) return '';
  return text.toLowerCase().replace(/[.,!?;:₹]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Categorizes an item name into: Grocery, Electronics, Medical.
 */
function detectCategory(itemName) {
  if (!itemName) return 'Grocery';
  const clean = String(itemName).toLowerCase().trim();

  for (const med of CATEGORY_MAP.medical) {
    if (clean.includes(med)) return 'Medical';
  }
  for (const el of CATEGORY_MAP.electronics) {
    if (clean.includes(el)) return 'Electronics';
  }
  for (const groc of CATEGORY_MAP.grocery) {
    if (clean.includes(groc)) return 'Grocery';
  }
  return 'Grocery';
}

/**
 * Extracts structured data from raw regex / match tokens
 */
function extractItemData(rawQty, rawUnit1, rawName, rawUnit2, rawPrice) {
  const qty = parseFloat(rawQty);
  const price = rawPrice !== undefined && rawPrice !== null ? parseFloat(rawPrice) : null;
  const unit = normalizeUnits(rawUnit1 || rawUnit2 || '');

  let cleanName = (rawName || '').trim();
  // Clean leading conversational fillers
  cleanName = cleanName.replace(/^(bhai|bhaiya|aur|and|le\s*lo|do|the|ek)\s+/gi, '').trim();
  // Clean trailing filler words
  cleanName = cleanName.replace(/\s+(bhai|le\s*lo|wala|waala)$/gi, '').trim();

  const norm = normalizeItemName(cleanName);
  const category = detectCategory(norm || cleanName);

  return {
    name: norm || cleanName,
    rawName: cleanName,
    normalizedName: norm,
    category: category,
    quantity: isNaN(qty) ? 1 : qty,
    unit: unit || null,
    price: price !== null && !isNaN(price) ? price : null,
    currency: 'INR'
  };
}

/**
 * Validates extracted item data according to business rules.
 * Never invents missing values.
 */
function validateItemData(item) {
  const missing = [];
  if (!item.name || item.name.trim() === '') {
    missing.push('name');
  }
  if (item.quantity === undefined || item.quantity === null || isNaN(item.quantity) || item.quantity <= 0) {
    missing.push('quantity');
  }
  if (item.price === undefined || item.price === null || isNaN(item.price) || item.price < 0) {
    missing.push('price');
  }

  return {
    valid: missing.length === 0,
    missing: missing
  };
}

/**
 * Detects overall intent of a text segment or utterance
 */
function detectIntent(text) {
  if (!text || !text.trim()) return 'UNKNOWN';
  const clean = text.toLowerCase();
  if (/\b(delete|remove|cancel|hata\s*do|hatao|nikal\s*do|डिलीट|हटा\s*दो)\b/i.test(clean)) {
    return 'DELETE_ITEM';
  }
  if (/\b(quantity|qty|matra|क्वांटिटी|मात्रा)\b/i.test(clean)) {
    return 'UPDATE_QUANTITY';
  }
  if (/\b(price|rate|daam|keemat|कीमत|दाम|भाव|रेट)\b/i.test(clean)) {
    return 'UPDATE_PRICE';
  }
  return 'ADD_ITEM';
}

/**
 * Semantic Item Segmentation Algorithm:
 * Identifies item boundaries across continuous Indian speech without requiring separators.
 * Transitions from:
 * QUANTITY -> UNIT -> ITEM -> PRICE
 * to the next item automatically.
 * Distinguishes quantity number from price number.
 */
function segmentMultipleItems(rawText) {
  if (!rawText || !rawText.trim()) return [];

  const text = normalizeNumbers(rawText.trim());
  let workingText = text.replace(/\s+/g, ' ').trim();
  const segments = [];

  // Strip conversational greeting prefix if present at start
  workingText = workingText.replace(/^(bhai|bhaiya|sir|please|hello)\s+/i, '');

  // 1. PRIMARY PATTERN A: [Qty] [Unit]? [Item] [Unit]? [Price] [Currency]?
  // Lookahead ensures boundaries before next item starts or end of string
  const primaryRegex = new RegExp(
    '(?:^|\\s+)' +
    '(\\d+(?:\\.\\d+)?)\\s*' +
    '(' + UNIT_REGEX_PATTERN + ')?\\s*' +
    '(' + ITEM_WORD_REGEX + '(?:\\s+' + ITEM_WORD_REGEX + ')*?)\\s*' +
    '(' + UNIT_REGEX_PATTERN + ')?\\s+' +
    '(\\d+(?:\\.\\d+)?)\\s*' +
    '(?:' + PRICE_INDICATORS + ')?' +
    '(?=\\s+(?:\\d+|' + ITEM_WORD_REGEX + ')|\\s*$)',
    'gi'
  );

  let match;
  while ((match = primaryRegex.exec(workingText)) !== null) {
    const rawQty = match[1];
    const rawUnit1 = match[2];
    let rawItem = match[3].trim();
    const rawUnit2 = match[4];
    const rawPrice = match[5];

    // If rawItem starts with filler conjunctions, strip them
    rawItem = rawItem.replace(/^(aur|and|le\s*lo|do|bhai)\s+/i, '').trim();

    if (rawItem && !/^(aur|and|le|do|bhai|kar|karo|item)$/i.test(rawItem)) {
      const itemObj = extractItemData(rawQty, rawUnit1, rawItem, rawUnit2, rawPrice);
      segments.push(itemObj);
    }
  }

  // 2. PATTERN B: [Item] [Qty] [Unit]? [Price] [Currency]?
  // e.g. "aloo 5kg 20 rupees", "pyaj 3 kg 30"
  if (segments.length === 0) {
    const patternB = new RegExp(
      '(' + ITEM_WORD_REGEX + ')\\s+' +
      '(\\d+(?:\\.\\d+)?)\\s*' +
      '(' + UNIT_REGEX_PATTERN + ')?\\s+' +
      '(\\d+(?:\\.\\d+)?)\\s*' +
      '(?:' + PRICE_INDICATORS + ')?',
      'gi'
    );
    while ((match = patternB.exec(workingText)) !== null) {
      const rawItem = match[1].trim();
      const rawQty = match[2];
      const rawUnit = match[3];
      const rawPrice = match[4];

      if (rawItem && !/^(aur|and|le|do|bhai|kar|karo|item)$/i.test(rawItem)) {
        const itemObj = extractItemData(rawQty, rawUnit, rawItem, null, rawPrice);
        segments.push(itemObj);
      }
    }
  }

  // 3. PATTERN C: [Item] [Price] [Currency] (Implicit Qty = 1)
  // e.g. "laptop 3000 rupees", "phone 20000 rupaye"
  if (segments.length === 0) {
    const patternC = new RegExp(
      '(?:^|\\s+)' +
      '(' + ITEM_WORD_REGEX + ')\\s+' +
      '(\\d+(?:\\.\\d+)?)\\s*' +
      '(?:' + PRICE_INDICATORS + ')' +
      '(?=\\s+(?:' + ITEM_WORD_REGEX + ')|\\s*$)',
      'gi'
    );
    while ((match = patternC.exec(workingText)) !== null) {
      const rawItem = match[1].trim();
      const rawPrice = match[2];
      if (rawItem && !/^(aur|and|le|do|bhai|kar|karo|item|rupee|rupees|rupaye|rupay|rupya|rs|inr|रुपये|रुपए|रुपया)$/i.test(rawItem)) {
        const itemObj = extractItemData(1, 'piece', rawItem, null, rawPrice);
        segments.push(itemObj);
      }
    }
  }

  return segments;
}

/**
 * Command Intent Classifier & Entity Extractor.
 * Supported intents:
 *   - ADD_ITEM: Adds new item or updates existing item if already present
 *   - UPDATE_QUANTITY: Updates quantity and unit only (preserves price)
 *   - UPDATE_PRICE: Updates price only (preserves quantity)
 *   - DELETE_ITEM: Removes item from bill
 *   - CLARIFY: Incomplete item (e.g. missing price)
 *   - UNKNOWN: Unrecognized intent
 */
function parseVoiceCommands(rawText) {
  if (!rawText || !rawText.trim()) return [];

  const text = normalizeNumbers(rawText.trim());
  let workingText = text.replace(/\s+/g, ' ').trim();
  const commands = [];

  const unitRegex = UNIT_REGEX_PATTERN;
  const priceIndicator = PRICE_INDICATORS;
  const itemWordRegex = ITEM_WORD_REGEX;

  // 0. CLEAR_BILL commands: e.g. "clear bill", "bill clear kar do", "sab hata do", "clear all"
  const clearBillRegex = /\b(?:clear\s+bill|bill\s+clear|sab\s+hata\s*do|sab\s+kuch\s+hata\s*do|clear\s+all|delete\s+all|सब\s+हटा\s*दो|बिल\s+क्लियर)\b/i;
  if (clearBillRegex.test(workingText)) {
    commands.push({ intent: 'CLEAR_BILL' });
    workingText = workingText.replace(clearBillRegex, ' ');
  }

  // 1. DELETE / REMOVE commands
  const delActionWords = 'delete|detete|delet|delte|remove|cancel|hata\\s*do|hatao|hata\\s*den|hataiye|hata|nikal\\s*do|nikalo|nikal|हटा\\s*दो|हटाओ|हटा\\s*दें|हटा|निकाल\\s*दो|निकालो|डिलीट|कैंसिल';

  // Suffix delete: e.g. "laptop delete", "laptop delete kar do", "laptop detete kar do", "laptop remove", "laptop hata do", "laptop ko hata do"
  const suffixDel = new RegExp('(?:item\\s+)?(' + itemWordRegex + ')\\s+(?:ko\\s+|को\\s+)?(?:' + delActionWords + ')(?:\\s+(?:kar\\s*do|karo|kar\\s*den|dena|karna|कर\\s*दो|करो))?', 'gi');
  let m;
  while ((m = suffixDel.exec(workingText)) !== null) {
    let target = m[1].trim();
    if (!/^(kar|karo|do|de|aur|and|item|the|rupee|rupees|rupaye|rupay|rupya|rs|inr)$/i.test(target)) {
      commands.push({
        intent: 'DELETE_ITEM',
        item: target,
        normalizedName: normalizeItemName(target),
        category: detectCategory(target)
      });
    }
  }
  workingText = workingText.replace(suffixDel, ' ');

  // Prefix delete: e.g. "delete laptop", "remove laptop", "hata do laptop", "hata do aloo", "hatao laptop", "delete kar do laptop"
  const prefixDel = new RegExp('(?:' + delActionWords + ')(?:\\s+(?:kar\\s*do|karo|कर\\s*दो|करो))?\\s+(?:the\\s+)?(?:item\\s+)?(?:ko\\s+|se\\s+)?(?:\\d+(?:\\.\\d+)?\\s*(?:' + unitRegex + ')?\\s+)?(?!do\\b|kar\\b|karo\\b)(' + itemWordRegex + ')', 'gi');
  while ((m = prefixDel.exec(workingText)) !== null) {
    let target = m[1].trim();
    if (!/^(kar|karo|do|de|aur|and|item|the|rupee|rupees|rupaye|rupay|rupya|rs|inr)$/i.test(target)) {
      commands.push({
        intent: 'DELETE_ITEM',
        item: target,
        normalizedName: normalizeItemName(target),
        category: detectCategory(target)
      });
    }
  }
  workingText = workingText.replace(prefixDel, ' ');

  // 2. UPDATE_PRICE detection:
  // e.g. "update laptop price 3500", "laptop price 3500 kar do", "update laptop 500 rupees", "laptop 500 rupees update kar do", "laptop ka price 3500 kar do"
  const priceKeywords = 'price|rate|daam|keemat|कीमत|दाम|भाव|रेट';
  const pricePatterns = [
    new RegExp(`\\bupdate(?:\\s+kar\\s*do|\\s+karo)?\\s+(?:price\\s+of\\s+)?(${itemWordRegex})\\s+(?:${priceKeywords})\\s*(?:to\\s+)?(\\d+(?:\\.\\d+)?)(?:\\s*(?:${priceIndicator}))?`, 'gi'),
    new RegExp(`\\bupdate(?:\\s+kar\\s*do|\\s+karo)?\\s+(?:price\\s+of\\s+)?(${itemWordRegex})\\s+(?:to\\s+)?(\\d+(?:\\.\\d+)?)\\s*(?:${priceIndicator})`, 'gi'),
    new RegExp(`(${itemWordRegex})\\s+(?:${priceKeywords})\\s+update(?:\\s+kar\\s*do|\\s+karo)?\\s+(\\d+(?:\\.\\d+)?)(?:\\s*(?:${priceIndicator}))?`, 'gi'),
    new RegExp(`(${itemWordRegex})\\s+(?:ka\\s+|ki\\s+|का\\s+|की\\s+)?(?:${priceKeywords})\\s+(?:to\\s+)?(\\d+(?:\\.\\d+)?)(?:\\s*(?:${priceIndicator}))?(?:\\s*kar\\s*do|\\s*karo|\\s*कर\\s*दो)?`, 'gi'),
    new RegExp(`(${itemWordRegex})\\s+(\\d+(?:\\.\\d+)?)\\s*(?:${priceIndicator})\\s*(?:update|update\\s+kar\\s*do|update\\s+karo)`, 'gi'),
    new RegExp(`(${itemWordRegex})\\s+(\\d+(?:\\.\\d+)?)\\s*(?:${priceIndicator})\\s*(?:kar\\s*do|karo|kar\\s*den)`, 'gi')
  ];

  for (const pat of pricePatterns) {
    while ((m = pat.exec(workingText)) !== null) {
      let target = m[1].trim();
      const price = parseFloat(m[2]);
      if (target && !isNaN(price) && !/^(kar|karo|do|item|update|price|rate|daam|keemat|quantity|qty)$/i.test(target)) {
        commands.push({
          intent: 'UPDATE_PRICE',
          item: target,
          normalizedName: normalizeItemName(target),
          price: price,
          category: detectCategory(target)
        });
      }
    }
    workingText = workingText.replace(pat, ' ');
  }

  // 3. UPDATE_QUANTITY detection:
  // e.g. "update laptop 5 piece", "update kar do laptop 5 piece", "laptop update 5 piece", "laptop 5 piece kar do", "aloo 10 kg kar do", "aloo ki quantity 10 kg kar do"
  const qtyKeywords = 'quantity|quntity|qty|matra|क्वांटिटी|मात्रा';
  const qtyPatterns = [
    new RegExp(`\\bupdate(?:\\s+kar\\s*do|\\s+karo)?\\s+(?:quantity\\s+of\\s+|qty\\s+of\\s+)?(${itemWordRegex})\\s+(?:to\\s+)?(\\d+(?:\\.\\d+)?)\\s*(${unitRegex})?(?!\\s*(?:${priceIndicator}))`, 'gi'),
    new RegExp(`(${itemWordRegex})\\s+update(?:\\s+kar\\s*do|\\s+karo)?\\s+(\\d+(?:\\.\\d+)?)\\s*(${unitRegex})?(?!\\s*(?:${priceIndicator}))`, 'gi'),
    new RegExp(`(?:update\\s+)?(${itemWordRegex})\\s+(?:ki\\s+|ko\\s+|का\\s+|की\\s+|को\\s+)?(?:${qtyKeywords})\\s+(?:to\\s+)?(\\d+(?:\\.\\d+)?)\\s*(${unitRegex})?(?:\\s*kar\\s*do|\\s*karo|\\s*कर\\s*दो)?`, 'gi'),
    new RegExp(`(?:update\\s+)?(?:${qtyKeywords})\\s+(?:of\\s+)?(${itemWordRegex})\\s+(?:to\\s+)?(\\d+(?:\\.\\d+)?)\\s*(${unitRegex})?`, 'gi'),
    new RegExp(`(${itemWordRegex})\\s+(?:ko\\s+|ki\\s+)?(\\d+(?:\\.\\d+)?)\\s*(${unitRegex})?\\s*(?:kar\\s*do|karo|kar\\s*den|कर\\s*दो|करो)(?!\\s*(?:${priceIndicator}))`, 'gi')
  ];

  for (const pat of qtyPatterns) {
    while ((m = pat.exec(workingText)) !== null) {
      let target = m[1].trim();
      const qty = parseFloat(m[2]);
      const unit = normalizeUnits(m[3] || '');
      if (target && !isNaN(qty) && !/^(kar|karo|do|item|update|price|rate|daam|keemat|quantity|qty|matra)$/i.test(target)) {
        commands.push({
          intent: 'UPDATE_QUANTITY',
          item: target,
          normalizedName: normalizeItemName(target),
          quantity: qty,
          unit: unit || null,
          category: detectCategory(target)
        });
      }
    }
    workingText = workingText.replace(pat, ' ');
  }

  // 4. ADD_ITEM Segmentation
  const addedItems = segmentMultipleItems(workingText);
  for (const it of addedItems) {
    commands.push({
      intent: 'ADD_ITEM',
      item: it.rawName,
      normalizedName: it.normalizedName,
      category: it.category,
      quantity: it.quantity,
      unit: it.unit,
      price: it.price,
      currency: it.currency
    });
  }

  // 5. INCOMPLETE ITEM DETECTION (CLARIFY)
  // If no commands were recognized, check if user provided quantity + item without price
  if (commands.length === 0) {
    const incompleteRegex = new RegExp(
      '(?:^|\\s+)' +
      '(\\d+(?:\\.\\d+)?)\\s*' +
      '(' + unitRegex + ')?\\s*' +
      '(' + itemWordRegex + ')' +
      '(?!\\s*\\d+)',
      'gi'
    );
    while ((m = incompleteRegex.exec(workingText)) !== null) {
      let rawItem = m[3].trim();
      rawItem = rawItem.replace(/^(aur|and|le\s*lo|do|bhai)\s+/i, '').trim();
      if (rawItem && !/^(aur|and|le|do|bhai|kar|karo|item|rupee|rupees|rupaye|rupay|rupya|rs|inr|रुपये|रुपए|रुपया)$/i.test(rawItem)) {
        const qty = parseFloat(m[1]);
        const unit = normalizeUnits(m[2] || '');
        commands.push({
          intent: 'CLARIFY',
          item: rawItem,
          normalizedName: normalizeItemName(rawItem),
          category: detectCategory(rawItem),
          quantity: isNaN(qty) ? 1 : qty,
          unit: unit || null,
          price: null,
          missing: ['price']
        });
      }
    }
  }

  // 6. PREVENT REDUNDANT ADD_ITEM RE-ADDITIONS
  // If an item was deleted or updated in this utterance, filter out any older ADD_ITEM for that item
  const delNames = new Set(commands.filter(c => c.intent === 'DELETE_ITEM').map(c => c.normalizedName));
  const updateNames = new Set(commands.filter(c => c.intent === 'UPDATE_QUANTITY' || c.intent === 'UPDATE_PRICE').map(c => c.normalizedName));

  const filteredCommands = commands.filter(c => {
    if (c.intent === 'ADD_ITEM') {
      if (delNames.has(c.normalizedName) || updateNames.has(c.normalizedName)) {
        return false;
      }
    }
    return true;
  });

  if (filteredCommands.length > 0) {
    return filteredCommands;
  }

  return [{ intent: 'UNKNOWN', raw: rawText }];
}

/**
 * Top-Level Intermediate Structured Output Generator.
 * Conforms to Requirement #12:
 * Produces structured intermediate output before UI modifications:
 * {
 *   action: "add" | "remove" | "update" | "clarify" | "batch",
 *   items: [ ... ],
 *   commands: [ ... ],
 *   missing?: [ ... ],
 *   incomplete?: [ ... ]
 * }
 */
function processVoiceOrder(rawText, defaultTax = 0) {
  const commands = parseVoiceCommands(rawText);

  // Filter commands
  const addCmds = commands.filter(c => c.intent === 'ADD_ITEM');
  const delCmds = commands.filter(c => c.intent === 'DELETE_ITEM');
  const updateCmds = commands.filter(c => c.intent === 'UPDATE_QUANTITY' || c.intent === 'UPDATE_PRICE');
  const clarifyCmds = commands.filter(c => c.intent === 'CLARIFY');

  // Build standard structured items
  const validItems = addCmds.map(c => ({
    name: c.normalizedName || c.item,
    rawName: c.item,
    category: c.category || detectCategory(c.item),
    quantity: c.quantity,
    unit: c.unit,
    price: c.price,
    currency: 'INR',
    discount: 0,
    tax: Number(defaultTax) || 0
  }));

  const incompleteItems = clarifyCmds.map(c => ({
    name: c.normalizedName || c.item,
    rawName: c.item,
    category: c.category || detectCategory(c.item),
    quantity: c.quantity,
    unit: c.unit,
    missing: ['price']
  }));

  // Determine overall action
  let overallAction = 'add';
  const hasAdd = validItems.length > 0;
  const hasDel = delCmds.length > 0;
  const hasUpdate = updateCmds.length > 0;
  const hasIncomplete = incompleteItems.length > 0;

  const actionCount = (hasAdd ? 1 : 0) + (hasDel ? 1 : 0) + (hasUpdate ? 1 : 0);

  if (actionCount > 1) {
    overallAction = 'batch';
  } else if (hasDel) {
    overallAction = 'remove';
  } else if (hasUpdate) {
    overallAction = 'update';
  } else if (hasIncomplete && !hasAdd) {
    overallAction = 'clarify';
  } else {
    overallAction = 'add';
  }

  const result = {
    action: overallAction,
    items: validItems,
    commands: commands
  };

  if (hasIncomplete) {
    if (overallAction === 'clarify') {
      result.items = incompleteItems;
      result.missing = ['price'];
    } else {
      result.incomplete = incompleteItems;
    }
  }

  return result;
}

// Backwards-compatible legacy helpers
function parseRemoveCommand(text) {
  const cmds = parseVoiceCommands(text);
  const del = cmds.find(c => c.intent === 'DELETE_ITEM');
  return del ? del.item : null;
}

function parseBillingText(rawText, defaultTax = 0) {
  const order = processVoiceOrder(rawText, defaultTax);
  return order.items.map(it => ({
    id: 'item_' + Math.random().toString(36).substr(2, 9),
    name: it.rawName ? (it.rawName.charAt(0).toUpperCase() + it.rawName.slice(1)) : (it.name.charAt(0).toUpperCase() + it.name.slice(1)),
    rawName: it.rawName || it.name,
    normalizedName: it.name,
    category: it.category,
    unit: it.unit,
    qty: it.quantity,
    price: it.price,
    discount: 0,
    tax: Number(defaultTax) || 0
  }));
}

// Universal Export: Node.js (CommonJS) & Browser (window)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    normalizeNumbers,
    normalizeSpokenNumbers,
    normalizeUnits,
    normalizeUnit,
    normalizeItemName,
    normalizeTranscript,
    detectCategory,
    detectIntent,
    segmentMultipleItems,
    extractItemData,
    validateItemData,
    processVoiceOrder,
    parseVoiceCommands,
    parseRemoveCommand,
    parseBillingText,
    HINDI_ITEM_SYNONYMS,
    SPOKEN_NUMBERS,
    FRACTION_WORDS,
    CATEGORY_MAP
  };
} else if (typeof window !== 'undefined') {
  window.VoiceBillingParser = {
    normalizeNumbers,
    normalizeSpokenNumbers,
    normalizeUnits,
    normalizeUnit,
    normalizeItemName,
    normalizeTranscript,
    detectCategory,
    detectIntent,
    segmentMultipleItems,
    extractItemData,
    validateItemData,
    processVoiceOrder,
    parseVoiceCommands,
    parseRemoveCommand,
    parseBillingText,
    HINDI_ITEM_SYNONYMS,
    SPOKEN_NUMBERS,
    FRACTION_WORDS,
    CATEGORY_MAP
  };
}
