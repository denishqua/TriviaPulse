const socket = io();

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

// Feedback details
const lblFeedbackPointsGained = document.getElementById('lbl-feedback-points-gained');
const lblFeedbackStreak = document.getElementById('lbl-feedback-streak');
const lblFeedbackRankC = document.getElementById('lbl-feedback-rank-c');
const lblFeedbackRankI = document.getElementById('lbl-feedback-rank-i');
const lblFeedbackIncorrectTitle = document.getElementById('lbl-feedback-incorrect-title');

// Nickname Join Submit Handler
btnSubmitNickname.addEventListener('click', () => {
  const nickname = inputNickname.value.trim();
  if (!nickname) {
    nicknameError.textContent = 'Please enter a nickname.';
    return;
  }
  nicknameError.textContent = '';
  
  // Send join payload to server
  socket.emit('player-join', { nickname });
});

// Join Response
socket.on('join-response', (data) => {
  if (data.success) {
    myNickname = data.nickname;
    playerNicknameHeader.textContent = myNickname;
    waitPlayerName.textContent = myNickname;
    
    panelJoinNickname.style.display = 'none';
    panelLobbyWait.style.display = 'flex';
  } else {
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
socket.on('state-changed', (data) => {
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

    if (currentQuestionType === 'multiple-choice') {
      showPanel(panelControllerMc);
      
      const gridContainer = panelControllerMc.querySelector('.player-grid-buttons');
      gridContainer.innerHTML = '';
      
      const optCount = data.question.options.length;
      if (optCount <= 4) {
        gridContainer.style.gridTemplateColumns = 'repeat(2, 1fr)';
      } else if (optCount <= 9) {
        gridContainer.style.gridTemplateColumns = 'repeat(3, 1fr)';
      } else {
        gridContainer.style.gridTemplateColumns = 'repeat(4, 1fr)';
      }
      
      const colors = ['red', 'blue', 'yellow', 'green', 'purple', 'pink', 'orange', 'teal', 'cyan', 'amber'];
      const shapes = ['tri', 'dia', 'cir', 'squ', 'hex', 'sta', 'pen', 'cro', 'cre', 'hea'];
      const optImgs = data.question.optionImages || [];
      
      data.question.options.forEach((optVal, idx) => {
        const color = colors[idx % colors.length];
        const shape = shapes[idx % shapes.length];
        
        const btn = document.createElement('button');
        btn.className = `player-btn ${color}`;
        btn.style.display = 'flex';
        btn.style.flexDirection = 'column';
        btn.style.alignItems = 'center';
        btn.style.justifyContent = 'center';
        
        if (optImgs[idx]) {
          btn.style.padding = '4px';
          btn.style.gap = '0px';
          
          const img = document.createElement('img');
          img.className = 'player-opt-img';
          img.src = optImgs[idx];
          img.style.width = '90%';
          img.style.height = '90%';
          img.style.maxWidth = '92%';
          img.style.maxHeight = '92%';
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
          submitAnswer(idx);
        });
        
        gridContainer.appendChild(btn);
      });
      
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
  } else if (state === 'LEADERBOARD' || state === 'PODIUM') {
    showPanel(panelPlayerWait);
    playerWaitMessage.textContent = 'Look at the host screen for standings!';
  }
});

// Question ends - feedback is dispatched individually to players
socket.on('question-over', (data) => {
  // Hide controller panels
  [panelControllerMc, panelControllerTf, panelControllerSa, panelPlayerWait].forEach(panel => {
    panel.style.display = 'none';
  });

  if (data.correct) {
    feedbackCorrect.style.display = 'flex';
    lblFeedbackPointsGained.textContent = `+${data.pointsGained} points`;
    
    if (data.streak >= 2) {
      lblFeedbackStreak.style.display = 'inline-block';
      lblFeedbackStreak.textContent = `🔥 Streak: ${data.streak}`;
    } else {
      lblFeedbackStreak.style.display = 'none';
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
  }
});

// Clean up if host drops
socket.on('host-disconnected', () => {
  alert('The host has disconnected from the game.');
  window.location.reload();
});

// Clean up if player gets kicked
socket.on('kicked', (data) => {
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
