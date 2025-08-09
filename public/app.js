// Voice Chat Application with Profanity Filter
let socket;
let peer;
let myPeer;
let currentRoom;
let myUserId;
let myUserName;
let myStream;
let peers = {};
let isDemoMode = false;

// Profanity filter components
let speechRecognition;
let audioContext;
let beepOscillator;
let isFilterEnabled = true;

// Profanity word list (Arabic and English)
const profanityWords = [
    // Arabic profanity words (common inappropriate terms)
    'كلب', 'حمار', 'غبي', 'احمق', 'لعين', 'وسخ', 'قذر', 'نذل', 'خنزير', 'حقير',
    // English profanity words (common inappropriate terms)  
    'damn', 'hell', 'stupid', 'idiot', 'jerk', 'fool', 'dumb', 'moron', 'hate', 'shut up'
];

// Initialize application
document.addEventListener('DOMContentLoaded', function() {
    setupSocketConnection();
    setupProfanityFilter();
});

function setupSocketConnection() {
    socket = io();
    
    socket.on('user-connected', (userId, userName) => {
        console.log('User connected:', userName);
        connectToNewUser(userId, myStream, userName);
        updateParticipantCount();
    });

    socket.on('user-disconnected', userId => {
        console.log('User disconnected:', userId);
        if (peers[userId]) {
            peers[userId].close();
            delete peers[userId];
        }
        removeParticipantCard(userId);
        updateParticipantCount();
    });

    socket.on('participant-count', count => {
        document.getElementById('participantCount').textContent = count;
    });

    socket.on('room-full', () => {
        alert('الغرفة ممتلئة. الحد الأقصى 4 مشاركين');
    });
}

function setupProfanityFilter() {
    // Initialize Web Audio API for beep generation
    if (typeof AudioContext !== 'undefined' || typeof webkitAudioContext !== 'undefined') {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    // Initialize Speech Recognition API
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        speechRecognition = new SpeechRecognition();
        
        speechRecognition.continuous = true;
        speechRecognition.interimResults = true;
        speechRecognition.lang = 'ar-SA'; // Arabic (Saudi Arabia) - can be changed
        
        speechRecognition.onresult = function(event) {
            let finalTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                }
            }
            
            if (finalTranscript && isFilterEnabled) {
                checkForProfanity(finalTranscript.toLowerCase());
            }
        };

        speechRecognition.onerror = function(event) {
            console.log('Speech recognition error:', event.error);
        };
    }
}

function checkForProfanity(text) {
    const containsProfanity = profanityWords.some(word => 
        text.includes(word.toLowerCase())
    );
    
    if (containsProfanity) {
        console.log('Profanity detected, playing beep');
        playBeepSound();
        // Visual indicator could be added here
        showProfanityWarning();
    }
}

function playBeepSound() {
    if (!audioContext) return;
    
    try {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime); // 800 Hz beep
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
    } catch (error) {
        console.error('Error playing beep sound:', error);
    }
}

function showProfanityWarning() {
    // Create temporary warning message
    const warning = document.createElement('div');
    warning.textContent = '⚠️ تم اكتشاف كلمة غير لائقة';
    warning.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background-color: #f44336;
        color: white;
        padding: 10px 20px;
        border-radius: 5px;
        z-index: 1000;
        font-size: 14px;
    `;
    
    document.body.appendChild(warning);
    
    setTimeout(() => {
        document.body.removeChild(warning);
    }, 3000);
}

async function joinDemoRoom() {
    const userName = document.getElementById('userName').value.trim();
    
    if (!userName) {
        alert('يرجى إدخال اسمك');
        return;
    }

    isDemoMode = true;
    myUserName = userName;
    currentRoom = 'demo-room';
    myUserId = 'demo-user-' + Math.random().toString(36).substring(7);
    
    // Show room interface for demo
    showRoomInterface();
    
    // Start speech recognition for demo if available
    if (speechRecognition && isFilterEnabled) {
        speechRecognition.start();
        showNotification('وضع التجربة: تحدث لاختبار فلتر الكلمات');
    } else {
        showNotification('وضع التجربة: اختبر الفلتر بالضغط على "اختبار كلمة غير لائقة"');
    }
    
    // Add demo functionality
    addDemoControls();
}

function addDemoControls() {
    const myCard = document.getElementById('my-participant-card');
    if (myCard) {
        const controls = myCard.querySelector('.controls');
        if (controls) {
            controls.innerHTML += `
                <button class="btn mic-btn" onclick="testProfanityFilter()" style="background-color: #ff9800; margin-left: 5px;">⚠️</button>
            `;
        }
    }
}

function testProfanityFilter() {
    // Simulate profanity detection
    const testWords = ['كلب', 'stupid', 'احمق'];
    const randomWord = testWords[Math.floor(Math.random() * testWords.length)];
    
    showNotification(`اختبار كشف الكلمة: "${randomWord}"`);
    
    setTimeout(() => {
        if (isFilterEnabled) {
            checkForProfanity(randomWord);
        } else {
            showNotification('الفلتر معطل - لم يتم حجب الكلمة');
        }
    }, 1000);
}

async function joinRoom() {
    const userName = document.getElementById('userName').value.trim();
    const roomId = document.getElementById('roomId').value.trim() || generateRoomId();
    
    if (!userName) {
        alert('يرجى إدخال اسمك');
        return;
    }

    myUserName = userName;
    currentRoom = roomId;
    
    try {
        // Get user media (audio only)
        myStream = await navigator.mediaDevices.getUserMedia({ 
            audio: true,
            video: false 
        });

        // Initialize PeerJS
        myPeer = new Peer(undefined, {
            host: window.location.hostname,
            port: window.location.port || (window.location.protocol === 'https:' ? 443 : 80),
            path: '/peerjs/myapp'
        });

        myPeer.on('open', id => {
            myUserId = id;
            console.log('My peer ID is: ' + id);
            
            // Join the room
            socket.emit('join-room', currentRoom, myUserId, myUserName);
            
            // Show room interface
            showRoomInterface();
            
            // Start speech recognition if available
            if (speechRecognition && isFilterEnabled) {
                speechRecognition.start();
            }
        });

        myPeer.on('call', call => {
            console.log('Receiving call from:', call.peer);
            call.answer(myStream);
            
            call.on('stream', userAudioStream => {
                console.log('Received stream from:', call.peer);
                addAudioStream(call.peer, userAudioStream);
            });
            
            call.on('close', () => {
                console.log('Call closed with:', call.peer);
                removeParticipantCard(call.peer);
            });
            
            peers[call.peer] = call;
        });

    } catch (error) {
        console.error('Error accessing microphone:', error);
        alert('لا يمكن الوصول إلى الميكروفون. يرجى التأكد من الأذونات أو استخدم وضع التجربة.');
    }
}

function connectToNewUser(userId, stream, userName) {
    console.log('Connecting to user:', userName, userId);
    
    const call = myPeer.call(userId, stream);
    
    call.on('stream', userAudioStream => {
        console.log('Connected and receiving stream from:', userName);
        addAudioStream(userId, userAudioStream, userName);
    });
    
    call.on('close', () => {
        console.log('Connection closed with:', userName);
        removeParticipantCard(userId);
    });
    
    peers[userId] = call;
}

function addAudioStream(userId, stream, userName = 'مستخدم') {
    const audio = document.createElement('audio');
    audio.srcObject = stream;
    audio.autoplay = true;
    audio.id = `audio-${userId}`;
    
    // Create participant card
    createParticipantCard(userId, userName, audio);
}

function createParticipantCard(userId, userName, audioElement) {
    const participantsGrid = document.getElementById('participantsGrid');
    
    // Remove existing card if any
    removeParticipantCard(userId);
    
    const participantCard = document.createElement('div');
    participantCard.className = 'participant-card';
    participantCard.id = `participant-${userId}`;
    
    participantCard.innerHTML = `
        <div class="avatar">${userName.charAt(0).toUpperCase()}</div>
        <h3>${userName}</h3>
        <div class="status online">متصل</div>
        <div class="volume-indicator" id="volume-${userId}"></div>
    `;
    
    // Add audio element to the card
    participantCard.appendChild(audioElement);
    participantsGrid.appendChild(participantCard);
    
    // Setup volume indicator
    setupVolumeIndicator(audioElement, userId);
}

function setupVolumeIndicator(audioElement, userId) {
    if (!audioContext) return;
    
    try {
        const source = audioContext.createMediaStreamSource(audioElement.srcObject);
        const analyser = audioContext.createAnalyser();
        
        analyser.fftSize = 256;
        source.connect(analyser);
        
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        function updateVolume() {
            analyser.getByteFrequencyData(dataArray);
            
            let sum = 0;
            for (let i = 0; i < bufferLength; i++) {
                sum += dataArray[i];
            }
            const average = sum / bufferLength;
            
            const volumeIndicator = document.getElementById(`volume-${userId}`);
            if (volumeIndicator) {
                const volume = Math.min(average / 128, 1);
                volumeIndicator.style.width = `${volume * 100}%`;
                requestAnimationFrame(updateVolume);
            }
        }
        
        updateVolume();
    } catch (error) {
        console.error('Error setting up volume indicator:', error);
    }
}

function removeParticipantCard(userId) {
    const participantCard = document.getElementById(`participant-${userId}`);
    if (participantCard) {
        participantCard.remove();
    }
    
    const audioElement = document.getElementById(`audio-${userId}`);
    if (audioElement) {
        audioElement.remove();
    }
}

function showRoomInterface() {
    document.getElementById('joinContainer').style.display = 'none';
    document.getElementById('roomContainer').style.display = 'block';
    
    // Show room link
    const roomLink = document.getElementById('roomLink');
    if (!isDemoMode) {
        const currentUrl = `${window.location.origin}?room=${currentRoom}`;
        roomLink.innerHTML = `
            <strong>رابط الغرفة:</strong><br>
            <span style="font-size: 12px;">${currentUrl}</span>
            <button onclick="copyRoomLink()" style="margin-right: 10px; padding: 5px 10px; background-color: #e94560; color: white; border: none; border-radius: 5px; cursor: pointer;">نسخ</button>
        `;
    } else {
        roomLink.innerHTML = `
            <strong>وضع التجربة:</strong><br>
            <span style="font-size: 12px;">اختبار فلتر الكلمات غير اللائقة</span>
        `;
    }
    
    // Add my own participant card
    createMyParticipantCard();
}

function createMyParticipantCard() {
    const participantsGrid = document.getElementById('participantsGrid');
    
    const myCard = document.createElement('div');
    myCard.className = 'participant-card';
    myCard.id = 'my-participant-card';
    
    const controlsHtml = isDemoMode ? 
        `<div class="controls">
            <button class="btn mic-btn" onclick="toggleProfanityFilter()" id="filterBtn" style="background-color: ${isFilterEnabled ? '#4CAF50' : '#f44336'}">🛡️</button>
            <button class="btn mic-btn" onclick="testProfanityFilter()" style="background-color: #ff9800;">⚠️</button>
        </div>` :
        `<div class="controls">
            <button class="btn mic-btn" id="micBtn" onclick="toggleMic()">🎤</button>
            <button class="btn mic-btn" onclick="toggleProfanityFilter()" id="filterBtn" style="background-color: ${isFilterEnabled ? '#4CAF50' : '#f44336'}">🛡️</button>
        </div>`;
    
    myCard.innerHTML = `
        <div class="avatar">${myUserName.charAt(0).toUpperCase()}</div>
        <h3>${myUserName} (أنت)</h3>
        <div class="status online">${isDemoMode ? 'وضع التجربة' : 'متصل'}</div>
        ${controlsHtml}
        <div class="volume-indicator" id="volume-me"></div>
    `;
    
    participantsGrid.appendChild(myCard);
    
    // Setup volume indicator for myself (only if not in demo mode)
    if (myStream && audioContext && !isDemoMode) {
        setupVolumeIndicator({ srcObject: myStream }, 'me');
    }
}

function toggleMic() {
    if (isDemoMode) {
        showNotification('وضع التجربة: الميكروفون غير متاح');
        return;
    }
    
    const micBtn = document.getElementById('micBtn');
    const audioTrack = myStream.getAudioTracks()[0];
    
    if (audioTrack.enabled) {
        audioTrack.enabled = false;
        micBtn.classList.add('muted');
        micBtn.textContent = '🔇';
    } else {
        audioTrack.enabled = true;
        micBtn.classList.remove('muted');
        micBtn.textContent = '🎤';
    }
}

function toggleProfanityFilter() {
    isFilterEnabled = !isFilterEnabled;
    const filterBtn = document.getElementById('filterBtn');
    
    filterBtn.style.backgroundColor = isFilterEnabled ? '#4CAF50' : '#f44336';
    filterBtn.title = isFilterEnabled ? 'فلتر الكلمات مفعل' : 'فلتر الكلمات معطل';
    
    if (speechRecognition) {
        if (isFilterEnabled) {
            speechRecognition.start();
        } else {
            speechRecognition.stop();
        }
    }
    
    // Show notification
    const message = isFilterEnabled ? 'تم تفعيل فلتر الكلمات غير اللائقة' : 'تم تعطيل فلتر الكلمات غير اللائقة';
    showNotification(message);
}

function showNotification(message) {
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        left: 20px;
        background-color: #2ecc71;
        color: white;
        padding: 10px 20px;
        border-radius: 5px;
        z-index: 1000;
        font-size: 14px;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        document.body.removeChild(notification);
    }, 3000);
}

function copyRoomLink() {
    const roomLink = `${window.location.origin}?room=${currentRoom}`;
    navigator.clipboard.writeText(roomLink).then(() => {
        showNotification('تم نسخ رابط الغرفة');
    }).catch(() => {
        alert('فشل نسخ الرابط');
    });
}

function leaveRoom() {
    if (myPeer) {
        myPeer.destroy();
    }
    
    if (speechRecognition) {
        speechRecognition.stop();
    }
    
    Object.values(peers).forEach(peer => peer.close());
    peers = {};
    
    if (myStream) {
        myStream.getTracks().forEach(track => track.stop());
    }
    
    socket.disconnect();
    
    // Reset interface
    document.getElementById('roomContainer').style.display = 'none';
    document.getElementById('joinContainer').style.display = 'block';
    document.getElementById('participantsGrid').innerHTML = '';
    
    // Reset form
    document.getElementById('userName').value = '';
    document.getElementById('roomId').value = '';
}

function generateRoomId() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

function updateParticipantCount() {
    const participantCards = document.querySelectorAll('.participant-card').length;
    document.getElementById('participantCount').textContent = participantCards;
}

// Auto-join room if room parameter is in URL
window.addEventListener('load', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    if (roomParam) {
        document.getElementById('roomId').value = roomParam;
    }
});