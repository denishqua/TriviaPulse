const socket = io();

// Generate or retrieve persistent playerId
let playerId = localStorage.getItem('trivia_pulse_player_id');
if (!playerId) {
  playerId = 'ply_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);
  localStorage.setItem('trivia_pulse_player_id', playerId);
}

// Memory state
let myPin = 'local_game';
let myNickname = null;
let currentQuestionType = null;

// DOM Panels
const panelJoinNickname = document.getElementById('panel-join-nickname');
const panelLobbyWait = document.getElementById('panel-lobby-wait');
const panelControllerMc = document.getElementById('panel-controller-mc');
const panelControllerTf = document.getElementById('panel-controller-tf');
const panelControllerSa = document.getElementById('panel-controller-sa');
const panelPlayerWait = document.getElementById('panel-player-wait');

const feedbackCorrect = document.getElementById('feedback-correct');
const feedbackIncorrect = document.getElementById('feedback-incorrect');

// Inputs & Buttons
const inputNickname = document.getElementById('input-nickname');
const btnSubmitNickname = document.getElementById('btn-submit-nickname');
const nicknameError = document.getElementById('nickname-error');

const waitPlayerName = document.getElementById('wait-player-name');
const playerNicknameHeader = document.getElementById('player-nickname-header');

const inputShortAnswer = document.getElementById('input-short-answer');
const btnSubmitShortAnswer = document.getElementById('btn-submit-short-answer');

const playerWaitMessage = document.getElementById('player-wait-message');

// Survey Multi-Votes DOM
const surveyVotesHeader = document.getElementById('survey-votes-header');
const surveyVotesCount = document.getElementById('survey-votes-count');
const btnSubmitSurveyVotes = document.getElementById('btn-submit-survey-votes');

// Avatar UI Selectors
const avatarPicker = document.getElementById('avatar-picker');
const inputCustomAvatar = document.getElementById('input-custom-avatar');
const waitPlayerAvatar = document.getElementById('wait-player-avatar');

// Predefined cool game emojis for instant selection
const defaultEmojis = ['👾', '🚀', '🦊', '🦄', '🐼', '🐯', '🦖', '🍕', '🍩', '🥑', '🎮', '🎲', '🏆', '💎', '🎸', '⚡', '🔥', '🌈', '🔮', '🛸'];
let selectedAvatar = defaultEmojis[Math.floor(Math.random() * defaultEmojis.length)];

// Render predefined avatar options
if (avatarPicker) {
  defaultEmojis.forEach(emoji => {
    const opt = document.createElement('div');
    opt.className = 'avatar-option';
    opt.textContent = emoji;
    if (emoji === selectedAvatar) {
      opt.classList.add('active');
    }
    
    opt.addEventListener('click', () => {
      if (inputCustomAvatar) inputCustomAvatar.value = '';
      document.querySelectorAll('.avatar-option').forEach(el => el.classList.remove('active'));
      opt.classList.add('active');
      selectedAvatar = emoji;
    });
    
    avatarPicker.appendChild(opt);
  });
}

// Listen to custom emoji typing
if (inputCustomAvatar) {
  inputCustomAvatar.addEventListener('input', () => {
    const customVal = inputCustomAvatar.value.trim();
    if (customVal) {
      document.querySelectorAll('.avatar-option').forEach(el => el.classList.remove('active'));
      selectedAvatar = customVal;
    } else {
      const activeOpt = document.querySelector('.avatar-option');
      if (activeOpt) {
        activeOpt.classList.add('active');
        selectedAvatar = activeOpt.textContent;
      }
    }
  });
}

// Feedback details
const lblFeedbackPointsGained = document.getElementById('lbl-feedback-points-gained');
const lblFeedbackStreak = document.getElementById('lbl-feedback-streak');
const lblFeedbackRankC = document.getElementById('lbl-feedback-rank-c');
const lblFeedbackRankI = document.getElementById('lbl-feedback-rank-i');
const lblFeedbackIncorrectTitle = document.getElementById('lbl-feedback-incorrect-title');
const feedbackCorrectAnswerContainer = document.getElementById('feedback-correct-answer-container');
const lblFeedbackCorrectAnswer = document.getElementById('lbl-feedback-correct-answer');

// Nickname Join Submit Handler
btnSubmitNickname.addEventListener('click', () => {
  const nickname = inputNickname.value.trim();
  if (!nickname) {
    nicknameError.textContent = 'Please enter a nickname.';
    return;
  }
  nicknameError.textContent = '';
  
  const avatar = (inputCustomAvatar && inputCustomAvatar.value.trim()) || selectedAvatar;
  
  // Send join payload to server
  socket.emit('player-join', { nickname, avatar, playerId, pin: myPin });
});

// Join Response
socket.on('join-response', (data) => {
  if (data.success) {
    myNickname = data.nickname;
    const avatar = data.avatar || '👾';
    
    // Save to localStorage for auto-rejoin
    localStorage.setItem('trivia_pulse_room_pin', myPin);
    localStorage.setItem('trivia_pulse_nickname', myNickname);
    localStorage.setItem('trivia_pulse_avatar', avatar);

    playerNicknameHeader.innerHTML = `<span style="margin-right: 8px;">${avatar}</span>${myNickname}`;
    if (waitPlayerAvatar) {
      waitPlayerAvatar.textContent = avatar;
    }
    waitPlayerName.textContent = myNickname;
    
    panelJoinNickname.style.display = 'none';
    panelLobbyWait.style.display = 'flex';
  } else {
    // Clear saved join info on error to prevent endless loops
    localStorage.removeItem('trivia_pulse_room_pin');
    localStorage.removeItem('trivia_pulse_nickname');
    localStorage.removeItem('trivia_pulse_avatar');
    nicknameError.textContent = data.message;
  }
});

// 3. Controller Actions (Answer Submissions)
const submitAnswer = (ans) => {
  if (!myPin) return;
  socket.emit('player-submit-answer', { pin: myPin, answer: ans });
  
  // Transition player to waiting panel immediately after answering
  showPanel(panelPlayerWait);
  playerWaitMessage.textContent = 'Answer submitted! Waiting for other players...';
};

// Map True/False Buttons (True -> index 0, False -> index 1)
document.getElementById('pbtn-tf-true').addEventListener('click', () => submitAnswer(0));
document.getElementById('pbtn-tf-false').addEventListener('click', () => submitAnswer(1));

// Map Short Answer Text Submit
btnSubmitShortAnswer.addEventListener('click', () => {
  const textVal = inputShortAnswer.value.trim();
  if (!textVal) return;
  submitAnswer(textVal);
});

// Submit short answer on Enter key
inputShortAnswer.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    const textVal = inputShortAnswer.value.trim();
    if (!textVal) return;
    submitAnswer(textVal);
  }
});

// Game state transitions broadcasted to players
const handleStateChanged = (data) => {
  const state = data.gameState;
  console.log('Player State changed:', state);

  // Hide feedback screens
  feedbackCorrect.style.display = 'none';
  feedbackIncorrect.style.display = 'none';

  if (state === 'LOBBY') {
    showPanel(panelLobbyWait);
  } else if (state === 'INTRO') {
    showPanel(panelPlayerWait);
    playerWaitMessage.textContent = 'Get ready! Look at the host screen.';
  } else if (state === 'QUESTION') {
    currentQuestionType = data.question.type;

    if (currentQuestionType === 'multiple-choice' || currentQuestionType === 'survey') {
      showPanel(panelControllerMc);
      
      const gridContainer = panelControllerMc.querySelector('.player-grid-buttons');
      gridContainer.innerHTML = '';
      
      const maxVotes = data.question.maxVotes || 1;
      const isMultiVoteSurvey = currentQuestionType === 'survey' && maxVotes > 1;

      // Handle UI headers/buttons display
      if (isMultiVoteSurvey) {
        surveyVotesHeader.style.display = 'block';
        surveyVotesCount.textContent = maxVotes;
        
        // Setup cloned submit button to clear previous listeners
        const currentSubmitBtn = document.getElementById('btn-submit-survey-votes');
        const submitBtn = currentSubmitBtn.cloneNode(true);
        currentSubmitBtn.parentNode.replaceChild(submitBtn, currentSubmitBtn);
        submitBtn.style.display = 'block';
        submitBtn.disabled = true; // Disabled initially
        submitBtn.style.background = 'rgba(255, 255, 255, 0.05)';
        submitBtn.style.color = 'var(--text-muted)';
        submitBtn.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        submitBtn.style.boxShadow = 'none';
      } else {
        surveyVotesHeader.style.display = 'none';
        const currentSubmitBtn = document.getElementById('btn-submit-survey-votes');
        if (currentSubmitBtn) currentSubmitBtn.style.display = 'none';
      }

      // Always use 2 columns to prevent horizontal overflow on mobile screens
      gridContainer.style.gridTemplateColumns = 'repeat(2, 1fr)';
      
      const colors = ['red', 'blue', 'yellow', 'green', 'purple', 'pink', 'orange', 'teal', 'cyan', 'amber'];
      const shapes = ['tri', 'dia', 'cir', 'squ', 'hex', 'sta', 'pen', 'cro', 'cre', 'hea'];
      const optImgs = data.question.optionImages || [];
      const optCount = data.question.options.length;

      // Multi-vote state
      let allocatedVotes = new Array(optCount).fill(0);
      let remainingVotes = maxVotes;

      // Function to get current selections formatted as comma-separated string
      const getFormattedChoices = () => {
        const choices = [];
        allocatedVotes.forEach((vCount, oIdx) => {
          for (let k = 0; k < vCount; k++) {
            choices.push(oIdx);
          }
        });
        return choices.join(',');
      };

      data.question.options.forEach((optVal, idx) => {
        const color = colors[idx % colors.length];
        const shape = shapes[idx % shapes.length];
        
        const btn = document.createElement('button');
        btn.className = `player-btn ${color}`;
        btn.style.display = 'flex';
        btn.style.flexDirection = 'column';
        btn.style.alignItems = 'center';
        btn.style.justifyContent = 'center';
        btn.style.position = 'relative'; // Positioning context for badges

        // Dynamic badge for showing allocated votes on this card
        const badge = document.createElement('div');
        badge.className = 'vote-badge';
        badge.style.position = 'absolute';
        badge.style.top = '10px';
        badge.style.right = '10px';
        badge.style.background = 'var(--purple-neon)';
        badge.style.color = 'white';
        badge.style.borderRadius = '50%';
        badge.style.width = '26px';
        badge.style.height = '26px';
        badge.style.display = 'none'; // Hidden initially
        badge.style.alignItems = 'center';
        badge.style.justifyContent = 'center';
        badge.style.fontSize = '0.9rem';
        badge.style.fontWeight = '900';
        badge.style.boxShadow = '0 0 10px var(--purple-neon)';
        badge.style.zIndex = '5';
        btn.appendChild(badge);

        // Dynamic floating circular minus button on this card
        const minusBtn = document.createElement('div');
        minusBtn.className = 'vote-minus';
        minusBtn.innerHTML = '−';
        minusBtn.style.position = 'absolute';
        minusBtn.style.bottom = '10px';
        minusBtn.style.right = '10px';
        minusBtn.style.background = 'rgba(0, 0, 0, 0.4)';
        minusBtn.style.color = 'white';
        minusBtn.style.borderRadius = '50%';
        minusBtn.style.width = '30px';
        minusBtn.style.height = '30px';
        minusBtn.style.display = 'none'; // Hidden initially
        minusBtn.style.alignItems = 'center';
        minusBtn.style.justifyContent = 'center';
        minusBtn.style.fontSize = '1.3rem';
        minusBtn.style.fontWeight = '900';
        minusBtn.style.border = '1.5px solid rgba(255, 255, 255, 0.5)';
        minusBtn.style.cursor = 'pointer';
        minusBtn.style.zIndex = '5';
        
        minusBtn.addEventListener('click', (e) => {
          e.stopPropagation(); // Stop click from triggering parent card!
          if (allocatedVotes[idx] > 0) {
            allocatedVotes[idx]--;
            remainingVotes++;
            surveyVotesCount.textContent = remainingVotes;

            // Update badge and minus display
            if (allocatedVotes[idx] > 0) {
              badge.textContent = allocatedVotes[idx];
            } else {
              badge.style.display = 'none';
              minusBtn.style.display = 'none';
            }

            // Autosubmit partial choice
            socket.emit('player-submit-answer', { pin: myPin, answer: getFormattedChoices(), isPartial: true });

            // Disable submit button ONLY if no votes are cast at all
            if (remainingVotes === maxVotes) {
              const submitBtn = document.getElementById('btn-submit-survey-votes');
              if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.style.background = 'rgba(255, 255, 255, 0.05)';
                submitBtn.style.color = 'var(--text-muted)';
                submitBtn.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                submitBtn.style.boxShadow = 'none';
              }
            }
          }
        });
        btn.appendChild(minusBtn);
        
        if (optImgs[idx]) {
          btn.style.padding = '4px';
          btn.style.gap = '0px';
          
          const img = document.createElement('img');
          img.className = 'player-opt-img';
          img.src = optImgs[idx];
          img.style.width = '105px';
          img.style.height = '105px';
          img.style.objectFit = 'contain';
          img.style.borderRadius = '12px';
          img.style.border = '2px solid rgba(255,255,255,0.45)';
          img.style.background = 'rgba(255,255,255,0.15)';
          img.style.padding = '4px';
          btn.appendChild(img);
        } else {
          btn.style.padding = '10px';
          btn.style.gap = '10px';
          const shapeDiv = document.createElement('div');
          shapeDiv.className = `shape-${shape}`;
          btn.appendChild(shapeDiv);
        }
        
        btn.addEventListener('click', () => {
          if (isMultiVoteSurvey) {
            if (remainingVotes > 0) {
              allocatedVotes[idx]++;
              remainingVotes--;
              surveyVotesCount.textContent = remainingVotes;

              // Show badge and minus button
              badge.textContent = allocatedVotes[idx];
              badge.style.display = 'flex';
              minusBtn.style.display = 'flex';

              // Autosubmit partial choice
              socket.emit('player-submit-answer', { pin: myPin, answer: getFormattedChoices(), isPartial: true });

              // Enable submit button and glow since at least one vote is cast!
              const submitBtn = document.getElementById('btn-submit-survey-votes');
              if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.style.background = 'var(--purple-neon)';
                submitBtn.style.color = 'white';
                submitBtn.style.borderColor = 'var(--purple-neon)';
                submitBtn.style.boxShadow = 'var(--shadow-glow)';
              }
            }
          } else {
            submitAnswer(idx);
          }
        });
        
        gridContainer.appendChild(btn);
      });

      // Bind dynamic submit action
      if (isMultiVoteSurvey) {
        const submitBtn = document.getElementById('btn-submit-survey-votes');
        if (submitBtn) {
          submitBtn.addEventListener('click', () => {
            if (remainingVotes < maxVotes) {
              const finalAns = getFormattedChoices();
              // Emit final answer (isPartial: false)
              socket.emit('player-submit-answer', { pin: myPin, answer: finalAns, isPartial: false });
              showPanel(panelPlayerWait);
              playerWaitMessage.textContent = 'Votes submitted! Waiting for other players...';
            }
          });
        }
      }
    } else if (currentQuestionType === 'true-false') {
      showPanel(panelControllerTf);
      
      const optImgs = data.question.optionImages || [];
      const imgTrue = document.getElementById('pimg-tf-true');
      const imgFalse = document.getElementById('pimg-tf-false');
      const btnTrue = document.getElementById('pbtn-tf-true');
      const btnFalse = document.getElementById('pbtn-tf-false');
      const shapeTrue = btnTrue.querySelector('.shape-dia');
      const shapeFalse = btnFalse.querySelector('.shape-tri');
      
      if (imgTrue) {
        if (optImgs[0]) {
          imgTrue.src = optImgs[0];
          imgTrue.style.display = 'block';
          imgTrue.style.width = '90px';
          imgTrue.style.height = '90px';
          imgTrue.style.objectFit = 'contain';
          imgTrue.style.borderRadius = '8px';
          imgTrue.style.border = '1.5px solid rgba(255,255,255,0.3)';
          imgTrue.style.background = 'rgba(255,255,255,0.1)';
          imgTrue.style.padding = '2px';
          if (shapeTrue) shapeTrue.style.display = 'none';
        } else {
          imgTrue.src = '';
          imgTrue.style.display = 'none';
          if (shapeTrue) shapeTrue.style.display = 'block';
        }
      }
      if (imgFalse) {
        if (optImgs[1]) {
          imgFalse.src = optImgs[1];
          imgFalse.style.display = 'block';
          imgFalse.style.width = '90px';
          imgFalse.style.height = '90px';
          imgFalse.style.objectFit = 'contain';
          imgFalse.style.borderRadius = '8px';
          imgFalse.style.border = '1.5px solid rgba(255,255,255,0.3)';
          imgFalse.style.background = 'rgba(255,255,255,0.1)';
          imgFalse.style.padding = '2px';
          if (shapeFalse) shapeFalse.style.display = 'none';
        } else {
          imgFalse.src = '';
          imgFalse.style.display = 'none';
          if (shapeFalse) shapeFalse.style.display = 'block';
        }
      }
    } else if (currentQuestionType === 'short-answer') {
      inputShortAnswer.value = ''; // Reset input
      showPanel(panelControllerSa);
      inputShortAnswer.focus();
    }
  } else if (state === 'RESULTS' || state === 'LEADERBOARD' || state === 'PODIUM') {
    showPanel(panelPlayerWait);
    playerWaitMessage.textContent = 'Look at the host screen for standings!';
  }
};
socket.on('state-changed', handleStateChanged);

// Question ends - feedback is dispatched individually to players
socket.on('question-over', (data) => {
  // Hide controller panels
  [panelControllerMc, panelControllerTf, panelControllerSa, panelPlayerWait].forEach(panel => {
    panel.style.display = 'none';
  });

  if (feedbackCorrectAnswerContainer) {
    feedbackCorrectAnswerContainer.style.display = 'none';
  }

  // Reset feedback-correct default styles
  feedbackCorrect.style.background = '';
  feedbackCorrect.style.border = '';
  const titleEl = feedbackCorrect.querySelector('.feedback-title');
  if (titleEl) {
    titleEl.textContent = 'CORRECT! 🎉';
    titleEl.style.color = '';
  }
  lblFeedbackPointsGained.style.color = '';
  lblFeedbackRankC.style.color = '';

  if (data.isSurvey) {
    feedbackCorrect.style.display = 'flex';
    feedbackCorrect.style.background = 'linear-gradient(135deg, #3b0764 0%, #060417 100%)';
    feedbackCorrect.style.border = '5px solid var(--purple-neon)';
    
    if (titleEl) {
      titleEl.textContent = 'RESPONSE RECORDED! 🗳️';
      titleEl.style.color = 'var(--purple-neon)';
    }
    
    lblFeedbackPointsGained.textContent = 'Thank you for sharing your opinion!';
    lblFeedbackPointsGained.style.color = 'var(--text-secondary)';
    
    lblFeedbackStreak.style.display = 'none';
    
    lblFeedbackRankC.textContent = 'Standings are updated on the host screen.';
    lblFeedbackRankC.style.color = 'var(--text-muted)';
  } else if (data.correct) {
    feedbackCorrect.style.display = 'flex';
    lblFeedbackPointsGained.textContent = `+${data.pointsGained} points`;
    
    if (data.streak >= 2) {
      let streakEmoji = '🔥';
      let streakLabel = `Streak ×${data.streak}`;
      if (data.streak >= 10) { streakEmoji = '🌟'; streakLabel = `ON FIRE! ×${data.streak}`; }
      else if (data.streak >= 5) { streakEmoji = '⚡'; streakLabel = `Unstoppable! ×${data.streak}`; }
      else if (data.streak >= 3) { streakEmoji = '🔥'; streakLabel = `On a roll! ×${data.streak}`; }

      lblFeedbackStreak.textContent = `${streakEmoji} ${streakLabel}`;
      lblFeedbackStreak.style.display = 'inline-block';
      // Pop animation
      lblFeedbackStreak.classList.remove('streak-pop');
      void lblFeedbackStreak.offsetWidth;
      lblFeedbackStreak.classList.add('streak-pop');
    } else {
      lblFeedbackStreak.style.display = 'none';
      lblFeedbackStreak.classList.remove('streak-pop');
    }
    
    lblFeedbackRankC.textContent = `Current Rank: ${data.rank}`;

  } else {
    feedbackIncorrect.style.display = 'flex';
    if (!data.wasAnswered) {
      lblFeedbackIncorrectTitle.textContent = "TIME'S UP! ⏰";
    } else {
      lblFeedbackIncorrectTitle.textContent = "INCORRECT 😢";
    }
    lblFeedbackRankI.textContent = `Current Rank: ${data.rank}`;

    if (data.questionType === 'short-answer' && data.correctAnswer) {
      if (feedbackCorrectAnswerContainer && lblFeedbackCorrectAnswer) {
        lblFeedbackCorrectAnswer.textContent = data.correctAnswer;
        feedbackCorrectAnswerContainer.style.display = 'flex';
      }
    }
  }
});

// Clean up if host drops
socket.on('host-disconnected', () => {
  localStorage.removeItem('trivia_pulse_room_pin');
  localStorage.removeItem('trivia_pulse_nickname');
  localStorage.removeItem('trivia_pulse_avatar');
  alert('The host has disconnected from the game.');
  window.location.reload();
});

// Clean up if player gets kicked
socket.on('kicked', (data) => {
  localStorage.removeItem('trivia_pulse_room_pin');
  localStorage.removeItem('trivia_pulse_nickname');
  localStorage.removeItem('trivia_pulse_avatar');
  alert(data.message || 'You have been removed from the lobby by the host.');
  window.location.reload();
});

// Helper: Show/Hide panels
function showPanel(panelToShow) {
  [
    panelJoinNickname,
    panelLobbyWait,
    panelControllerMc,
    panelControllerTf,
    panelControllerSa,
    panelPlayerWait
  ].forEach(panel => {
    panel.style.display = 'none';
  });
  
  if (panelToShow === panelLobbyWait || panelToShow === panelPlayerWait) {
    panelToShow.style.display = 'flex';
  } else {
    panelToShow.style.display = 'block';
  }
}

// Handle Auto-Rejoin on Connection/Reconnection
socket.on('connect', () => {
  console.log('Socket connected, checking for active session...');
  const savedPin = localStorage.getItem('trivia_pulse_room_pin');
  const savedNickname = localStorage.getItem('trivia_pulse_nickname');
  const savedAvatar = localStorage.getItem('trivia_pulse_avatar');
  if (savedPin && savedNickname && savedAvatar && playerId) {
    console.log('Attempting auto-rejoin for:', savedNickname);
    socket.emit('player-join', {
      nickname: savedNickname,
      avatar: savedAvatar,
      playerId: playerId,
      pin: savedPin,
      isRejoining: true
    });
  }
});

// Handle Session Re-sync from Server
socket.on('sync-game-state', (data) => {
  console.log('Rejoined successfully! Syncing game state:', data);
  myNickname = data.nickname;
  const avatar = data.avatar || '👾';
  myPin = data.pin || 'local_game';

  // Save/refresh localStorage in case it changed
  localStorage.setItem('trivia_pulse_room_pin', myPin);
  localStorage.setItem('trivia_pulse_nickname', myNickname);
  localStorage.setItem('trivia_pulse_avatar', avatar);

  playerNicknameHeader.innerHTML = `<span style="margin-right: 8px;">${avatar}</span>${myNickname}`;
  if (waitPlayerAvatar) waitPlayerAvatar.textContent = avatar;
  waitPlayerName.textContent = myNickname;

  panelJoinNickname.style.display = 'none';

  if (data.gameState === 'QUESTION') {
    if (data.answerSubmitted) {
      showPanel(panelPlayerWait);
      playerWaitMessage.textContent = 'Answer submitted! Waiting for other players...';
    } else {
      handleStateChanged({
        gameState: 'QUESTION',
        question: data.question
      });
    }
  } else {
    handleStateChanged({
      gameState: data.gameState
    });
  }
});
