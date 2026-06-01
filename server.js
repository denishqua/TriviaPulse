const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const isLan = process.argv.includes('--lan');
const isTunnel = process.argv.includes('--tunnel');
const PORT = 3000; // Enforced for Pinggy forwarding
const HOST = isTunnel ? '127.0.0.1' : (isLan ? '0.0.0.0' : '127.0.0.1');

let publicTunnelUrl = '';
let tunnelProcess = null;

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));
// Serve static files from the 'quizzes' directory to allow quiz-encapsulated assets
app.use('/quizzes', express.static(path.join(__dirname, 'quizzes')));
app.use(express.json());

// In-memory game sessions
const games = new Map();

// Helper to get local IP address for LAN multiplayer
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal (loopback) and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// RFC 4180 compliant CSV Parser
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

// API Endpoint to list available quizzes
app.get('/api/quizzes', (req, res) => {
  const quizzesDir = path.join(__dirname, 'quizzes');
  
  // Ensure quizzes directory exists
  if (!fs.existsSync(quizzesDir)) {
    fs.mkdirSync(quizzesDir);
  }

  fs.readdir(quizzesDir, { withFileTypes: true }, (err, dirents) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to read quizzes directory' });
    }
    
    const quizFiles = [];
    
    for (const dirent of dirents) {
      if (dirent.isDirectory()) {
        const subfolder = dirent.name;
        const subfolderPath = path.join(quizzesDir, subfolder);
        
        try {
          const subFiles = fs.readdirSync(subfolderPath);
          const quizFile = subFiles.find(f => f.endsWith('.csv') || f.endsWith('.json'));
          
          if (quizFile) {
            const ext = path.extname(quizFile);
            quizFiles.push({
              // ID is the relative path (e.g. 'general_knowledge/general_knowledge.csv')
              id: `${subfolder}/${quizFile}`,
              name: subfolder.replace(/_/g, ' ').toUpperCase()
            });
          }
        } catch (e) {
          console.error(`Error reading quiz package directory ${subfolder}:`, e);
        }
      }
    }
      
    const resolvedIp = isTunnel ? (publicTunnelUrl || 'Generating tunnel...') : (isLan ? getLocalIpAddress() : 'localhost');
    res.json({ quizzes: quizFiles, localIp: resolvedIp, port: PORT });
  });
});

// Real-time communication via Socket.IO
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // ----------------------------------------------------
  // HOST EVENTS
  // ----------------------------------------------------

  // Host creates a game lobby
  socket.on('host-create-game', ({ quizId }) => {
    const quizPath = path.join(__dirname, 'quizzes', quizId);
    
    if (!fs.existsSync(quizPath)) {
      return socket.emit('error-msg', { message: 'Selected quiz not found.' });
    }

    try {
      const fileData = fs.readFileSync(quizPath, 'utf-8');
      const questions = [];
      const isJson = quizId.endsWith('.json');

      if (isJson) {
        const parsedJson = JSON.parse(fileData);
        if (!Array.isArray(parsedJson)) {
          return socket.emit('error-msg', { message: 'JSON Quiz must be an array of questions.' });
        }
        for (const item of parsedJson) {
          const q = {
            type: item.type || 'multiple-choice',
            question: item.question || '',
            timeLimit: parseInt(item.timeLimit) || parseInt(item.timelimit) || 20,
            questionimage: item.questionImage || item.questionimage || '',
            correctanswer: item.correctAnswer || item.correctanswer || '',
            options: [],
            optionImages: []
          };

          // If options is an array
          if (Array.isArray(item.options)) {
            item.options.forEach((opt, oIdx) => {
              if (typeof opt === 'object' && opt !== null) {
                q.options.push(opt.text || '');
                q.optionImages.push(opt.image || '');
              } else {
                q.options.push(opt ? opt.toString() : '');
                // Try fetching matching index in item.optionImages or item.optionimages array if present
                const imgArr = item.optionImages || item.optionimages;
                q.optionImages.push((Array.isArray(imgArr) && imgArr[oIdx]) ? imgArr[oIdx] : '');
              }
            });
          }
          questions.push(q);
        }
      } else {
        const rows = parseCSV(fileData);
        
        // Parse header and rows
        if (rows.length < 2) {
          return socket.emit('error-msg', { message: 'Quiz CSV file is empty or invalid.' });
        }

        const headers = rows[0].map(h => h.trim().toLowerCase());

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (row.length < 2 || !row[0]) continue; // Skip empty rows

          const q = {};
          headers.forEach((header, index) => {
            q[header] = row[index] ? row[index].trim() : '';
          });

          // Dynamic options extraction (supports Option1 to Option20 and OptionA to OptionD)
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

          q.options = optionsList;
          q.optionImages = optionImagesList;
          q.type = q.type || 'multiple-choice';
          q.questionimage = q.questionimage || '';
          q.correctanswer = q.correctanswer || '';

          // Parse list details
          q.timeLimit = parseInt(q.timelimit) || 20; // Default 20 seconds
          questions.push(q);
        }
      }

      if (questions.length === 0) {
        return socket.emit('error-msg', { message: 'No valid questions found in quiz file.' });
      }

      const pin = 'local_game';

      // Clear any pre-existing game room to allow hosting a fresh game
      if (games.has(pin)) {
        const oldGame = games.get(pin);
        if (oldGame.questionTimeoutId) clearTimeout(oldGame.questionTimeoutId);
        if (oldGame.countdownTimer) clearInterval(oldGame.countdownTimer);
      }

      const ext = path.extname(quizId);
      const quizName = path.basename(quizId, ext).replace(/_/g, ' ').toUpperCase();

      // Register game session
      const newGame = {
        pin,
        hostSocketId: socket.id,
        quizName,
        questions,
        players: new Map(), // socketId -> playerDetails
        gameState: 'LOBBY',
        currentQuestionIndex: -1,
        questionStartTime: 0,
        questionTimeoutId: null,
        answersReceived: 0,
        totalPlayersAnswered: 0,
        countdownTimer: null,
        timeRemaining: 0,
        answeredThisQuestion: new Set()
      };

      games.set(pin, newGame);
      socket.join(`game_${pin}`);

      const resolvedIp = isTunnel ? (publicTunnelUrl || 'Generating tunnel...') : (isLan ? getLocalIpAddress() : 'localhost');
      socket.emit('game-created', {
        pin,
        quizName: newGame.quizName,
        questionCount: questions.length,
        localIp: resolvedIp,
        port: PORT
      });

      console.log(`Local game room created for quiz ${newGame.quizName}`);

    } catch (error) {
      console.error('Error creating game:', error);
      socket.emit('error-msg', { message: 'Error parsing quiz data.' });
    }
  });

  // Host starts the game
  socket.on('host-start-game', () => {
    const pin = 'local_game';
    const game = games.get(pin);
    if (!game || game.hostSocketId !== socket.id) return;
    if (game.players.size === 0) {
      return socket.emit('error-msg', { message: 'Cannot start game with 0 players.' });
    }

    game.currentQuestionIndex = 0;
    startQuestionIntro(game);
  });

  // Host removes/kicks player from lobby
  socket.on('host-kick-player', ({ nickname }) => {
    const pin = 'local_game';
    const game = games.get(pin);
    if (!game || game.hostSocketId !== socket.id) return;
    if (game.gameState !== 'LOBBY') return; // Kick only allowed during lobby setup
    
    // Find the player by nickname
    let targetSocketId = null;
    for (const [sId, player] of game.players.entries()) {
      if (player.nickname.toLowerCase() === nickname.toLowerCase().trim()) {
        targetSocketId = sId;
        break;
      }
    }
    
    if (targetSocketId) {
      const playerDetails = game.players.get(targetSocketId);
      
      // Notify player client they have been kicked
      io.to(targetSocketId).emit('kicked', { message: 'You have been removed from the lobby by the host.' });
      
      // Remove player details from session
      game.players.delete(targetSocketId);
      game.answeredThisQuestion.delete(targetSocketId);
      
      // Clean up player socket
      const targetSocket = io.sockets.sockets.get(targetSocketId);
      if (targetSocket) {
        targetSocket.leave(`game_${pin}`);
      }
      
      console.log(`Player ${playerDetails.nickname} was kicked from the lobby by Host.`);
      
      // Broadcast updated list to Host
      io.to(game.hostSocketId).emit('player-left', {
        nickname: playerDetails.nickname,
        playerCount: game.players.size,
        players: Array.from(game.players.values()).map(p => ({ nickname: p.nickname, avatar: p.avatar }))
      });
    }
  });

  // Host requests to dynamically spawn remote play tunnel
  socket.on('host-start-tunnel', () => {
    // If already active or starting, return immediate URL if present
    if (tunnelProcess) {
      if (publicTunnelUrl) {
        socket.emit('tunnel-url-updated', { url: publicTunnelUrl });
      }
      return;
    }
    
    console.log('Host requested remote play tunnel. Spawning Pinggy SSH background process...');
    startPinggyTunnel();
  });

  // Host triggers showing results (ends question early)
  socket.on('host-show-results', () => {
    const pin = 'local_game';
    const game = games.get(pin);
    if (!game || game.hostSocketId !== socket.id || game.gameState !== 'QUESTION') return;

    endQuestion(game);
  });

  // Host goes to next state (Leaderboard or Next Question or Podium)
  socket.on('host-next', () => {
    const pin = 'local_game';
    const game = games.get(pin);
    if (!game || game.hostSocketId !== socket.id) return;

    if (game.gameState === 'RESULTS') {
      // Transition to LEADERBOARD
      game.gameState = 'LEADERBOARD';
      const leaderboard = getLeaderboard(game);
      
      io.to(`game_${game.pin}`).emit('state-changed', {
        gameState: 'LEADERBOARD',
        leaderboard
      });
    } else if (game.gameState === 'LEADERBOARD') {
      // Go to next question or Podium
      game.currentQuestionIndex++;
      if (game.currentQuestionIndex < game.questions.length) {
        startQuestionIntro(game);
      } else {
        // Game Over! Podium
        game.gameState = 'PODIUM';
        const podium = getLeaderboard(game).slice(0, 3);
        
        // Save podium results persistently
        savePodiumResults(game);

        // Gather all survey questions and compile their top 3 answers
        const surveySummaries = [];
        game.questions.forEach((q, qIdx) => {
          if (q.type === 'survey') {
            const counts = new Array(q.options.length).fill(0);
            for (const player of game.players.values()) {
              const playerAns = player.answers[qIdx];
              if (playerAns) {
                const choice = playerAns.answer.toString().trim().toLowerCase();
                let selectedIndex = -1;
                const numericIndex = parseInt(choice, 10);
                if (!isNaN(numericIndex) && numericIndex >= 0 && numericIndex < q.options.length) {
                  selectedIndex = numericIndex;
                } else {
                  const charCode = choice.charCodeAt(0) - 97;
                  if (choice.length === 1 && charCode >= 0 && charCode < q.options.length) {
                    selectedIndex = charCode;
                  } else {
                    selectedIndex = q.options.findIndex(opt => opt.trim().toLowerCase() === choice);
                  }
                }
                if (selectedIndex >= 0 && selectedIndex < counts.length) {
                  counts[selectedIndex]++;
                }
              }
            }

            // Create list of options with their final count
            const compiledOptions = q.options.map((optText, optIdx) => ({
              text: optText,
              count: counts[optIdx],
              image: (q.optionImages && q.optionImages[optIdx]) || ''
            }));

            // Sort by count descending
            compiledOptions.sort((a, b) => b.count - a.count);

            surveySummaries.push({
              question: q.question,
              questionImage: q.questionimage || '',
              topChoices: compiledOptions.slice(0, 3) // Top 3 choices
            });
          }
        });

        io.to(`game_${game.pin}`).emit('state-changed', {
          gameState: 'PODIUM',
          podium,
          surveys: surveySummaries
        });
      }
    }
  });

  // ----------------------------------------------------
  // PLAYER EVENTS
  // ----------------------------------------------------

  // Player joins lobby
  socket.on('player-join', ({ nickname, avatar }) => {
    const pin = 'local_game';
    const game = games.get(pin);
    if (!game) {
      return socket.emit('join-response', { success: false, message: 'Game lobby is not active. Please wait for the host.' });
    }
    if (game.gameState !== 'LOBBY') {
      return socket.emit('join-response', { success: false, message: 'Game has already started.' });
    }

    // Limit lobby to 50 players
    if (game.players.size >= 50) {
      return socket.emit('join-response', { success: false, message: 'Lobby is full. Max 50 players allowed.' });
    }

    // Check if nickname is taken in this game
    for (const p of game.players.values()) {
      if (p.nickname.toLowerCase() === nickname.toLowerCase().trim()) {
        return socket.emit('join-response', { success: false, message: 'Nickname is already taken.' });
      }
    }

    const cleanNickname = nickname.trim().substring(0, 16);
    const cleanAvatar = avatar ? avatar.trim().substring(0, 2) : '👾';

    const player = {
      socketId: socket.id,
      nickname: cleanNickname,
      avatar: cleanAvatar,
      score: 0,
      streak: 0,
      answers: {}, // questionIndex -> { correct, points, answer, timeTaken }
      lastAnswerCorrect: false
    };

    game.players.set(socket.id, player);
    socket.join(`game_${pin}`);

    socket.emit('join-response', {
      success: true,
      pin,
      nickname: cleanNickname,
      avatar: cleanAvatar,
      gameState: 'LOBBY'
    });

    // Notify Host
    io.to(game.hostSocketId).emit('player-joined', {
      nickname: cleanNickname,
      playerCount: game.players.size,
      players: Array.from(game.players.values()).map(p => ({ nickname: p.nickname, avatar: p.avatar }))
    });

    console.log(`Player ${cleanNickname} joined the local lobby`);
  });

  // Player submits answer
  socket.on('player-submit-answer', ({ answer }) => {
    const pin = 'local_game';
    const game = games.get(pin);
    if (!game || game.gameState !== 'QUESTION') return;
    if (!game.players.has(socket.id)) return;
    if (game.answeredThisQuestion.has(socket.id)) return; // Already answered

    game.answeredThisQuestion.add(socket.id);
    
    const player = game.players.get(socket.id);
    const question = game.questions[game.currentQuestionIndex];
    const timeTaken = (Date.now() - game.questionStartTime) / 1000;
    
    // Check correctness (case-insensitive & strips leading/trailing spaces dynamically)
    let isCorrect = false;
    const cleanAnswer = (answer !== undefined && answer !== null) ? answer.toString().trim().toLowerCase() : '';
    const cleanCorrect = (question.correctanswer !== undefined && question.correctanswer !== null) ? question.correctanswer.toString().trim().toLowerCase() : '';

    if (question.type === 'survey') {
      isCorrect = false;
    } else if (question.type === 'short-answer') {
      isCorrect = cleanAnswer === cleanCorrect;
    } else {
      let selectedText = '';
      
      // Try treating cleanAnswer as a 0-based index
      const numericIndex = parseInt(cleanAnswer, 10);
      if (!isNaN(numericIndex) && numericIndex >= 0 && numericIndex < question.options.length) {
        selectedText = question.options[numericIndex];
      } else {
        // Try treating cleanAnswer as a character code 'a'..'t' (charCode of 'a' is 97)
        const charCode = cleanAnswer.charCodeAt(0) - 97;
        if (cleanAnswer.length === 1 && charCode >= 0 && charCode < question.options.length) {
          selectedText = question.options[charCode];
        }
      }

      if (selectedText) {
        isCorrect = selectedText.trim().toLowerCase() === cleanCorrect;
      } else {
        // Fallback for direct match of text
        isCorrect = cleanAnswer === cleanCorrect;
      }
    }

    // Scoring engine (Accuracy + Speed)
    let pointsAwarded = 0;
    if (question.type === 'survey') {
      pointsAwarded = 0;
      player.lastAnswerCorrect = false;
    } else if (isCorrect) {
      const ratio = Math.min(1, timeTaken / question.timeLimit);
      // TriviaPulse Formula: max 1000, drops down to 500 at max time
      pointsAwarded = Math.max(500, Math.round(1000 * (1 - ratio * 0.5)));
      
      // Streak Bonus
      player.streak++;
      const streakBonus = Math.min(5, player.streak) * 50; // max +250 streak bonus
      pointsAwarded += streakBonus;
      player.lastAnswerCorrect = true;
    } else {
      player.streak = 0;
      player.lastAnswerCorrect = false;
    }

    player.score += pointsAwarded;
    player.answers[game.currentQuestionIndex] = {
      correct: isCorrect,
      points: pointsAwarded,
      answer,
      timeTaken
    };

    game.answersReceived++;

    // Notify Host about answers count
    io.to(game.hostSocketId).emit('answers-count-update', {
      count: game.answersReceived,
      total: game.players.size
    });

    // Send immediate confirmation to player
    socket.emit('answer-accepted', {
      correct: isCorrect,
      score: player.score,
      streak: player.streak,
      isSurvey: question.type === 'survey'
    });

    // If everyone answered, end question immediately
    if (game.answersReceived >= game.players.size) {
      endQuestion(game);
    }
  });

  // ----------------------------------------------------
  // DISCONNECT HANDLER
  // ----------------------------------------------------
  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);

    // If Host disconnected, clean up game
    for (const [pin, game] of games.entries()) {
      if (game.hostSocketId === socket.id) {
        if (game.questionTimeoutId) clearTimeout(game.questionTimeoutId);
        if (game.countdownTimer) clearInterval(game.countdownTimer);
        
        io.to(`game_${pin}`).emit('host-disconnected');
        games.delete(pin);
        console.log(`Game ${pin} removed because Host disconnected.`);
        break;
      }
      
      // If a Player disconnected, notify Host and remove
      if (game.players.has(socket.id)) {
        const player = game.players.get(socket.id);
        game.players.delete(socket.id);
        game.answeredThisQuestion.delete(socket.id);

        console.log(`Player ${player.nickname} left game ${pin}`);

        if (game.gameState === 'LOBBY') {
          io.to(game.hostSocketId).emit('player-left', {
            nickname: player.nickname,
            playerCount: game.players.size,
            players: Array.from(game.players.values()).map(p => ({ nickname: p.nickname, avatar: p.avatar }))
          });
        } else if (game.gameState === 'QUESTION') {
          // Update answer count triggers if a player leaves during active question
          io.to(game.hostSocketId).emit('answers-count-update', {
            count: game.answersReceived,
            total: game.players.size
          });

          if (game.players.size > 0 && game.answersReceived >= game.players.size) {
            endQuestion(game);
          }
        }
        break;
      }
    }
  });
});

// ----------------------------------------------------
// STATE MACHINE TRANSITIONS
// ----------------------------------------------------

function startQuestionIntro(game) {
  if (game.questionTimeoutId) clearTimeout(game.questionTimeoutId);
  if (game.countdownTimer) clearInterval(game.countdownTimer);

  game.gameState = 'INTRO';
  game.answersReceived = 0;
  game.answeredThisQuestion.clear();

  const question = game.questions[game.currentQuestionIndex];
  
  // Safe options copy (hide correct answers for multiple choice)
  const questionInfo = {
    index: game.currentQuestionIndex,
    total: game.questions.length,
    question: question.question,
    type: question.type,
    timeLimit: question.timeLimit,
    questionImage: question.questionimage || '',
    optionImages: question.optionImages || [],
    options: question.options || []
  };

  io.to(`game_${game.pin}`).emit('state-changed', {
    gameState: 'INTRO',
    question: questionInfo
  });

  // Wait 4 seconds for Intro, then start question
  game.questionTimeoutId = setTimeout(() => {
    startQuestionActive(game, questionInfo);
  }, 4000);
}

function startQuestionActive(game, questionInfo) {
  game.gameState = 'QUESTION';
  game.questionStartTime = Date.now();
  game.timeRemaining = questionInfo.timeLimit;

  io.to(`game_${game.pin}`).emit('state-changed', {
    gameState: 'QUESTION',
    question: questionInfo
  });

  // Emitting countdown timer
  game.countdownTimer = setInterval(() => {
    game.timeRemaining--;
    io.to(`game_${game.pin}`).emit('timer-update', {
      timeRemaining: game.timeRemaining
    });

    if (game.timeRemaining <= 0) {
      clearInterval(game.countdownTimer);
    }
  }, 1000);

  // Auto-end question when time limit expires
  game.questionTimeoutId = setTimeout(() => {
    endQuestion(game);
  }, questionInfo.timeLimit * 1000);
}

function endQuestion(game) {
  if (game.questionTimeoutId) clearTimeout(game.questionTimeoutId);
  if (game.countdownTimer) clearInterval(game.countdownTimer);

  game.gameState = 'RESULTS';
  const question = game.questions[game.currentQuestionIndex];

  // Calculate statistics dynamically
  let stats;
  if (question.type === 'multiple-choice' || question.type === 'true-false' || question.type === 'survey') {
    stats = new Array(question.options.length).fill(0);
  } else {
    stats = { shortAnswerMatches: 0, shortAnswerWrong: 0 };
  }
  
  for (const player of game.players.values()) {
    const playerAnswer = player.answers[game.currentQuestionIndex];
    if (playerAnswer) {
      if (question.type === 'multiple-choice' || question.type === 'true-false' || question.type === 'survey') {
        const choice = playerAnswer.answer.toString().trim().toLowerCase();
        let selectedIndex = -1;
        
        // Match index or char code
        const numericIndex = parseInt(choice, 10);
        if (!isNaN(numericIndex) && numericIndex >= 0 && numericIndex < question.options.length) {
          selectedIndex = numericIndex;
        } else {
          const charCode = choice.charCodeAt(0) - 97;
          if (choice.length === 1 && charCode >= 0 && charCode < question.options.length) {
            selectedIndex = charCode;
          } else {
            // Find option text index
            selectedIndex = question.options.findIndex(opt => opt.trim().toLowerCase() === choice);
          }
        }
        
        if (selectedIndex >= 0 && selectedIndex < stats.length) {
          stats[selectedIndex]++;
        }
      } else if (question.type === 'short-answer') {
        if (playerAnswer.correct) stats.shortAnswerMatches++;
        else stats.shortAnswerWrong++;
      }
    }
  }

  // Send results to everybody
  // For players, let them know if they got it right, their score, and their rank.
  const leaderboard = getLeaderboard(game);

  for (const [socketId, player] of game.players.entries()) {
    const playerAns = player.answers[game.currentQuestionIndex];
    const isCorrect = playerAns ? playerAns.correct : false;
    const pointsGained = playerAns ? playerAns.points : 0;
    const playerRank = leaderboard.findIndex(p => p.nickname === player.nickname) + 1;

    io.to(socketId).emit('question-over', {
      correct: isCorrect,
      correctAnswer: question.correctanswer,
      pointsGained,
      totalScore: player.score,
      streak: player.streak,
      rank: playerRank,
      wasAnswered: !!playerAns,
      isSurvey: question.type === 'survey'
    });
  }

  // Notify Host
  io.to(game.hostSocketId).emit('state-changed', {
    gameState: 'RESULTS',
    correctAnswer: question.correctanswer,
    stats,
    leaderboard
  });
}

function getLeaderboard(game) {
  return Array.from(game.players.values())
    .map(p => ({
      nickname: p.nickname,
      score: p.score,
      streak: p.streak,
      lastAnswerCorrect: p.lastAnswerCorrect
    }))
    .sort((a, b) => b.score - a.score);
}

function savePodiumResults(game) {
  try {
    const resultsDir = path.join(__dirname, 'results');
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir);
    }

    const leaderboard = getLeaderboard(game);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `podium_${game.quizName.toLowerCase().replace(/\s+/g, '_')}_${timestamp}.txt`;
    const filepath = path.join(resultsDir, filename);

    let content = `====================================================\n`;
    content += ` TRIVIAPULSE GAME RESULTS\n`;
    content += `====================================================\n`;
    content += `Date/Time  : ${new Date().toLocaleString()}\n`;
    content += `Quiz Name  : ${game.quizName}\n`;
    content += `Total Players: ${game.players.size}\n\n`;

    content += `🏆 FINAL CHAMPIONS (PODIUM) 🏆\n`;
    content += `----------------------------------------------------\n`;
    
    const places = ['1st Place 🥇', '2nd Place 🥈', '3rd Place 🥉'];
    const podium = leaderboard.slice(0, 3);
    
    podium.forEach((player, idx) => {
      content += `${places[idx]}: ${player.nickname} - ${player.score} pts (Streak: ${player.streak})\n`;
    });
    
    content += `\nFULL STANDINGS\n`;
    content += `----------------------------------------------------\n`;
    leaderboard.forEach((player, idx) => {
      content += `${idx + 1}. ${player.nickname} - ${player.score} pts (Streak: ${player.streak})\n`;
    });
    content += `====================================================\n`;

    fs.writeFileSync(filepath, content, 'utf-8');
    console.log(`Podium results saved successfully to ${filepath}`);

  } catch (error) {
    console.error('Failed to save podium results:', error);
  }
}

// Start Server
server.listen(PORT, HOST, () => {
  if (isTunnel) {
    console.log(`TriviaPulse server is running LOCALLY on http://127.0.0.1:${PORT}`);
    console.log(`Starting background Pinggy tunnel...`);
    startPinggyTunnel();
  } else if (isLan) {
    console.log(`TriviaPulse server is running on http://localhost:${PORT}`);
    console.log(`LAN players can join at http://${getLocalIpAddress()}:${PORT}`);
  } else {
    console.log(`TriviaPulse server is running LOCALLY on http://localhost:${PORT}`);
    console.log(`(LAN multiplayer is disabled. Restart with 'node server.js --lan' to allow others to join on Wi-Fi)`);
  }
});

function startPinggyTunnel() {
  const { spawn } = require('child_process');
  
  console.log('Spawning: ssh -p 443 -R 0:localhost:3000 -o StrictHostKeyChecking=no free@a.pinggy.io');
  
  tunnelProcess = spawn('ssh', [
    '-p', '443',
    '-R', `0:localhost:${PORT}`,
    '-o', 'StrictHostKeyChecking=no',
    'free@a.pinggy.io'
  ]);

  const urlRegex = /(https?:\/\/[a-z0-9-.]+\.pinggy(?:-free)?\.link)/gi;

  function handleStreamData(data) {
    const chunk = data.toString();
    // Forward tunnel messages to standard console for transparency
    process.stdout.write(chunk);

    const matches = chunk.match(urlRegex);
    if (matches) {
      // Prioritize HTTPS URL
      const httpsUrl = matches.find(url => url.startsWith('https://'));
      const resolvedUrl = httpsUrl || matches[0];

      if (resolvedUrl !== publicTunnelUrl) {
        publicTunnelUrl = resolvedUrl;
        console.log(`\n====================================================`);
        console.log(`🏆 PUBLIC PINGGY TUNNEL RESOLVED: ${publicTunnelUrl}`);
        console.log(`====================================================\n`);
        
        // Broadcast resolved tunnel URL to all connected sockets
        io.emit('tunnel-url-updated', { url: publicTunnelUrl });
      }
    }
  }

  tunnelProcess.stdout.on('data', handleStreamData);
  tunnelProcess.stderr.on('data', handleStreamData);

  tunnelProcess.on('close', (code) => {
    console.log(`Pinggy SSH process exited with code ${code}`);
    publicTunnelUrl = '';
  });
}
