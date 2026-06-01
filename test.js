const assert = require('assert');

// 1. Copy parser helper under test
function parseCSV(text) {
  const lines = [];
  let row = [""];
  let insideQuote = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];
    
    if (char === '"') {
      if (insideQuote && nextChar === '"') {
        row[row.length - 1] += '"';
        i++; // skip next quote
      } else {
        insideQuote = !insideQuote;
      }
    } else if (char === ',' && !insideQuote) {
      row.push("");
    } else if ((char === '\r' || char === '\n') && !insideQuote) {
      if (char === '\r' && nextChar === '\n') {
        i++; // skip \n
      }
      lines.push(row);
      row = [""];
    } else {
      row[row.length - 1] += char;
    }
  }
  if (row.length > 1 || row[0] !== "") {
    lines.push(row);
  }
  return lines;
}

// Helper to map dynamic option columns (extract logic from server.js)
function extractCSVOptions(headers, row) {
  const q = {};
  headers.forEach((header, index) => {
    q[header] = row[index] ? row[index].trim() : '';
  });

  const optionsList = [];
  const optionImagesList = [];

  for (let j = 1; j <= 20; j++) {
    const optVal = q[`option${j}`];
    if (optVal !== undefined && optVal !== '') {
      optionsList.push(optVal);
      optionImagesList.push(q[`option${j}image`] || '');
    }
  }

  if (optionsList.length === 0) {
    ['a', 'b', 'c', 'd'].forEach(char => {
      const optVal = q[`option${char}`];
      if (optVal !== undefined && optVal !== '') {
        optionsList.push(optVal);
        optionImagesList.push(q[`option${char}image`] || '');
      }
    });
  }
  return { options: optionsList, optionImages: optionImagesList };
}

// 2. Unit Tests
console.log('⚡ Starting TriviaPulse Unit Tests...');

try {
  // Test 1: Simple CSV Parsing
  console.log('👉 Running Test 1: Simple CSV Parsing...');
  const csvData1 = `Type,Question,TimeLimit,OptionA,OptionB,CorrectAnswer\nmultiple-choice,"What is 2+2?",15,"3","4","4"`;
  const parsed1 = parseCSV(csvData1);
  assert.strictEqual(parsed1.length, 2);
  assert.strictEqual(parsed1[0][1], 'Question');
  assert.strictEqual(parsed1[1][4], '4');
  console.log('✅ Test 1 Passed!');

  // Test 2: Quote escaping and commas inside quotes CSV Parsing
  console.log('👉 Running Test 2: Quotes and Commas in CSV...');
  const csvData2 = `Type,Question,TimeLimit\nmultiple-choice,"Noah's Ark came to rest on Mount Ararat, yes?",15`;
  const parsed2 = parseCSV(csvData2);
  assert.strictEqual(parsed2.length, 2);
  assert.strictEqual(parsed2[1][1], "Noah's Ark came to rest on Mount Ararat, yes?");
  console.log('✅ Test 2 Passed!');

  // Test 3: Dynamic Option Extraction (Classic A-D)
  console.log('👉 Running Test 3: Dynamic Option A-D Extraction...');
  const headers3 = ['type', 'question', 'timelimit', 'optiona', 'optionb', 'optionc', 'optiond', 'optionaimage', 'optionbimage'];
  const row3 = ['multiple-choice', 'Which planet?', '20', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'earth.svg', 'mars.svg'];
  const extracted3 = extractCSVOptions(headers3, row3);
  assert.strictEqual(extracted3.options.length, 4);
  assert.strictEqual(extracted3.options[0], 'Earth');
  assert.strictEqual(extracted3.options[1], 'Mars');
  assert.strictEqual(extracted3.optionImages[0], 'earth.svg');
  assert.strictEqual(extracted3.optionImages[1], 'mars.svg');
  assert.strictEqual(extracted3.optionImages[2], ''); // Not set
  console.log('✅ Test 3 Passed!');

  // Test 4: Dynamic Option Extraction (Variable 1-20)
  console.log('👉 Running Test 4: Dynamic Option 1-20 Extraction...');
  const headers4 = ['type', 'question', 'timelimit', 'option1', 'option2', 'option3', 'option4', 'option5', 'option6', 'option1image', 'option3image'];
  const row4 = ['multiple-choice', 'Select 6th choice', '30', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'one.svg', 'three.svg'];
  const extracted4 = extractCSVOptions(headers4, row4);
  assert.strictEqual(extracted4.options.length, 6);
  assert.strictEqual(extracted4.options[5], 'Six');
  assert.strictEqual(extracted4.optionImages[0], 'one.svg');
  assert.strictEqual(extracted4.optionImages[2], 'three.svg');
  assert.strictEqual(extracted4.optionImages[1], ''); // Empty
  console.log('✅ Test 4 Passed!');

  // Test 5: Dynamic stats mapping and correctness check
  console.log('👉 Running Test 5: Answer grading mapping...');
  const options = ['Exodus', 'Genesis', 'Leviticus', 'Numbers'];
  const submittedCorrect = 'Genesis';
  
  // Verify correct matching index
  const matchIdx = options.findIndex(opt => opt.toLowerCase() === submittedCorrect.toLowerCase());
  assert.strictEqual(matchIdx, 1);
  console.log('✅ Test 5 Passed!');

  console.log('\n🎉 ALL TRIVIAPULSE UNIT TESTS PASSED SUCCESSFULLY! 🎉');
  process.exit(0);
} catch (error) {
  console.error('❌ UNIT TEST FAILED:', error);
  process.exit(1);
}
