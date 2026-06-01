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
const btnEnableTunnel = document.getElementById('btn-enable-tunnel');

const introQIndex = document.getElementById('intro-q-index');
const introQTitle = document.getElementById('intro-q-title');
const introCountdown = document.getElementById('intro-countdown');
const introImageContainer = document.getElementById('intro-image-container');
const introImage = document.getElementById('intro-image');

const questionQIndex = document.getElementById('question-q-index');
const questionTimer = document.getElementById('question-timer');
const questionQTitle = document.getElementById('question-q-title');
const questionImageContainer = document.getElementById('question-image-container');
const questionImage = document.getElementById('question-image');
const questionAnswersGrid = document.getElementById('question-answers-grid');
const questionAnswersCount = document.getElementById('question-answers-count');
const btnShowResults = document.getElementById('btn-show-results');

const resultsQTitle = document.getElementById('results-q-title');
const resultsChart = document.getElementById('results-chart');
const resultsCorrectText = document.getElementById('results-correct-text');
const btnNext = document.getElementById('btn-next');

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
  
  // If the lobby is loaded with a tunnel url already resolved
  const isTunnelUrl = data.localIp.startsWith('http://') || data.localIp.startsWith('https://');

  if (isTunnelUrl) {
    joinUrlText = data.localIp;
    if (btnEnableTunnel) {
      btnEnableTunnel.disabled = true;
      btnEnableTunnel.textContent = '🌐 Remote Play Enabled';
      btnEnableTunnel.style.background = 'linear-gradient(135deg, var(--green-squ), #10b981)';
    }
  } else if (data.localIp === 'Generating tunnel...') {
    joinUrlText = 'Generating tunnel...';
    shouldRenderQR = false;
    if (btnEnableTunnel) {
      btnEnableTunnel.disabled = true;
      btnEnableTunnel.textContent = '🌐 Starting Remote Play...';
      btnEnableTunnel.style.background = 'rgba(255, 255, 255, 0.1)';
    }
  } else {
    joinUrlText = `http://${data.localIp}:${data.port}`;
    if (btnEnableTunnel) {
      btnEnableTunnel.disabled = false;
      btnEnableTunnel.textContent = '🌐 Enable Remote Play';
      btnEnableTunnel.style.background = 'linear-gradient(135deg, var(--purple-neon), var(--pink-neon))';
    }
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

  if (btnEnableTunnel) {
    btnEnableTunnel.disabled = true;
    btnEnableTunnel.textContent = '🌐 Remote Play Enabled';
    btnEnableTunnel.style.background = 'linear-gradient(135deg, var(--green-squ), #10b981)';
  }
  
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

function renderLobbyPlayers(players) {
  lobbyPlayersGrid.innerHTML = '';
  players.forEach(p => {
    const nickname = p.nickname;
    const avatar = p.avatar || '👾';
    
    const card = document.createElement('div');
    card.className = 'player-lobby-card';
    
    // Avatar element
    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'player-lobby-avatar';
    avatarDiv.textContent = avatar;
    card.appendChild(avatarDiv);
    
    // Name element
    const nameSpan = document.createElement('span');
    nameSpan.className = 'player-lobby-name';
    nameSpan.textContent = nickname;
    card.appendChild(nameSpan);
    
    // Create kick cross button (styled beautifully)
    const kickBtn = document.createElement('span');
    kickBtn.innerHTML = '&times;';
    kickBtn.style.color = 'var(--red-tri)';
    kickBtn.style.fontWeight = 'bold';
    kickBtn.style.fontSize = '1.6rem';
    kickBtn.style.position = 'absolute';
    kickBtn.style.right = '16px';
    kickBtn.style.top = '50%';
    kickBtn.style.transform = 'translateY(-50%)';
    kickBtn.style.cursor = 'pointer';
    kickBtn.style.transition = 'transform 0.2s';
    
    kickBtn.addEventListener('mouseenter', () => { kickBtn.style.transform = 'translateY(-50%) scale(1.3)'; });
    kickBtn.addEventListener('mouseleave', () => { kickBtn.style.transform = 'translateY(-50%) scale(1)'; });
    
    card.appendChild(kickBtn);
    
    // Clicking the card triggers the kick confirmation dialog
    card.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`Remove player "${nickname}" from the lobby?`)) {
        socket.emit('host-kick-player', { nickname });
      }
    });
    
    lobbyPlayersGrid.appendChild(card);
  });
}

// Event: New Player Joins Lobby
socket.on('player-joined', (data) => {
  lobbyPlayerCount.textContent = data.playerCount;
  renderLobbyPlayers(data.players);

  if (data.playerCount > 0) {
    btnStartGame.style.display = 'inline-block';
  } else {
    btnStartGame.style.display = 'none';
  }
});

// Event: Player Leaves Lobby
socket.on('player-left', (data) => {
  lobbyPlayerCount.textContent = data.playerCount;
  renderLobbyPlayers(data.players);

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

// Event: Enable Tunnel Click
if (btnEnableTunnel) {
  btnEnableTunnel.addEventListener('click', () => {
    btnEnableTunnel.disabled = true;
    btnEnableTunnel.textContent = '🌐 Starting Remote Play...';
    btnEnableTunnel.style.background = 'rgba(255, 255, 255, 0.1)';
    socket.emit('host-start-tunnel');
  });
}

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

  if (data.question) {
    currentQuestion = data.question;
  }

  if (state === 'INTRO') {
    
    // Configure question details
    introQIndex.textContent = `QUESTION ${currentQuestion.index + 1} OF ${questionCount}`;
    introQTitle.textContent = currentQuestion.question;
    
    // Render intro question image if present
    if (introImageContainer && introImage) {
      if (currentQuestion.questionImage) {
        introImage.src = currentQuestion.questionImage;
        introImageContainer.style.display = 'flex';
      } else {
        introImage.src = '';
        introImageContainer.style.display = 'none';
      }
    }

    const typeLabels = {
      'multiple-choice': 'Multiple Choice',
      'true-false': 'True / False',
      'short-answer': 'Short Answer'
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
    
    // Render active question image if present
    if (questionImageContainer && questionImage) {
      if (currentQuestion.questionImage) {
        questionImage.src = currentQuestion.questionImage;
        questionImageContainer.style.display = 'flex';
      } else {
        questionImage.src = '';
        questionImageContainer.style.display = 'none';
      }
    }

    const typeLabels = {
      'multiple-choice': 'Multiple Choice',
      'true-false': 'True / False',
      'short-answer': 'Short Answer',
      'survey': 'Opinion Survey 🗳️'
    };
    document.getElementById('question-q-type').textContent = typeLabels[currentQuestion.type] || currentQuestion.type.toUpperCase();
    
    // Check question type to render answers layout dynamically
    questionAnswersGrid.innerHTML = '';
    
    if (currentQuestion.type === 'multiple-choice' || currentQuestion.type === 'survey') {
      questionAnswersGrid.style.display = 'grid';
      const optCount = currentQuestion.options.length;
      if (optCount <= 4) {
        questionAnswersGrid.style.gridTemplateColumns = 'repeat(2, 1fr)';
      } else if (optCount <= 9) {
        questionAnswersGrid.style.gridTemplateColumns = 'repeat(3, 1fr)';
      } else {
        questionAnswersGrid.style.gridTemplateColumns = 'repeat(4, 1fr)';
      }
      
      const colors = ['red', 'blue', 'yellow', 'green', 'purple', 'pink', 'orange', 'teal', 'cyan', 'amber'];
      const shapes = ['tri', 'dia', 'cir', 'squ', 'hex', 'sta', 'pen', 'cro', 'cre', 'hea'];
      
      currentQuestion.options.forEach((optText, idx) => {
        const color = colors[idx % colors.length];
        const shape = shapes[idx % shapes.length];
        const optImg = (currentQuestion.optionImages && currentQuestion.optionImages[idx]) || '';
        
        const card = document.createElement('div');
        card.className = `answer-card ${color}`;
        card.style.display = 'flex';
        card.style.alignItems = 'center';
        
        const shapeWrapper = document.createElement('div');
        shapeWrapper.className = 'answer-shape';
        
        if (optImg) {
          shapeWrapper.style.width = '54px';
          shapeWrapper.style.height = '54px';
          
          const img = document.createElement('img');
          img.className = 'answer-opt-image';
          img.src = optImg;
          img.style.width = '54px';
          img.style.height = '54px';
          img.style.objectFit = 'contain';
          img.style.borderRadius = '8px';
          img.style.border = '1.5px solid rgba(255,255,255,0.3)';
          img.style.background = 'rgba(255,255,255,0.1)';
          img.style.padding = '2px';
          shapeWrapper.appendChild(img);
        } else {
          const shapeIcon = document.createElement('div');
          shapeIcon.className = `shape-${shape}`;
          shapeWrapper.appendChild(shapeIcon);
        }
        
        card.appendChild(shapeWrapper);
        
        const textSpan = document.createElement('span');
        textSpan.className = 'option-text';
        textSpan.textContent = optText;
        card.appendChild(textSpan);
        
        questionAnswersGrid.appendChild(card);
      });
      
    } else if (currentQuestion.type === 'true-false') {
      questionAnswersGrid.style.display = 'grid';
      questionAnswersGrid.style.gridTemplateColumns = 'repeat(2, 1fr)';
      
      const tfConfig = [
        { text: 'True', color: 'blue', shape: 'dia', img: (currentQuestion.optionImages && currentQuestion.optionImages[0]) || '' },
        { text: 'False', color: 'red', shape: 'tri', img: (currentQuestion.optionImages && currentQuestion.optionImages[1]) || '' }
      ];
      
      tfConfig.forEach(cfg => {
        const card = document.createElement('div');
        card.className = `answer-card ${cfg.color}`;
        card.style.display = 'flex';
        card.style.alignItems = 'center';
        
        const shapeWrapper = document.createElement('div');
        shapeWrapper.className = 'answer-shape';
        
        if (cfg.img) {
          shapeWrapper.style.width = '54px';
          shapeWrapper.style.height = '54px';
          
          const img = document.createElement('img');
          img.className = 'answer-opt-image';
          img.src = cfg.img;
          img.style.width = '54px';
          img.style.height = '54px';
          img.style.objectFit = 'contain';
          img.style.borderRadius = '8px';
          img.style.border = '1.5px solid rgba(255,255,255,0.3)';
          img.style.background = 'rgba(255,255,255,0.1)';
          img.style.padding = '2px';
          shapeWrapper.appendChild(img);
        } else {
          const shapeIcon = document.createElement('div');
          shapeIcon.className = `shape-${cfg.shape}`;
          shapeWrapper.appendChild(shapeIcon);
        }
        
        card.appendChild(shapeWrapper);
        
        const textSpan = document.createElement('span');
        textSpan.className = 'option-text';
        textSpan.textContent = cfg.text;
        card.appendChild(textSpan);
        
        questionAnswersGrid.appendChild(card);
      });
      
    } else if (currentQuestion.type === 'short-answer') {
      questionAnswersGrid.style.display = 'none';
    }

    showSection(stateQuestion);

  } else if (state === 'RESULTS') {
    resultsQTitle.textContent = currentQuestion.question;
    resultsCorrectText.textContent = data.correctAnswer;

    // Hide correct answer section if question is a survey
    const correctAnsContainer = document.querySelector('.results-correct-answer');
    if (correctAnsContainer) {
      if (currentQuestion.type === 'survey') {
        correctAnsContainer.style.display = 'none';
      } else {
        correctAnsContainer.style.display = 'block';
      }
    }
    
    // Render chart bars based on stats dynamically
    const stats = data.stats;
    let totalAnswers = 0;
    if (Array.isArray(stats)) {
      totalAnswers = stats.reduce((acc, curr) => acc + curr, 0);
    } else if (stats) {
      totalAnswers = (stats.shortAnswerMatches || 0) + (stats.shortAnswerWrong || 0);
    }

    const getPercent = (count) => {
      if (totalAnswers === 0) return '0%';
      return `${Math.round((count / totalAnswers) * 100)}%`;
    };

    resultsChart.innerHTML = '';

    // Dynamic Sizing calculations based on options count
    let optCount = 2;
    if (currentQuestion.type === 'multiple-choice' || currentQuestion.type === 'survey') {
      optCount = currentQuestion.options.length;
    } else if (currentQuestion.type === 'true-false') {
      optCount = 2;
    }

    let wrapperWidth = '120px';
    let imgSize = '76px';
    let countFontSize = '1.2rem';
    let labelFontSize = '0.85rem';
    let countTop = '-30px';
    let gap = '20px';
    let chartContainerPadding = '0 40px';

    if (optCount > 12) {
      wrapperWidth = `${Math.floor((1000 - 30) / optCount) - 6}px`; // around 42px for 20 options
      imgSize = '36px'; // smaller images for XL layouts to prevent overflow
      countFontSize = '0.8rem';
      labelFontSize = '0.65rem';
      countTop = '-22px';
      gap = '4px';
      chartContainerPadding = '0 15px'; // Less padding inside the chart container
    } else if (optCount > 8) {
      wrapperWidth = '70px';
      imgSize = '50px';
      countFontSize = '0.95rem';
      labelFontSize = '0.75rem';
      countTop = '-26px';
      gap = '10px';
      chartContainerPadding = '0 25px';
    } else if (optCount > 4) {
      wrapperWidth = '95px';
      imgSize = '64px';
      countFontSize = '1.1rem';
      labelFontSize = '0.8rem';
      countTop = '-28px';
      gap = '16px';
    }

    resultsChart.style.gap = gap;
    resultsChart.style.justifyContent = 'center';
    resultsChart.style.padding = chartContainerPadding;

    if (currentQuestion.type === 'short-answer') {
      resultsChart.style.display = 'flex';
      
      const saConfig = [
        { text: 'Correct Match', color: 'green', count: stats.shortAnswerMatches, shape: 'squ' },
        { text: 'Incorrect Match', color: 'red', count: stats.shortAnswerWrong, shape: 'tri' }
      ];
      
      saConfig.forEach(cfg => {
        const barWrapper = document.createElement('div');
        barWrapper.className = 'chart-bar-wrapper';
        barWrapper.style.width = wrapperWidth;
        
        const bar = document.createElement('div');
        bar.className = `chart-bar ${cfg.color}`;
        bar.style.setProperty('--final-height', getPercent(cfg.count));
        bar.style.height = '0%';
        
        const countLabel = document.createElement('span');
        countLabel.className = 'count-label';
        countLabel.style.fontSize = countFontSize;
        countLabel.style.top = countTop;
        countLabel.textContent = `${cfg.count} (${getPercent(cfg.count)})`;
        bar.appendChild(countLabel);
        
        barWrapper.appendChild(bar);
        
        const labelDiv = document.createElement('div');
        labelDiv.className = 'chart-label';
        labelDiv.style.display = 'flex';
        labelDiv.style.flexDirection = 'column';
        labelDiv.style.alignItems = 'center';
        labelDiv.style.gap = '8px';
        labelDiv.style.marginTop = '10px';
        
        const shapeIcon = document.createElement('div');
        if (cfg.shape === 'tri') {
          shapeIcon.className = 'shape-tri';
          shapeIcon.style.borderBottomWidth = '20px';
          shapeIcon.style.borderLeftWidth = '12px';
          shapeIcon.style.borderRightWidth = '12px';
        } else {
          shapeIcon.className = `shape-${cfg.shape}`;
          shapeIcon.style.width = '18px';
          shapeIcon.style.height = '18px';
        }
        labelDiv.appendChild(shapeIcon);
        
        const textSpan = document.createElement('span');
        textSpan.style.fontSize = labelFontSize;
        textSpan.style.fontWeight = '700';
        textSpan.style.maxWidth = wrapperWidth;
        textSpan.style.overflow = 'hidden';
        textSpan.style.textOverflow = 'ellipsis';
        textSpan.style.whiteSpace = 'nowrap';
        textSpan.style.color = 'var(--text-secondary)';
        textSpan.textContent = cfg.text;
        labelDiv.appendChild(textSpan);
        
        barWrapper.appendChild(labelDiv);
        resultsChart.appendChild(barWrapper);
      });
      
    } else if (currentQuestion.type === 'true-false') {
      resultsChart.style.display = 'flex';
      
      const tfConfig = [
        { text: 'True', color: 'blue', shape: 'dia', count: stats[0] || 0, img: (currentQuestion.optionImages && currentQuestion.optionImages[0]) || '' },
        { text: 'False', color: 'red', shape: 'tri', count: stats[1] || 0, img: (currentQuestion.optionImages && currentQuestion.optionImages[1]) || '' }
      ];
      
      tfConfig.forEach(cfg => {
        const barWrapper = document.createElement('div');
        barWrapper.className = 'chart-bar-wrapper';
        barWrapper.style.width = wrapperWidth;
        
        const bar = document.createElement('div');
        bar.className = `chart-bar ${cfg.color}`;
        bar.style.setProperty('--final-height', getPercent(cfg.count));
        bar.style.height = '0%';
        
        const countLabel = document.createElement('span');
        countLabel.className = 'count-label';
        countLabel.style.fontSize = countFontSize;
        countLabel.style.top = countTop;
        countLabel.textContent = `${cfg.count} (${getPercent(cfg.count)})`;
        bar.appendChild(countLabel);
        
        barWrapper.appendChild(bar);
        
        const labelDiv = document.createElement('div');
        labelDiv.className = 'chart-label';
        labelDiv.style.display = 'flex';
        labelDiv.style.flexDirection = 'column';
        labelDiv.style.alignItems = 'center';
        labelDiv.style.gap = '8px';
        labelDiv.style.marginTop = '10px';
        
        if (cfg.img) {
          const img = document.createElement('img');
          img.src = cfg.img;
          img.style.width = imgSize;
          img.style.height = imgSize;
          img.style.objectFit = 'contain';
          img.style.borderRadius = '8px';
          img.style.border = '1.5px solid rgba(255,255,255,0.3)';
          img.style.background = 'rgba(255,255,255,0.1)';
          img.style.padding = optCount > 12 ? '1px' : '2px';
          labelDiv.appendChild(img);
        } else {
          const shapeIcon = document.createElement('div');
          if (cfg.shape === 'tri') {
            shapeIcon.className = 'shape-tri';
            shapeIcon.style.borderBottomWidth = '20px';
            shapeIcon.style.borderLeftWidth = '12px';
            shapeIcon.style.borderRightWidth = '12px';
          } else {
            shapeIcon.className = `shape-${cfg.shape}`;
            shapeIcon.style.width = '18px';
            shapeIcon.style.height = '18px';
          }
          labelDiv.appendChild(shapeIcon);
        }
        
        const textSpan = document.createElement('span');
        textSpan.style.fontSize = labelFontSize;
        textSpan.style.fontWeight = '700';
        textSpan.style.maxWidth = wrapperWidth;
        textSpan.style.overflow = 'hidden';
        textSpan.style.textOverflow = 'ellipsis';
        textSpan.style.whiteSpace = 'nowrap';
        textSpan.style.color = 'var(--text-secondary)';
        textSpan.textContent = cfg.text;
        labelDiv.appendChild(textSpan);
        
        barWrapper.appendChild(labelDiv);
        resultsChart.appendChild(barWrapper);
      });
      
    } else if (currentQuestion.type === 'multiple-choice') {
      resultsChart.style.display = 'flex';
      
      const colors = ['red', 'blue', 'yellow', 'green', 'purple', 'pink', 'orange', 'teal', 'cyan', 'amber'];
      const shapes = ['tri', 'dia', 'cir', 'squ', 'hex', 'sta', 'pen', 'cro', 'cre', 'hea'];
      
      currentQuestion.options.forEach((optText, idx) => {
        const color = colors[idx % colors.length];
        const shape = shapes[idx % shapes.length];
        const count = stats[idx] || 0;
        const optImg = (currentQuestion.optionImages && currentQuestion.optionImages[idx]) || '';
        
        const barWrapper = document.createElement('div');
        barWrapper.className = 'chart-bar-wrapper';
        barWrapper.style.width = wrapperWidth;
        
        const bar = document.createElement('div');
        bar.className = `chart-bar ${color}`;
        bar.style.setProperty('--final-height', getPercent(count));
        bar.style.height = '0%';
        
        const countLabel = document.createElement('span');
        countLabel.className = 'count-label';
        countLabel.style.fontSize = countFontSize;
        countLabel.style.top = countTop;
        countLabel.textContent = `${count} (${getPercent(count)})`;
        bar.appendChild(countLabel);
        
        barWrapper.appendChild(bar);
        
        const labelDiv = document.createElement('div');
        labelDiv.className = 'chart-label';
        labelDiv.style.display = 'flex';
        labelDiv.style.flexDirection = 'column';
        labelDiv.style.alignItems = 'center';
        labelDiv.style.gap = '8px';
        labelDiv.style.marginTop = '10px';
        
        if (optImg) {
          const img = document.createElement('img');
          img.src = optImg;
          img.style.width = imgSize;
          img.style.height = imgSize;
          img.style.objectFit = 'contain';
          img.style.borderRadius = '8px';
          img.style.border = '1.5px solid rgba(255,255,255,0.3)';
          img.style.background = 'rgba(255,255,255,0.1)';
          img.style.padding = optCount > 12 ? '1px' : '2px';
          labelDiv.appendChild(img);
        } else {
          const shapeIcon = document.createElement('div');
          if (shape === 'tri') {
            shapeIcon.className = 'shape-tri';
            shapeIcon.style.borderBottomWidth = '20px';
            shapeIcon.style.borderLeftWidth = '12px';
            shapeIcon.style.borderRightWidth = '12px';
          } else {
            shapeIcon.className = `shape-${shape}`;
            shapeIcon.style.width = '18px';
            shapeIcon.style.height = '18px';
          }
          labelDiv.appendChild(shapeIcon);
        }
        
        const textSpan = document.createElement('span');
        textSpan.style.fontSize = labelFontSize;
        textSpan.style.fontWeight = '700';
        textSpan.style.maxWidth = wrapperWidth;
        textSpan.style.overflow = 'hidden';
        textSpan.style.textOverflow = 'ellipsis';
        textSpan.style.whiteSpace = 'nowrap';
        textSpan.style.color = 'var(--text-secondary)';
        textSpan.textContent = optText;
        labelDiv.appendChild(textSpan);
        
        barWrapper.appendChild(labelDiv);
        resultsChart.appendChild(barWrapper);
      });
    } else if (currentQuestion.type === 'survey') {
      resultsChart.style.display = 'flex';
      
      const colors = ['red', 'blue', 'yellow', 'green', 'purple', 'pink', 'orange', 'teal', 'cyan', 'amber'];
      const shapes = ['tri', 'dia', 'cir', 'squ', 'hex', 'sta', 'pen', 'cro', 'cre', 'hea'];

      const mappedOptions = currentQuestion.options.map((optText, idx) => {
        return {
          text: optText,
          color: colors[idx % colors.length],
          shape: shapes[idx % shapes.length],
          count: stats[idx] || 0,
          img: (currentQuestion.optionImages && currentQuestion.optionImages[idx]) || ''
        };
      });

      // Sort by count descending (highest votes first)
      mappedOptions.sort((a, b) => b.count - a.count);

      mappedOptions.forEach(opt => {
        const barWrapper = document.createElement('div');
        barWrapper.className = 'chart-bar-wrapper';
        barWrapper.style.width = wrapperWidth;
        
        const bar = document.createElement('div');
        bar.className = `chart-bar ${opt.color}`;
        bar.style.setProperty('--final-height', getPercent(opt.count));
        bar.style.height = '0%';
        
        const countLabel = document.createElement('span');
        countLabel.className = 'count-label';
        countLabel.style.fontSize = countFontSize;
        countLabel.style.top = countTop;
        countLabel.textContent = `${opt.count} (${getPercent(opt.count)})`;
        bar.appendChild(countLabel);
        
        barWrapper.appendChild(bar);
        
        const labelDiv = document.createElement('div');
        labelDiv.className = 'chart-label';
        labelDiv.style.display = 'flex';
        labelDiv.style.flexDirection = 'column';
        labelDiv.style.alignItems = 'center';
        labelDiv.style.gap = '8px';
        labelDiv.style.marginTop = '10px';
        
        if (opt.img) {
          const img = document.createElement('img');
          img.src = opt.img;
          img.style.width = imgSize;
          img.style.height = imgSize;
          img.style.objectFit = 'contain';
          img.style.borderRadius = '8px';
          img.style.border = '1.5px solid rgba(255,255,255,0.3)';
          img.style.background = 'rgba(255,255,255,0.1)';
          img.style.padding = optCount > 12 ? '1px' : '2px';
          labelDiv.appendChild(img);
        } else {
          const shapeIcon = document.createElement('div');
          if (opt.shape === 'tri') {
            shapeIcon.className = 'shape-tri';
            shapeIcon.style.borderBottomWidth = '20px';
            shapeIcon.style.borderLeftWidth = '12px';
            shapeIcon.style.borderRightWidth = '12px';
          } else {
            shapeIcon.className = `shape-${opt.shape}`;
            shapeIcon.style.width = '18px';
            shapeIcon.style.height = '18px';
          }
          labelDiv.appendChild(shapeIcon);
        }
        
        const textSpan = document.createElement('span');
        textSpan.style.fontSize = labelFontSize;
        textSpan.style.fontWeight = '700';
        textSpan.style.maxWidth = wrapperWidth;
        textSpan.style.overflow = 'hidden';
        textSpan.style.textOverflow = 'ellipsis';
        textSpan.style.whiteSpace = 'nowrap';
        textSpan.style.color = 'var(--text-secondary)';
        textSpan.textContent = opt.text;
        labelDiv.appendChild(textSpan);
        
        barWrapper.appendChild(labelDiv);
        resultsChart.appendChild(barWrapper);
      });
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

    // Compile and show Survey Insights review panel if survey data is present
    const surveyPanel = document.getElementById('survey-insights-panel');
    const surveyList = document.getElementById('survey-insights-list');
    
    if (surveyPanel && surveyList) {
      if (data.surveys && data.surveys.length > 0) {
        surveyList.innerHTML = '';
        data.surveys.forEach(survey => {
          const card = document.createElement('div');
          card.className = 'glass-panel';
          card.style.marginBottom = '25px';
          card.style.padding = '25px';
          card.style.borderRadius = '16px';
          card.style.background = 'rgba(255, 255, 255, 0.02)';
          card.style.display = 'flex';
          card.style.flexDirection = 'column';
          card.style.gap = '15px';
          card.style.borderColor = 'rgba(255, 255, 255, 0.1)';

          let imgHtml = '';
          if (survey.questionImage) {
            imgHtml = `
              <div style="flex: 1 1 200px; max-width: 300px; aspect-ratio: 16/9; background: rgba(255, 255, 255, 0.03); border-radius: 12px; padding: 8px; border: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: center; overflow: hidden; height: 150px;">
                <img src="${survey.questionImage}" style="width: 100%; height: 100%; object-fit: contain; border-radius: 8px;" />
              </div>
            `;
          }

          let choicesHtml = '';
          survey.topChoices.forEach((choice, choiceIdx) => {
            const badge = ['🥇', '🥈', '🥉'][choiceIdx] || `${choiceIdx + 1}.`;
            let optImgHtml = '';
            if (choice.image) {
              optImgHtml = `<img src="${choice.image}" style="width: 36px; height: 36px; object-fit: contain; border-radius: 6px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.15); padding: 2px;" />`;
            }

            choicesHtml += `
              <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; border-radius: 10px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05);">
                <div style="display: flex; align-items: center; gap: 12px;">
                  <span style="font-size: 1.4rem; line-height: 1;">${badge}</span>
                  ${optImgHtml}
                  <span style="font-weight: 600; color: var(--text-secondary); font-size: 1rem;">${escapeHtml(choice.text)}</span>
                </div>
                <span style="font-weight: 800; color: var(--purple-neon); font-size: 1.1rem;">${choice.count} ${choice.count === 1 ? 'vote' : 'votes'}</span>
              </div>
            `;
          });

          card.innerHTML = `
            <div style="display: flex; gap: 25px; align-items: center; flex-wrap: wrap;">
              ${imgHtml}
              <div style="flex: 2 1 300px; display: flex; flex-direction: column; gap: 15px; width: 100%;">
                <h3 style="font-size: 1.4rem; font-weight: 700; color: var(--text-primary); margin: 0; line-height: 1.3;">${escapeHtml(survey.question)}</h3>
                <div style="display: flex; flex-direction: column; gap: 10px;">
                  ${choicesHtml}
                </div>
              </div>
            </div>
          `;
          
          surveyList.appendChild(card);
        });
        surveyPanel.style.display = 'block';
      } else {
        surveyPanel.style.display = 'none';
      }
    }

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
