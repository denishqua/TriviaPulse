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

// Map Multiple Choice Buttons (A, B, C, D)
document.getElementById('pbtn-opt-A').addEventListener('click', () => submitAnswer('A'));
document.getElementById('pbtn-opt-B').addEventListener('click', () => submitAnswer('B'));
document.getElementById('pbtn-opt-C').addEventListener('click', () => submitAnswer('C'));
document.getElementById('pbtn-opt-D').addEventListener('click', () => submitAnswer('D'));

// Map True/False Buttons (True -> A, False -> B)
document.getElementById('pbtn-tf-true').addEventListener('click', () => submitAnswer('A'));
document.getElementById('pbtn-tf-false').addEventListener('click', () => submitAnswer('B'));

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
    } else if (currentQuestionType === 'true-false') {
      showPanel(panelControllerTf);
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
