const socket = io('/');
const peer = new Peer();
let currentRoom = null;
let myStream = null;
let myPeerId = null;
let isMuted = false;

// إعداد الاتصال بـ WebRTC
peer.on('open', id => {
    myPeerId = id;
});

async function joinRoom() {
    const userName = document.getElementById('userName').value;
    if (!userName) {
        alert('الرجاء إدخال اسمك');
        return;
    }

    let roomId = document.getElementById('roomId').value;
    if (!roomId) {
        roomId = generateRoomId();
    }

    try {
        myStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
        currentRoom = roomId;
        
        document.getElementById('joinContainer').style.display = 'none';
        document.getElementById('roomContainer').style.display = 'block';
        document.getElementById('roomLink').textContent = `رابط الغرفة: ${window.location.href}?room=${roomId}`;

        socket.emit('join-room', roomId, myPeerId, userName);
        addParticipant(myPeerId, userName, true);

        // الاستماع لاتصالات المشاركين الجدد
        peer.on('call', call => {
            call.answer(myStream);
            call.on('stream', userStream => {
                // إضافة الصوت للمشارك الجديد
                const audio = new Audio();
                audio.srcObject = userStream;
                audio.play();
            });
        });
    } catch (err) {
        alert('خطأ في الوصول إلى الميكروفون');
        console.error(err);
    }
}

function addParticipant(userId, userName, isMe = false) {
    const participantHtml = `
        <div class="participant-card" id="participant-${userId}">
            <div class="avatar">${userName[0]}</div>
            <h3>${userName}${isMe ? ' (أنت)' : ''}</h3>
            <span class="status online">متصل</span>
            <div class="controls">
                <button class="mic-btn" onclick="toggleMic()" ${!isMe ? 'disabled' : ''}>
                    🎤
                </button>
            </div>
            <div class="volume-indicator"></div>
        </div>
    `;
    document.getElementById('participantsGrid').innerHTML += participantHtml;
}

function toggleMic() {
    if (myStream) {
        const audioTrack = myStream.getAudioTracks()[0];
        audioTrack.enabled = !audioTrack.enabled;
        isMuted = !audioTrack.enabled;
        
        const micBtn = event.currentTarget;
        micBtn.classList.toggle('muted');
    }
}

function leaveRoom() {
    if (confirm('هل أنت متأكد من رغبتك في مغادرة الغرفة؟')) {
        if (myStream) {
            myStream.getTracks().forEach(track => track.stop());
        }
        socket.disconnect();
        window.location.reload();
    }
}

function generateRoomId() {
    return Math.random().toString(36).substring(2, 7);
}

// التحقق من وجود رابط غرفة في URL
window.onload = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room');
    if (roomId) {
        document.getElementById('roomId').value = roomId;
    }
};

// تحديث عدد المشاركين
socket.on('participant-count', count => {
    document.getElementById('participantCount').textContent = count;
});

// استقبال المستخدمين الجدد
socket.on('user-connected', (userId, userName) => {
    addParticipant(userId, userName);
    if (myStream) {
        const call = peer.call(userId, myStream);
        call.on('stream', userStream => {
            // إضافة الصوت للمشارك الجديد
            const audio = new Audio();
            audio.srcObject = userStream;
            audio.play();
        });
    }
});

// إزالة المستخدمين عند المغادرة
socket.on('user-disconnected', userId => {
    const participantCard = document.getElementById(`participant-${userId}`);
    if (participantCard) {
        participantCard.remove();
    }
});

socket.on('room-full', () => {
    alert('عذراً، الغرفة ممتلئة');
    window.location.reload();
});
