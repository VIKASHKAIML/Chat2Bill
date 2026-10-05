const parser = require('./parser');

const tests = [
  {
    name: 'Section 12 Required Test - 2 pcs laptop 3000 rupees 5 kg aloo 200 rupaye sawa kilo pyaz 100 rupees 3 pieces mouse 500 रुपए',
    input: '2 pcs laptop 3000 rupees 5 kg aloo 200 rupaye sawa kilo pyaz 100 rupees 3 pieces mouse 500 रुपए',
    expectedItemsCount: 4,
    validate: (order) => {
      const it1 = order.items.find(i => i.name === 'laptop');
      const it2 = order.items.find(i => i.name === 'aloo');
      const it3 = order.items.find(i => i.name === 'pyaz');
      const it4 = order.items.find(i => i.name === 'mouse');
      return it1 && it1.quantity === 2 && it1.unit === 'piece' && it1.price === 3000 &&
             it2 && it2.quantity === 5 && it2.unit === 'kg' && it2.price === 200 &&
             it3 && it3.quantity === 1.25 && it3.unit === 'kg' && it3.price === 100 &&
             it4 && it4.quantity === 3 && it4.unit === 'piece' && it4.price === 500;
    }
  },
  {
    name: 'Required Test 1 - Two items without separators',
    input: '5 kg aloo 20 rupees 3 kg pyaz 20 rupees',
    expectedItemsCount: 2,
    validate: (order) => {
      const it1 = order.items.find(i => i.name === 'aloo');
      const it2 = order.items.find(i => i.name === 'pyaz');
      return it1 && it1.quantity === 5 && it1.unit === 'kg' && it1.price === 20 &&
             it2 && it2.quantity === 3 && it2.unit === 'kg' && it2.price === 20;
    }
  },
  {
    name: 'Required Test 2 - 3 items with rupaye',
    input: '5 kg aloo 20 rupaye 3 kg pyaz 20 rupaye 2 packet biscuit 60 rupaye',
    expectedItemsCount: 3,
    validate: (order) => order.items.length === 3 && order.items[2].name === 'biscuit' && order.items[2].unit === 'packet' && order.items[2].price === 60
  },
  {
    name: 'Required Test 3 - Update quantity only',
    input: 'aloo ki quantity 10 kg kar do',
    validate: (order) => {
      const cmd = order.commands.find(c => c.intent === 'UPDATE_QUANTITY');
      return cmd && cmd.normalizedName === 'aloo' && cmd.quantity === 10 && cmd.unit === 'kg';
    }
  },
  {
    name: 'Required Test 4 - Remove item only',
    input: 'aloo hata do',
    validate: (order) => {
      const cmd = order.commands.find(c => c.intent === 'DELETE_ITEM');
      return cmd && cmd.normalizedName === 'aloo';
    }
  },
  {
    name: 'Required Test 5 - Update price only',
    input: 'aloo ka price 50 rupees kar do',
    validate: (order) => {
      const cmd = order.commands.find(c => c.intent === 'UPDATE_PRICE');
      return cmd && cmd.normalizedName === 'aloo' && cmd.price === 50;
    }
  },
  {
    name: 'Test 6 - 5 kilo aloo 20 rupaye 2 kilo tamatar 40 rupaye',
    input: '5 kilo aloo 20 rupaye 2 kilo tamatar 40 rupaye',
    expectedItemsCount: 2,
    validate: (order) => order.items.length === 2 && order.items[0].unit === 'kg' && order.items[1].unit === 'kg'
  },
  {
    name: 'Test 7 - 2 packet biscuit 60 rupees 5 kg rice 300 rupees',
    input: '2 packet biscuit 60 rupees 5 kg rice 300 rupees',
    expectedItemsCount: 2,
    validate: (order) => order.items.length === 2 && order.items[1].name === 'chawal' && order.items[1].price === 300
  },
  {
    name: 'Test 8 - Electronics category & piece unit normalization',
    input: '3 pieces charger 900 rupees 2 earphone 500 rupees',
    expectedItemsCount: 2,
    validate: (order) => {
      const c = order.items.find(i => i.name === 'charger');
      const e = order.items.find(i => i.name === 'earphone');
      return c && c.category === 'Electronics' && c.quantity === 3 && c.unit === 'piece' && c.price === 900 &&
             e && e.category === 'Electronics' && e.quantity === 2 && e.price === 500;
    }
  },
  {
    name: 'Test 9 - Medical category & strip unit',
    input: '2 paracetamol strip 50 rupees',
    expectedItemsCount: 1,
    validate: (order) => {
      const p = order.items[0];
      return p && p.name === 'paracetamol' && p.category === 'Medical' && p.unit === 'strip' && p.quantity === 2 && p.price === 50;
    }
  },
  {
    name: 'Test 10 - Natural speech greeting prefix',
    input: 'bhai 5 kilo aloo 20 rupaye 3 kilo pyaz 30 rupaye',
    expectedItemsCount: 2,
    validate: (order) => order.items.length === 2 && order.items[0].name === 'aloo' && order.items[1].name === 'pyaz'
  },
  {
    name: 'Test 11 - Pure Hindi Devanagari script',
    input: '5 किलो आलू 20 रुपये',
    expectedItemsCount: 1,
    validate: (order) => order.items.length === 1 && order.items[0].name === 'aloo' && order.items[0].quantity === 5 && order.items[0].price === 20
  },
  {
    name: 'Test 12 - 4 items long continuous utterance',
    input: '5 kg aloo 20 rupees 3 kg pyaz 20 rupees 2 packet biscuit 60 rupees 1 litre milk 60 rupees',
    expectedItemsCount: 4,
    validate: (order) => order.items.length === 4 && order.items[3].name === 'doodh' && order.items[3].unit === 'litre'
  },
  {
    name: 'Test 13 - Clarify validation when price is missing',
    input: '5 kg aloo',
    validate: (order) => order.action === 'clarify' && order.missing && order.missing.includes('price')
  },
  {
    name: 'Test 14 - Composite command',
    input: 'aloo hata do aur pyaz ki quantity 5 kg kar do',
    validate: (order) => {
      const del = order.commands.find(c => c.intent === 'DELETE_ITEM');
      const upd = order.commands.find(c => c.intent === 'UPDATE_QUANTITY');
      return del && del.normalizedName === 'aloo' && upd && upd.normalizedName === 'pyaz' && upd.quantity === 5;
    }
  },
  {
    name: 'Test 15 - Indian large numbers (lakh / lac)',
    input: '1 pcs laptop 1.5 lakh rupees 1 mouse 1000 rupees 1 printer 2 lakh rupees',
    validate: (order) => {
      const it1 = order.items.find(i => i.name === 'laptop');
      const it2 = order.items.find(i => i.name === 'mouse');
      const it3 = order.items.find(i => i.name === 'printer');
      return it1 && it1.price === 150000 && it2 && it2.price === 1000 && it3 && it3.price === 200000;
    }
  },
  {
    name: 'Test 16 - Fractional Indian quantities (pauna, aadha, sawa)',
    input: 'pauna kilo chini 40 rupees aadha kilo tamatar 20 rupees',
    validate: (order) => {
      const it1 = order.items.find(i => i.name === 'cheeni');
      const it2 = order.items.find(i => i.name === 'tamatar');
      return it1 && it1.quantity === 0.75 && it1.unit === 'kg' && it2 && it2.quantity === 0.5 && it2.unit === 'kg';
    }
  },
  {
    name: 'Test 17 - Clear bill voice command (clear bill / sab hata do)',
    input: 'sab hata do',
    validate: (order) => {
      return order.commands && order.commands.some(c => c.intent === 'CLEAR_BILL');
    }
  },
  {
    name: 'Test 18 - Live streaming speech step simulation',
    input: '2 pcs laptop 3000 rupees 5 kg aloo 200 rupaye',
    validate: (order) => {
      // Step 1: partial incomplete
      const step1 = parser.processVoiceOrder('2 pcs laptop');
      const step1Clarify = step1.action === 'clarify' && step1.items.length === 1 && step1.items[0].name === 'laptop';

      // Step 2: first item complete
      const step2 = parser.processVoiceOrder('2 pcs laptop 3000 rupees');
      const step2Add = step2.items && step2.items.length === 1 && step2.items[0].name === 'laptop' && step2.items[0].price === 3000;

      // Step 3: second item continuous live addition
      const step3 = parser.processVoiceOrder('2 pcs laptop 3000 rupees 5 kg aloo 200 rupaye');
      const step3TwoItems = step3.items && step3.items.length === 2 && step3.items[0].name === 'laptop' && step3.items[1].name === 'aloo';

      return step1Clarify && step2Add && step3TwoItems;
    }
  },
  {
    name: 'Test 19: User Request - 3 piece laptop teen Hazar rupee',
    input: '3 piece laptop teen Hazar rupee',
    validate: (order) => {
      const it = order.items && order.items.find(i => i.name === 'laptop');
      return it && it.quantity === 3 && it.unit === 'piece' && it.price === 3000;
    }
  },
  {
    name: 'Test 20: Indian Compound Numbers - teen hazar paanch sau and ek sau',
    input: '3 piece laptop teen hazar paanch sau rupee 5 kg aloo ek sau rupaye',
    validate: (order) => {
      const laptop = order.items && order.items.find(i => i.name === 'laptop');
      const aloo = order.items && order.items.find(i => i.name === 'aloo');
      return laptop && laptop.quantity === 3 && laptop.unit === 'piece' && laptop.price === 3500 &&
             aloo && aloo.quantity === 5 && aloo.unit === 'kg' && aloo.price === 100;
    }
  },
  {
    name: 'Test 21: User Request - hata do prefix and suffix',
    input: 'hata do laptop',
    validate: (order) => {
      const del = order.commands && order.commands.find(c => c.intent === 'DELETE_ITEM');
      return del && del.normalizedName === 'laptop';
    }
  },
  {
    name: 'Test 22: User Request - detete kar do (typo support)',
    input: 'laptop detete kar do',
    validate: (order) => {
      const del = order.commands && order.commands.find(c => c.intent === 'DELETE_ITEM');
      return del && del.normalizedName === 'laptop';
    }
  },
  {
    name: 'Test 23: User Request - detete kar do laptop (prefix typo)',
    input: 'detete kar do laptop',
    validate: (order) => {
      const del = order.commands && order.commands.find(c => c.intent === 'DELETE_ITEM');
      return del && del.normalizedName === 'laptop';
    }
  },
  {
    name: 'Test 24: User Request - remove and delete prefix',
    input: 'remove laptop',
    validate: (order) => {
      const del = order.commands && order.commands.find(c => c.intent === 'DELETE_ITEM');
      return del && del.normalizedName === 'laptop';
    }
  },
  {
    name: 'Test 25: User Request - Update quantity variants (5 piece kar do & update laptop 5 piece)',
    input: 'laptop 5 piece kar do',
    validate: (order) => {
      const upd = order.commands && order.commands.find(c => c.intent === 'UPDATE_QUANTITY');
      return upd && upd.normalizedName === 'laptop' && upd.quantity === 5 && upd.unit === 'piece';
    }
  },
  {
    name: 'Test 26: User Request - Update price variants (laptop 500 rupees kar do)',
    input: 'laptop 500 rupees kar do',
    validate: (order) => {
      const upd = order.commands && order.commands.find(c => c.intent === 'UPDATE_PRICE');
      return upd && upd.normalizedName === 'laptop' && upd.price === 500;
    }
  },
  {
    name: 'Test 27: Continuous listening stream deconfliction - item deleted in same utterance',
    input: '2 pcs laptop 3000 rupees laptop hata do',
    validate: (order) => {
      const del = order.commands && order.commands.find(c => c.intent === 'DELETE_ITEM');
      const add = order.commands && order.commands.find(c => c.intent === 'ADD_ITEM');
      return del && del.normalizedName === 'laptop' && !add;
    }
  }
];

let passed = 0;
tests.forEach((t, idx) => {
  const order = parser.processVoiceOrder(t.input);
  const ok = t.validate(order);
  if (ok) {
    passed++;
    console.log(`[PASS] Test ${idx + 1}: ${t.name}`);
  } else {
    console.error(`[FAIL] Test ${idx + 1}: ${t.name}`);
    console.error('Order output:', JSON.stringify(order, null, 2));
  }
});

console.log(`\nResults: ${passed} / ${tests.length} tests passed.`);
process.exit(passed === tests.length ? 0 : 1);
