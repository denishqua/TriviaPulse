const socket = io();

// State tracking
let currentPin = null;
let currentQuestion = null;
let quizName = '';
let questionCount = 0;
let timeRemainingInterval = null;

// DOM Elements
const stateSetup = document.getElementById('state-setup');
const stateLobby = document.getElementById('state-lobby');
const stateIntro = document.getElementById('state-intro');
const stateQuestion = document.getElementById('state-question');
const stateResults = document.getElementById('state-results');
const stateLeaderboard = document.getElementById('state-leaderboard');
const statePodium = document.getElementById('state-podium');

const quizSelect = document.getElementById('quiz-select');
const btnCreateLobby = document.getElementById('btn-create-lobby');
const setupError = document.getElementById('setup-error');

const lobbyUrl = document.getElementById('lobby-url');
const lobbyPin = document.getElementById('lobby-pin');
const lobbyPlayerCount = document.getElementById('lobby-player-count');
const lobbyPlayersGrid = document.getElementById('lobby-players-grid');
const btnStartGame = document.getElementById('btn-start-game');

const introQIndex = document.getElementById('intro-q-index');
const introQTitle = document.getElementById('intro-q-title');
const introCountdown = document.getElementById('intro-countdown');

const questionQIndex = document.getElementById('question-q-index');
const questionTimer = document.getElementById('question-timer');
const questionQTitle = document.getElementById('question-q-title');
const questionAnswersGrid = document.getElementById('question-answers-grid');
const questionAnswersCount = document.getElementById('question-answers-count');
const btnShowResults = document.getElementById('btn-show-results');

const cardOptA = document.getElementById('card-opt-A');
const cardOptB = document.getElementById('card-opt-B');
const cardOptC = document.getElementById('card-opt-C');
const cardOptD = document.getElementById('card-opt-D');
const lblOptA = document.getElementById('lbl-opt-A');
const lblOptB = document.getElementById('lbl-opt-B');
const lblOptC = document.getElementById('lbl-opt-C');
const lblOptD = document.getElementById('lbl-opt-D');

const resultsQTitle = document.getElementById('results-q-title');
const resultsChart = document.getElementById('results-chart');
const resultsCorrectText = document.getElementById('results-correct-text');
const btnNext = document.getElementById('btn-next');

const barOptA = document.getElementById('bar-opt-A');
const barOptB = document.getElementById('bar-opt-B');
const barOptC = document.getElementById('bar-opt-C');
const barOptD = document.getElementById('bar-opt-D');
const barLblOptA = document.getElementById('bar-lbl-opt-A');
const barLblOptB = document.getElementById('bar-lbl-opt-B');
const barLblOptC = document.getElementById('bar-lbl-opt-C');
const barLblOptD = document.getElementById('bar-lbl-opt-D');

const leaderboardList = document.getElementById('leaderboard-list');
const btnLeaderboardNext = document.getElementById('btn-leaderboard-next');

// Initial Load: Fetch available quizzes
window.addEventListener('DOMContentLoaded', () => {
  fetch('/api/quizzes')
    .then(res => res.json())
    .catch(err => {
      console.error(err);
      setupError.textContent = 'Could not contact server API.';
    })
    .then(data => {
      if (!data || !data.quizzes) return;
      
      quizSelect.innerHTML = '<option value="" disabled selected>Choose a Quiz...</option>';
      data.quizzes.forEach(quiz => {
        const opt = document.createElement('option');
        opt.value = quiz.id;
        opt.textContent = quiz.name;
        quizSelect.appendChild(opt);
      });
      
      btnCreateLobby.disabled = false;
    });
});

// Event: Select Quiz
btnCreateLobby.addEventListener('click', () => {
  const quizId = quizSelect.value;
  if (!quizId) {
    setupError.textContent = 'Please choose a quiz first.';
    return;
  }
  setupError.textContent = '';
  socket.emit('host-create-game', { quizId });
});

// Event: Socket Created Game Successfully
socket.on('game-created', (data) => {
  currentPin = data.pin;
  quizName = data.quizName;
  questionCount = data.questionCount;
  
  document.getElementById('header-quiz-name').textContent = quizName;

  // Render join url
  let joinUrlText;
  let shouldRenderQR = true;
  
  if (data.localIp.startsWith('http://') || data.localIp.startsWith('https://')) {
    joinUrlText = data.localIp;
  } else if (data.localIp === 'Generating tunnel...') {
    joinUrlText = 'Generating tunnel...';
    shouldRenderQR = false;
  } else {
    joinUrlText = `http://${data.localIp}:${data.port}`;
  }
  
  lobbyUrl.textContent = joinUrlText;
  
  // Generate scan-to-join QR Code (Scaled up for far distance scanning)
  const qrContainer = document.getElementById('lobby-qr');
  if (qrContainer) {
    qrContainer.innerHTML = ''; // Clear previous instances
    if (shouldRenderQR) {
      new QRCode(qrContainer, {
        text: joinUrlText,
        width: 200,
        height: 200,
        colorDark: "#060417",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.M
      });
    } else {
      qrContainer.innerHTML = '<div style="width: 200px; height: 200px; display: flex; align-items: center; justify-content: center; text-align: center; color: var(--text-secondary); font-size: 0.9rem; font-weight: 600;">Waiting for tunnel...</div>';
    }
  }

  if (lobbyPin) {
    lobbyPin.textContent = data.pin;
  }
  
  showSection(stateLobby);
});

// Event: Pinggy tunnel URL generated
socket.on('tunnel-url-updated', (data) => {
  console.log('Tunnel URL received:', data.url);
  lobbyUrl.textContent = data.url;
  
  const qrContainer = document.getElementById('lobby-qr');
  if (qrContainer) {
    qrContainer.innerHTML = '';
    new QRCode(qrContainer, {
      text: data.url,
      width: 200,
      height: 200,
      colorDark: "#060417",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M
    });
  }
});

// Event: New Player Joins Lobby
socket.on('player-joined', (data) => {
  lobbyPlayerCount.textContent = data.playerCount;
  
  // Render player name bubbles
  lobbyPlayersGrid.innerHTML = '';
  data.players.forEach(nickname => {
    const bubble = document.createElement('div');
    bubble.className = 'player-bubble';
    bubble.textContent = nickname;
    lobbyPlayersGrid.appendChild(bubble);
  });

  if (data.playerCount > 0) {
    btnStartGame.style.display = 'inline-block';
  } else {
    btnStartGame.style.display = 'none';
  }
});

// Event: Player Leaves Lobby
socket.on('player-left', (data) => {
  lobbyPlayerCount.textContent = data.playerCount;
  
  lobbyPlayersGrid.innerHTML = '';
  data.players.forEach(nickname => {
    const bubble = document.createElement('div');
    bubble.className = 'player-bubble';
    bubble.textContent = nickname;
    lobbyPlayersGrid.appendChild(bubble);
  });

  if (data.playerCount > 0) {
    btnStartGame.style.display = 'inline-block';
  } else {
    btnStartGame.style.display = 'none';
  }
});

// Event: Start Game Click
btnStartGame.addEventListener('click', () => {
  if (currentPin) {
    socket.emit('host-start-game', { pin: currentPin });
  }
});

// Event: Skip Timer Click
btnShowResults.addEventListener('click', () => {
  if (currentPin) {
    socket.emit('host-show-results', { pin: currentPin });
  }
});

// Event: Next Click (from results)
btnNext.addEventListener('click', () => {
  if (currentPin) {
    socket.emit('host-next', { pin: currentPin });
  }
});

// Event: Next Question Click (from leaderboard)
btnLeaderboardNext.addEventListener('click', () => {
  if (currentPin) {
    socket.emit('host-next', { pin: currentPin });
  }
});

// Event: Answers Count Update during Active Question
socket.on('answers-count-update', (data) => {
  questionAnswersCount.textContent = data.count;
});

// Event: Timer Update during Active Question
socket.on('timer-update', (data) => {
  questionTimer.textContent = data.timeRemaining;
  if (data.timeRemaining <= 5) {
    questionTimer.classList.add('warning');
  } else {
    questionTimer.classList.remove('warning');
  }
});

// Main State Machine Orchestrator
socket.on('state-changed', (data) => {
  const state = data.gameState;
  console.log('State changed:', state);

  if (state === 'INTRO') {
    currentQuestion = data.question;
    
    // Configure question details
    introQIndex.textContent = `QUESTION ${currentQuestion.index + 1} OF ${questionCount}`;
    introQTitle.textContent = currentQuestion.question;
    
    const typeLabels = {
      'multiple-choice': 'Multiple Choice 📝',
      'true-false': 'True / False ⚖️',
      'short-answer': 'Short Answer ✍️'
    };
    document.getElementById('intro-q-type').textContent = typeLabels[currentQuestion.type] || currentQuestion.type.toUpperCase();
    
    showSection(stateIntro);
    
    // Sound/visual trigger for countdown
    let secondsLeft = 4;
    introCountdown.textContent = secondsLeft;
    const interval = setInterval(() => {
      secondsLeft--;
      if (secondsLeft > 0) {
        introCountdown.textContent = secondsLeft;
      } else {
        clearInterval(interval);
      }
    }, 1000);

  } else if (state === 'QUESTION') {
    // Render question page
    questionQIndex.textContent = `QUESTION ${currentQuestion.index + 1} OF ${questionCount}`;
    questionTimer.textContent = currentQuestion.timeLimit;
    questionTimer.classList.remove('warning');
    questionQTitle.textContent = currentQuestion.question;
    questionAnswersCount.textContent = '0';
    
    const typeLabels = {
      'multiple-choice': 'Multiple Choice 📝',
      'true-false': 'True / False ⚖️',
      'short-answer': 'Short Answer ✍️'
    };
    document.getElementById('question-q-type').textContent = typeLabels[currentQuestion.type] || currentQuestion.type.toUpperCase();
    
    // Check question type to render answers layout
    if (currentQuestion.type === 'multiple-choice') {
      questionAnswersGrid.style.display = 'grid';
      questionAnswersGrid.style.gridTemplateColumns = 'repeat(2, 1fr)';
      
      // Reset True/False swaps to defaults
      cardOptA.className = 'answer-card red';
      cardOptA.querySelector('.answer-shape').innerHTML = '<div class="shape-tri"></div>';
      cardOptB.className = 'answer-card blue';
      cardOptB.querySelector('.answer-shape').innerHTML = '<div class="shape-dia"></div>';
      
      cardOptA.style.display = 'flex';
      cardOptB.style.display = 'flex';
      cardOptC.style.display = 'flex';
      cardOptD.style.display = 'flex';
      
      lblOptA.textContent = currentQuestion.options.A;
      lblOptB.textContent = currentQuestion.options.B;
      lblOptC.textContent = currentQuestion.options.C;
      lblOptD.textContent = currentQuestion.options.D;
    } else if (currentQuestion.type === 'true-false') {
      questionAnswersGrid.style.display = 'grid';
      questionAnswersGrid.style.gridTemplateColumns = 'repeat(2, 1fr)';
      
      // Swap colors and shapes to align with standard (True = Blue Diamond, False = Red Triangle)
      cardOptA.className = 'answer-card blue';
      cardOptA.querySelector('.answer-shape').innerHTML = '<div class="shape-dia"></div>';
      
      cardOptB.className = 'answer-card red';
      cardOptB.querySelector('.answer-shape').innerHTML = '<div class="shape-tri"></div>';
      
      cardOptA.style.display = 'flex';
      cardOptB.style.display = 'flex';
      cardOptC.style.display = 'none';
      cardOptD.style.display = 'none';
      
      lblOptA.textContent = 'True';
      lblOptB.textContent = 'False';
    } else if (currentQuestion.type === 'short-answer') {
      // Hide standard options grid for short answer
      questionAnswersGrid.style.display = 'none';
    }

    showSection(stateQuestion);

  } else if (state === 'RESULTS') {
    resultsQTitle.textContent = currentQuestion.question;
    resultsCorrectText.textContent = data.correctAnswer;
    
    // Render chart bars based on stats
    const stats = data.stats;
    const totalAnswers = Object.values(stats).reduce((acc, curr) => acc + curr, 0);

    const getPercent = (count) => {
      if (totalAnswers === 0) return '0%';
      return `${Math.round((count / totalAnswers) * 100)}%`;
    };

    if (currentQuestion.type === 'short-answer') {
      // Modify chart labels & display for Short Answer matches
      resultsChart.style.display = 'flex';
      
      // Let Red bar represent Incorrect matches, Green represents Correct
      cardOptC.style.display = 'none';
      cardOptD.style.display = 'none';
      
      barOptA.className = 'chart-bar green';
      barOptB.className = 'chart-bar red';
      barOptC.parentElement.style.display = 'none';
      barOptD.parentElement.style.display = 'none';
      
      barLblOptA.textContent = `${stats.shortAnswerMatches} Correct`;
      barOptA.style.setProperty('--final-height', getPercent(stats.shortAnswerMatches));
      
      barLblOptB.textContent = `${stats.shortAnswerWrong} Wrong`;
      barOptB.style.setProperty('--final-height', getPercent(stats.shortAnswerWrong));

      // Set Short Answer text labels
      document.getElementById('chart-txt-A').textContent = 'Correct Match';
      document.getElementById('chart-txt-B').textContent = 'Incorrect Match';
    } else {
      // Render standard choice bars
      resultsChart.style.display = 'flex';
      
      barOptA.parentElement.style.display = 'flex';
      barOptB.parentElement.style.display = 'flex';

      // Set text and check layout swaps for True/False colors
      if (currentQuestion.type === 'true-false') {
        barOptA.className = 'chart-bar blue';
        barOptB.className = 'chart-bar red';
        
        barOptA.parentElement.querySelector('.chart-label').innerHTML = '<div class="shape-dia" style="width: 18px; height: 18px;"></div><span id="chart-txt-A" style="font-size: 0.85rem; font-weight: 700; max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary);">True</span>';
        barOptB.parentElement.querySelector('.chart-label').innerHTML = '<div class="shape-tri" style="border-bottom-width: 20px; border-left-width: 12px; border-right-width: 12px;"></div><span id="chart-txt-B" style="font-size: 0.85rem; font-weight: 700; max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary);">False</span>';

        document.getElementById('chart-txt-A').textContent = 'True';
        document.getElementById('chart-txt-B').textContent = 'False';
        
        barOptC.parentElement.style.display = 'none';
        barOptD.parentElement.style.display = 'none';
      } else {
        // Multiple choice defaults
        barOptA.className = 'chart-bar red';
        barOptB.className = 'chart-bar blue';
        
        barOptA.parentElement.querySelector('.chart-label').innerHTML = '<div class="shape-tri" style="border-bottom-width: 20px; border-left-width: 12px; border-right-width: 12px;"></div><span id="chart-txt-A" style="font-size: 0.85rem; font-weight: 700; max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary);">Option A</span>';
        barOptB.parentElement.querySelector('.chart-label').innerHTML = '<div class="shape-dia" style="width: 18px; height: 18px;"></div><span id="chart-txt-B" style="font-size: 0.85rem; font-weight: 700; max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary);">Option B</span>';

        document.getElementById('chart-txt-A').textContent = currentQuestion.options.A;
        document.getElementById('chart-txt-B').textContent = currentQuestion.options.B;
      }
      
      barLblOptA.textContent = stats.A;
      barOptA.style.setProperty('--final-height', getPercent(stats.A));
      
      barLblOptB.textContent = stats.B;
      barOptB.style.setProperty('--final-height', getPercent(stats.B));

      if (currentQuestion.type === 'multiple-choice') {
        barOptC.parentElement.style.display = 'flex';
        barOptD.parentElement.style.display = 'flex';
        
        barLblOptC.textContent = stats.C;
        barOptC.style.setProperty('--final-height', getPercent(stats.C));
        
        barLblOptD.textContent = stats.D;
        barOptD.style.setProperty('--final-height', getPercent(stats.D));

        document.getElementById('chart-txt-C').textContent = currentQuestion.options.C;
        document.getElementById('chart-txt-D').textContent = currentQuestion.options.D;
      } else if (currentQuestion.type !== 'true-false') {
        barOptC.parentElement.style.display = 'none';
        barOptD.parentElement.style.display = 'none';
      }
    }

    showSection(stateResults);

  } else if (state === 'LEADERBOARD') {
    // Populate leaderboard top 5 list
    leaderboardList.innerHTML = '';
    const topFive = data.leaderboard.slice(0, 5);
    
    topFive.forEach((player, idx) => {
      const row = document.createElement('div');
      row.className = `leaderboard-row ${idx < 3 ? 'top-three' : ''}`;
      
      let streakBadge = '';
      if (player.streak >= 2) {
        streakBadge = `<span class="streak-tag">🔥 STREAK x${player.streak}</span>`;
      }

      row.innerHTML = `
        <div class="left">
          <span class="rank">${idx + 1}</span>
          <span>${escapeHtml(player.nickname)} ${streakBadge}</span>
        </div>
        <div class="score">${player.score}</div>
      `;
      leaderboardList.appendChild(row);
    });

    if (currentQuestion.index + 1 < questionCount) {
      btnLeaderboardNext.textContent = 'Next Question';
    } else {
      btnLeaderboardNext.textContent = 'Show Podium';
    }

    showSection(stateLeaderboard);

  } else if (state === 'PODIUM') {
    const podium = data.podium;
    
    // Animate Podium values
    const first = podium[0];
    const second = podium[1];
    const third = podium[2];

    const showPodiumMember = (idPrefix, playerData) => {
      const col = document.getElementById(`podium-${idPrefix}`);
      if (playerData) {
        document.getElementById(`podium-${idPrefix}-name`).textContent = escapeHtml(playerData.nickname);
        document.getElementById(`podium-${idPrefix}-score`).textContent = `${playerData.score} pts`;
        col.style.opacity = '1';
        col.className += ' animate-float';
      } else {
        col.style.opacity = '0';
      }
    };

    // Sequential load to wow the host
    setTimeout(() => showPodiumMember('3rd', third), 500);
    setTimeout(() => showPodiumMember('2nd', second), 1500);
    setTimeout(() => showPodiumMember('1st', first), 2500);

    showSection(statePodium);
  }
});

// Helper: Show/Hide sections
function showSection(sectionToShow) {
  [stateSetup, stateLobby, stateIntro, stateQuestion, stateResults, stateLeaderboard, statePodium].forEach(sec => {
    sec.style.display = 'none';
  });
  sectionToShow.style.display = 'flex';
  if (sectionToShow === stateLobby || sectionToShow === stateQuestion || sectionToShow === stateResults) {
    sectionToShow.style.display = 'block'; // Block grid layouts
  } else if (sectionToShow === stateSetup || sectionToShow === stateIntro || sectionToShow === stateLeaderboard || sectionToShow === statePodium) {
    sectionToShow.style.display = 'flex';
    sectionToShow.style.flexDirection = 'column';
  }
}

// Helper: Escape HTML
function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
