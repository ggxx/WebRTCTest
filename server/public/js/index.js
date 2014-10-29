'use strict';

var USER_ID = getUserId();

var createRoomButton = document.getElementById('createRoomButton');
var leaveRoomButton = document.getElementById('leaveRoomButton');
var shareCamButton = document.getElementById('shareCamButton');
var shareScreenButton = document.getElementById('shareScreenButton');
var sendMessageButton = document.getElementById('sendMessageButton');

var roomNameInput = document.getElementById('roomNameInput');
var userNameInput = document.getElementById('userNameInput');
var messageInput = document.getElementById('messageInput');

var remoteCam = document.getElementById('remoteCam');
/*var localCam = document.getElementById('localCam');*/

createRoomButton.onclick = createRoom;
leaveRoomButton.onclick = leaveRoom;
shareCamButton.onclick = shareCam;
shareScreenButton.onclick = shareScreen;
sendMessageButton.onclick = sendMessage;


///--------------SOCKET.IO------------------

var socket = io.connect('https://192.168.0.99');
socket.on('open', function() {

	console.log('服务器连接成功');
	
	socket.on('bind', function(v){
		console.log('socket on bind');
	});
	
	// 服务器返回房间列表
	socket.on('rooms', function(rooms) {
		console.log('socket on rooms');
		// 更新房间列表
		refreshRoomListDOM(rooms);
	});
	
	// 服务器返回用户列表
	socket.on('users', function(users) {
		console.log('socket on users');
		// 更新房间内的用户列表
		refreshUserListDOM(users);
	});
	
	// 服务器返回创建room结果
	// message.result => true/false 是否创建成功
	// message.text   => 创建失败的原因
	// message.room   => 创建的room
	socket.on('createroom', function(message) {
		console.log('socket on createroom');
		if (message.result === true) {
			refreshRoomDOM(message.room);
			joinRoom(message.room.roomid);
		}
		else {
			alert('创建房间错误：' + message.text);
		}
	});
	
	// 服务器返回joinroom的结果
	// message.result => true/false 操作是否成功
	// message.text   => 操作失败的原因
	// message.room   => 进入的room
	socket.on('joinroom', function(message) {
		console.log('socket on joinroom');
		if (message.result === true) {
			refreshRoomDOM(message.room);
			getUsers(message.room.roomid);
		}
		else {
			alert('进入房间错误：' + message.text);
		}
	});
	
	// 服务器返回leaveroom的结果
	// message.result => true/false 操作是否成功
	// message.text   => 操作失败的原因
	// message.closed => room是否因无user而关闭
	socket.on('leaveroom', function(message) {
		console.log('socket on leaveroom');
		if (message.result === true) {
			refreshRoomDOM();
			refreshUserListDOM([]);
		}
	});
	
	socket.on('textmessage', function(message) {
		console.log('socket on textmessage');
		if (message.result === true) {
			refreshMessageListDOM(message.time, message.from, message.text, message.color);
		}
		else {
			refreshMessageListDOM(message.time, '消息发送失败', message.text);
		}
	});
	
	// 收到media共享的请求
	// from 
	// to
	// streamtype => 1.camera, 2.microphone, 3.cam & mic, 4.screen
	socket.on('call', function(message) {
		console.log('socket on call');
		
		targetPeers[message.from] = {
			targerId: message.from,
			streamType: message.streamtype
		};
		
		if (message.streamtype === 1 || message.streamtype === 2 || message.streamtype === 3) {
			if (!mediaStream) {
				return;
			}
			rtcPeerConnections[message.from + '-media'] = buildRtcPeerConnection(message.streamtype);
			rtcPeerConnections[message.from + '-media'].addStream(mediaStream);
			switch (message.streamtype) {
				case 1:
					rtcPeerConnections[message.from + '-media'].createOffer(onOfferCreated, onError, videoOnlyOfferConstraints);
					break;
				case 2:
					rtcPeerConnections[message.from + '-media'].createOffer(onOfferCreated, onError, audioOnlyOfferConstraints);
					break;
				case 3:
					rtcPeerConnections[message.from + '-media'].createOffer(onOfferCreated, onError, offerConstraints);
					break;
			}
		}
		else if (message.streamtype === 4) {
			if (!screenStream) {
				return;
			}
			rtcPeerConnections[message.from + '-screen'] = buildRtcPeerConnection(message.streamtype);
			rtcPeerConnections[message.from + '-screen'].addStream(screenStream);
			rtcPeerConnections[message.from + '-screen'].createOffer(onOfferCreated, onError, videoOnlyOfferConstraints);
		}
	});
	
	// from
	// to
	// candidate
	// streamtype
	socket.on('candidate', function(message) {
		console.log('socket on candidate');
		var candidate = new RTCIceCandidate({
			sdpMLineIndex: message.candidate.sdpMLineIndex,
			candidate: message.candidate.candidate
		});
		getRTCPeerConnection(message.from, message.streamtype).addIceCandidate(candidate);
	});
	
	// from
	// to
	// sdp
	// streamtype
	socket.on('offer', function(message) {
		console.log('socket on offer');
		console.log('>>> setRemoteDescription offer');
		getRTCPeerConnection(message.from, message.streamtype).setRemoteDescription(new RTCSessionDescription(message.sdp), onRemoteSDPSet, onError);
	});
	
	// from
	// to
	// sdp
	// streamtype
	socket.on('answer', function(message) {
		console.log('socket on answer');
		console.log('>>> setRemoteDescription answer');
		getRTCPeerConnection(message.from, message.streamtype).setRemoteDescription(new RTCSessionDescription(message.sdp));
	});
	
	
	console.log('send socket message: bind');
	socket.emit('bind', USER_ID);
	
	// 刷新房间列表
	getRooms();
});


///--------------LOGIC----------------

function getRooms() {
	//console.log('getRooms');
	console.log('send socket message: rooms');
	socket.emit('rooms');
}

function createRoom() {

	if (!roomNameInput.value) {
		alert('不给房间起个名字么，亲？');
		roomNameInput.setAttribute('class', 'emptytextbox');
		return;
	}
	if (!userNameInput.value) {
		alert('不给自己起个名字么，亲？');
		userNameInput.setAttribute('class', 'emptytextbox');
		return;
	}
	
	roomNameInput.setAttribute('class', 'textbox');
	userNameInput.setAttribute('class', 'textbox');
	
	var room = {
		roomid: guid(),
		roomname: roomNameInput.value || 'NoNameRoom',
		roomtype: ''
	};
	console.log('send socket message: createroom');
	socket.emit('createroom', room);
}

function joinRoom(roomid) {

	if (!userNameInput.value) {
		alert('不给自己起个名字么，亲？');
		userNameInput.setAttribute('class', 'emptytextbox');
		return;
	}
	
	roomNameInput.setAttribute('class', 'textbox');
	userNameInput.setAttribute('class', 'textbox');
	
	var user = {
		userid: USER_ID,
		username: userNameInput.value || 'NoNameUser',
		roomid: roomid,
		ice: { }
	};
	console.log('send socket message: joinroom');
	socket.emit('joinroom', user);
}

function getUsers(roomid) {
	//console.log('getUsers');
	console.log('send socket message: users');
	socket.emit('users', roomid);
}

function leaveRoom() {
	//console.log('leaveroom');
	console.log('send socket message: leaveroom');
	socket.emit('leaveroom');
}

function shareCam() {
	if (isCamSharing === false) {
		initCamera();
	}
	else {
		stopSharingCamera();
	}
}

function shareScreen() {
	if (isScreenSharing === false) {
		initScreen();
	}
	else {
		stopSharingScreen();
	}
}

// type => 1.cam & mic; 2.screen; 3.screen & cam & mic
function share(type) {
	//console.log('share');
	console.log('send socket message: share');
	socket.emit('share', type);
}

function stopSharing() {
	//console.log('stopsharing');
	console.log('send socket message: stopsharing');
	socket.emit('stopsharing');
}

// type => 1.cam, 2.mic, 3.cam & mic, 4.screen
function call(userid, type) {
	//console.log('call');
	//targetUserId = userid;
	var message = {
		from: USER_ID,
		to: userid,
		streamtype: 3
	};
	console.log('send socket message: call');
	socket.emit('call', message);
}

function sendMessage() {
	var text = messageInput.value;
	if ( text && text !== '') {
		socket.emit('textmessage', text);
	}
}


///---------------USER MEDIA-----------------

var isCamSharing = false, isScreenSharing = false;
var camaStreamId, screenStreamId;
var mediaStream, screenStream;
var camConstraints = { 
	audio: {
		optional: [],
		mandatory: {
			//googEchoCancellation: true
			//"googAutoGainControl": "false",
			//"googNoiseSuppression": "false",
			//"googHighpassFilter": "false"
		}
	}, 
	video: {
		mandatory: {
			maxWidth: 800,
			maxHeight: 450
		},
		optional: []
	}
};
var screenConstraints = {
	audio: false, //100年后，当chrome的桌面共享支持声音时，可改为true
	video: {
		mandatory: {
			chromeMediaSource: 'screen',
			maxWidth: 1024,
			maxHeight: 768
		},
		optional: []
	}
};

function initCamera() {
	getUserMedia(camConstraints, gotCamera, gotCameraError);
}

function initScreen() {
	getUserMedia(screenConstraints, gotScreen, gotScreenError);
}

function gotCamera(stream) {
	//console.log('gotCamera');
	mediaStream = stream;
	isCamSharing = true;
	shareCamButton.innerHTML = 'StopSharingCam';
	socket.emit('sharecam', true);
}

function gotCameraError(error) {
	stopSharingCamera();
}

function gotScreen(stream) {
	//console.log('gotScreen');
	screenStream = stream;
	isScreenSharing = true;
	shareScreenButton.innerHTML = 'StopSharingScreen';
	socket.emit('sharescreen', true);
}

function gotScreenError(stream) {
	stopSharingScreen();
}

function stopSharingCamera() {
	if (mediaStream) {
		mediaStream.stop();
	}
	mediaStream = null;
	isCamSharing = false;
	shareCamButton.innerHTML = 'ShareCam';
	socket.emit('sharecam', false);
}

function stopSharingScreen() {
	if (screenStream) {
		screenStream.stop();
	}
	screenStream = null;
	isScreenSharing = false;
	shareScreenButton.innerHTML = 'ShareScreen';
	socket.emit('sharescreen', false);
}


///---------------P2P-----------------

var iceServers = (navigator.mozGetUserMedia) ?
  { iceServers:[{ url: 'stun:23.21.150.121'}]} : // number IP
  { iceServers: [{ url: 'stun:stun.l.google.com:19302'}]};
var optionalRtpDataChannels = {
    optional: [
        { RtpDataChannels: true },
		{ DtlsSrtpKeyAgreement: true }
    ]
};
var audioOnlyOfferConstraints = {
    optional: [],
    mandatory: {
        OfferToReceiveAudio: true,
        OfferToReceiveVideo: false
    }
};
var videoOnlyOfferConstraints = {
    optional: [],
    mandatory: {
        OfferToReceiveAudio: false,
        OfferToReceiveVideo: true
    }
};
var offerConstraints = {
    optional: [],
    mandatory: {
        OfferToReceiveAudio: true,
        OfferToReceiveVideo: true
    }
};

var rtcPeerConnections = { };
var targetPeers = { };
var offerSDPs = { };
var answerSDPs = { };
var targetUserIds = { };

function getRtcPeerConnection(id, type) {
	var tmp = (type === 4) ? '-screen' : '-media';
	return rtcPeerConnections[id + tmp];
}

function buildRtcPeerConnection(type) {	
	var rtcPeerConnection = new RTCPeerConnection(iceServers, optionalRtpDataChannels);
	rtcPeerConnection.onicecandidate = handleIceCandidate;
	rtcPeerConnection.onaddstream = handleRemoteStreamAdded;
	rtcPeerConnection.onremovestream = handleRemoteStreamRemoved;
	return rtcPeerConnection;
}

function handleIceCandidate(event) {
	//console.log('handleIceCandidate event: ');
	if (event.candidate) {
		var candidate = {
			sdpMLineIndex: event.candidate.sdpMLineIndex,
			candidate: event.candidate.candidate };
		var message = {
			userid: USER_ID,
			candidate: candidate
		};
		console.log('send socket message: candidate');
		socket.emit('candidate', message);
	} else {
		console.log('End of candidates.');
	}
}

function handleRemoteStreamAdded(event) {
	//console.log('handleRemoteStreamAdded');
	
	console.log('>>> now we can play video!');
	attachMediaStream(remoteCam, event.stream);
	
	// TODO: Mix Audio from remote stream & local mic
	// TODO: Record video & audio to local disk, then upload to media-storage-server
}

function handleRemoteStreamRemoved(event) {
	console.log('handleRemoteStreamRemoved');
	
	// TODO: Stop recording
}

function onOfferCreated(sdp) {
	//console.log('onOfferCreated');
	offerSDP = sdp;
	console.log('>>> setLocalDescription offer');
	rtcPeerConnection.setLocalDescription(sdp, onOfferSDPSet, onError);
}

function onOfferSDPSet() {
	//console.log('onOfferSDPSet');
	var message = {
		userid: targetUserId,
		sdp: offerSDP
	};
	console.log('send socket message: offer');
	socket.emit('offer', message);
}

function onRemoteSDPSet() {
	//console.log('onRemoteSDPSet');
	rtcPeerConnection.createAnswer(onAnswerCreated, onError);
}

function onAnswerCreated(sdp) {
	//console.log('onAnswerCreated');
	answerSDP = sdp;
	console.log('>>> setLocalDescription answer');
	rtcPeerConnection.setLocalDescription(sdp, onAnswerSDPSet, onError);
}

function onAnswerSDPSet() {
	var message = {
		userid: targetUserId,
		sdp: answerSDP
	};
	console.log('send socket message: answer');
	socket.emit('answer', message);
}

function onError(error){
	console.log('onError', error);
}

///--------------DOM----------------

// 更新room名称DOM
function refreshRoomDOM(room) {
	var roomNameLabel = document.getElementById('roomNameLabel');
	if (room) {
		roomNameLabel.innerHTML = room.roomname;
		roomNameInput.setAttribute('readonly','readonly');
		userNameInput.setAttribute('readonly','readonly');
	}
	else {
		roomNameLabel.innerHTML = 'No room';
		roomNameInput.removeAttribute('readonly');
		userNameInput.removeAttribute('readonly');
	}
}

// 更新room内user列表DOM
function refreshUserListDOM(users) {
	var ul = document.getElementById('userlist');
	ul.innerHTML = '';
	for (var i = 0; i < users.length; i++) {
		var li = document.createElement('li');
		li.innerHTML = '<span>' + users[i].username + '</span>';
		li.innerHTML += '<a href="javascript:call(\''+ users[i].userid +'\')"><img src="images/cam.png"  /></a>';
		li.innerHTML += '<a href="javascript:call(\''+ users[i].userid +'\')"><img src="images/screen.png"  /></a>';
		ul.appendChild(li);
	}
}

// 更新room列表DOM
function refreshRoomListDOM(rooms) {
	var ul = document.getElementById('roomlist');
	ul.innerHTML = '';
	for (var i = 0; i < rooms.length; i++) {
		var li = document.createElement('li');
		li.innerHTML = '<a href="javascript:joinRoom(\'' + rooms[i].roomid + '\');">[' + (i+1) + '] ' + rooms[i].roomname + '</a>';
		ul.appendChild(li);
	}
}

// 增加一条文字消息
function refreshMessageListDOM(time, from, text, color) {
	var div = document.getElementById('messages');
	var p = document.createElement('p');
	p.innerHTML = time + ' ' + from + ': ' + text;
	if (color) {
		p.style.backgroundColor = color;
	}
	div.appendChild(p);
}
