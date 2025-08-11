// اتصال Socket.IO و PeerJS
const socket = io('/');
const peer = new Peer(undefined, { host: location.hostname, port: location.port || (location.protocol === 'https:' ? 443 : 80), path: '/peerjs' });

let currentRoom = null;
let myStream = null;
let myPeerId = null;
let isMuted = false;

// للصوت والفلترة
let audioCtx = null;
let recognition = null;
let lastBeepTime = 0;
const badWords = ['كلب', 'زق', 'ملعون', 'حمار']; // عدل حسب الحاجة

// عند فتح الاتصال مع PeerJS
peer.on('open', id => { myPeerId = id; });
peer.on('error', err => console.error('Peer error', err));

/* ======================
   دوال فلترة الشتائم
====================== */
function normalizeArabic(str = '') {
  return str.toLowerCase()
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/[إأآا]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsBadWord(text) {
  const n = normalizeArabic(text);
  return badWords.some(w => n.includes(normalizeArabic(w)));
}

/* ======================
   دوال الصوت والتشويش
====================== */
function initAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!audioCtx) audioCtx = new AC();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function createNoiseBuffer(duration = 0.25) {
  const sr = audioCtx.sampleRate;
  const frames = Math.floor(sr * duration);
  const buf = audioCtx.createBuffer(1, frames, sr);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    const p = i / frames;
    const env = Math.sin(Math.PI * p);
    data[i] = (Math.random() * 2 - 1) * env * 0.15;
  }
  return buf;
}

function playBeep(throttleMs = 800, duration = 0.25) {
  if (!audioCtx) return;
  const now = Date.now();
  if (now - lastBeepTime < throttleMs) return;
  lastBeepTime = now;
  const src = audioCtx.createBufferSource();
  src.buffer = createNoiseBuffer(duration);
  const band = audioCtx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 3500;
  band.Q.value = 1;
  const gain = audioCtx.createGain();
  const t0 = audioCtx.currentTime;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(0.6, t0 + 0.01);
  gain.gain.linearRampToValueAtTime(0, t0 + duration);
  src.connect(band).connect(gain).connect(audioCtx.destination);
  src.start();
  src.stop(t0 + duration + 0.05);
}

/* ======================
   التعرف على الكلام
====================== */
function setupSpeechRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    console.warn('التعرف على الكلام غير مدعوم');
    return;
  }
  recognition = new SR();
  recognition.lang = 'ar-SA';
  recognition.continuous = true;
  recognition.interimResults = true;

  let restartTimeout = null;

  recognition.onresult = (e) => {
    const transcript = Array.from(e.results).map(r => r[0].transcript).join(' ');
    if (containsBadWord(transcript)) {
      playBeep();
      socket.emit('censor-hit', currentRoom);
    }
  };

  recognition.onerror = (e) => {
    console.warn('Speech rec error', e.error);
  };

  recognition.onend = () => {
    if (currentRoom) {
      clearTimeout(restartTimeout);
      restartTimeout = setTimeout(() => { try { recognition.start(); } catch(_){} }, 500);
    }
  };

  try { recognition.start(); } catch(_){}
}

/* ======================
   إعداد الصوت + الميكروفون
====================== */
async function setupAudio() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: false,
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
    myStream = stream;
    initAudio();
    setupSpeechRecognition();
    return myStream;
  } catch (err) {
    console.error('خطأ في الوصول للميكروفون:', err);
    alert('لا يمكن الوصول للميكروفون');
  }
}

/* ======================
   الانضمام للغرفة
====================== */
async function joinRoom() {
  const userNameInput = document.getElementById('userName');
  const roomIdInput = document.getElementById('roomId');
  const userName = userNameInput.value.trim();
  if (!userName) { alert('الرجاء إدخال اسمك'); return; }
  const roomId = roomIdInput.value.trim() || generateRoomId();
  try {
    await setupAudio();
    if (!myStream) return;
    currentRoom = roomId;
    document.getElementById('joinContainer').style.display = 'none';
    document.getElementById('roomContainer').style.display = 'block';
    document.getElementById('roomLink').textContent = `رابط الغرفة: ${window.location.origin}${window.location.pathname}?room=${roomId}`;
    socket.emit('join-room', roomId, myPeerId, userName);
    addParticipant(myPeerId, userName, true);
  } catch (err) {
    alert('خطأ في الوصول إلى الميكروفون');
    console.error(err);
  }
}

/* ======================
   مغادرة الغرفة
====================== */
function leaveRoom() {
  if (!currentRoom) return;
  if (confirm('هل أنت متأكد من رغبتك في مغادرة الغرفة؟')) {
    try { myStream?.getTracks().forEach(t => t.stop()); } catch(_){}
    try { recognition?.stop(); } catch(_){}
    try { audioCtx?.close(); } catch(_){}
    socket.disconnect();
    window.location.reload();
  }
}

/* ======================
   إدارة المشاركين
====================== */
function addParticipant(userId, userName, isMe = false) {
  const wrapper = document.getElementById('participantsGrid');
  if (!wrapper) return;
  const exists = document.getElementById(`participant-${userId}`);
  if (exists) return;
  const div = document.createElement('div');
  div.className = 'participant-card';
  div.id = `participant-${userId}`;
  div.innerHTML = `
    <div class="avatar">${userName.charAt(0)}</div>
    <h3>${userName}${isMe ? ' (أنت)' : ''}</h3>
    <span class="status online">متصل</span>
    <div class="controls">
      <button class="mic-btn" ${!isMe ? 'disabled' : ''} data-user="${userId}">🎤</button>
    </div>
    <div class="volume-indicator"></div>
  `;
  wrapper.appendChild(div);
  if (isMe) {
    const btn = div.querySelector('.mic-btn');
    btn.addEventListener('click', toggleMic);
  }
}

function toggleMic(e) {
  if (!myStream) return;
  const audioTrack = myStream.getAudioTracks()[0];
  audioTrack.enabled = !audioTrack.enabled;
  isMuted = !audioTrack.enabled;
  e.currentTarget.classList.toggle('muted', isMuted);
}

function generateRoomId() {
  return Math.random().toString(36).substring(2, 7);
}

/* ======================
   أحداث Socket.IO
====================== */
socket.on('connect_error', err => console.error('Socket error', err));

socket.on('participant-count', count => {
  const el = document.getElementById('participantCount');
  if (el) el.textContent = count;
});

socket.on('user-connected', (userId, userName) => {
  addParticipant(userId, userName);
  if (myStream) {
    const call = peer.call(userId, myStream);
    call.on('stream', userStream => {
      const audio = new Audio();
      audio.srcObject = userStream;
      audio.autoplay = true;
      audio.play().catch(()=>{});
    });
    call.on('error', err => console.error('Call error', err));
  }
});

socket.on('user-disconnected', userId => {
  const card = document.getElementById(`participant-${userId}`);
  if (card) card.remove();
});

socket.on('room-full', () => {
  alert('عذراً، الغرفة ممتلئة');
  window.location.reload();
});

socket.on('censor-hit', () => { playBeep(); });

/* ======================
   معالجة المكالمات الواردة
====================== */
peer.on('call', call => {
  if (!myStream) return call.close();
  call.answer(myStream);
  call.on('stream', userStream => {
    const audio = new Audio();
    audio.srcObject = userStream;
    audio.autoplay = true;
    audio.play().catch(()=>{});
  });
  call.on('error', err => console.error('Incoming call error', err));
});

/* ======================
   عند تحميل الصفحة
====================== */
window.addEventListener('load', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const roomId = urlParams.get('room');
  if (roomId) {
    document.getElementById('roomId').value = roomId;
  }
});
