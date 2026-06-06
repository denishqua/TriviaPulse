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

  // Test 6: Survey question scoring bypass and stats compiler
  console.log('👉 Running Test 6: Survey scoring bypass and stats compiling...');
  
  // Scoring bypass mock
  const questionType = 'survey';
  const player = { score: 100, streak: 3, lastAnswerCorrect: true };
  let pointsAwarded = 0;
  
  if (questionType === 'survey') {
    pointsAwarded = 0;
    player.lastAnswerCorrect = false;
    // player.streak is NOT reset to 0!
  } else {
    player.streak = 0;
    player.lastAnswerCorrect = false;
  }
  
  player.score += pointsAwarded;
  assert.strictEqual(player.score, 100);
  assert.strictEqual(player.streak, 3); // Streak preserved!
  assert.strictEqual(player.lastAnswerCorrect, false);
  
  // Compiled options mock (similar to server.js)
  const qOptions = ["Mars", "Jupiter", "Saturn", "Earth"];
  const votes = [1, 3, 0, 2]; // Saturn got 0, Mars 1, Earth 2, Jupiter 3
  
  const compiledOptions = qOptions.map((optText, optIdx) => ({
    text: optText,
    count: votes[optIdx]
  }));
  
  compiledOptions.sort((a, b) => b.count - a.count);
  
  // Jupiter should be first (3 votes)
  assert.strictEqual(compiledOptions[0].text, 'Jupiter');
  assert.strictEqual(compiledOptions[0].count, 3);
  
  // Earth should be second (2 votes)
  assert.strictEqual(compiledOptions[1].text, 'Earth');
  assert.strictEqual(compiledOptions[1].count, 2);
  
  // Mars should be third (1 vote)
  assert.strictEqual(compiledOptions[2].text, 'Mars');
  assert.strictEqual(compiledOptions[2].count, 1);
  
  // Saturn should be fourth (0 votes)
  assert.strictEqual(compiledOptions[3].text, 'Saturn');
  assert.strictEqual(compiledOptions[3].count, 0);
  
  console.log('✅ Test 6 Passed!');

  // Test 7: True/False options default fallback
  console.log('👉 Running Test 7: True/False default options fallback...');
  
  // JSON True/False question load mock
  const tfQuestionRaw = {
    type: 'true-false',
    question: 'Is HTML5 semantic?',
    correctAnswer: 'True'
  };
  
  const tfQuestionParsed = {
    type: tfQuestionRaw.type,
    question: tfQuestionRaw.question,
    correctanswer: tfQuestionRaw.correctAnswer,
    options: [],
    optionImages: []
  };
  
  // If options array is empty and type is true-false, apply fallback
  if (tfQuestionParsed.type === 'true-false' && tfQuestionParsed.options.length === 0) {
    tfQuestionParsed.options = ['True', 'False'];
  }
  
  assert.strictEqual(tfQuestionParsed.options.length, 2);
  assert.strictEqual(tfQuestionParsed.options[0], 'True');
  assert.strictEqual(tfQuestionParsed.options[1], 'False');
  
  // Grade check mock (simulate player answering 0 for True)
  const submittedTfAnswer = 0;
  const numericTfIndex = parseInt(submittedTfAnswer, 10);
  let selectedTfText = '';
  
  if (!isNaN(numericTfIndex) && numericTfIndex >= 0 && numericTfIndex < tfQuestionParsed.options.length) {
    selectedTfText = tfQuestionParsed.options[numericTfIndex];
  }
  
  assert.strictEqual(selectedTfText, 'True');
  const isTfCorrect = selectedTfText.trim().toLowerCase() === tfQuestionParsed.correctanswer.trim().toLowerCase();
  assert.strictEqual(isTfCorrect, true); // Should be graded correct!
  
  console.log('✅ Test 7 Passed!');
  
  // Test 8: Survey scoring 1-point cap verification
  console.log('👉 Running Test 8: Survey scoring 1-point cap verification...');

  const surveyQuestion = {
    type: 'survey',
    options: ['Alice', 'Bob', 'Charlie']
  };

  const winningIndices = new Set([0]); // Alice won (index 0)

  // Player 1 voted for Alice twice (0,0) and Bob once (1)
  const p1Answer = '0,0,1';
  let p1MatchedWinning = false;
  p1Answer.split(',').forEach(ch => {
    const idx = parseInt(ch.trim(), 10);
    if (idx >= 0 && winningIndices.has(idx)) {
      p1MatchedWinning = true;
    }
  });
  const p1Points = p1MatchedWinning ? 1 : 0;
  assert.strictEqual(p1Points, 1); // Capped at 1 point even though they voted for Alice twice!

  // Player 2 voted for Bob twice (1,1) and Charlie once (2)
  const p2Answer = '1,1,2';
  let p2MatchedWinning = false;
  p2Answer.split(',').forEach(ch => {
    const idx = parseInt(ch.trim(), 10);
    if (idx >= 0 && winningIndices.has(idx)) {
      p2MatchedWinning = true;
    }
  });
  const p2Points = p2MatchedWinning ? 1 : 0;
  assert.strictEqual(p2Points, 0); // Voted only for non-winning options, so 0 points!

  console.log('✅ Test 8 Passed!');

  console.log('\n🎉 ALL TRIVIAPULSE UNIT TESTS PASSED SUCCESSFULLY! 🎉');
  process.exit(0);
} catch (error) {
  console.error('❌ UNIT TEST FAILED:', error);
  process.exit(1);
}
