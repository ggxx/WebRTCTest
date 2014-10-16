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
var localCam = document.getElementById('localCam');

createRoomButton.onclick = createRoom;
leaveRoomButton.onclick = leaveRoom;
shareCamButton.onclick = shareCam;
shareScreenButton.onclick = shareScreen;
sendMessageButton.onclick = sendMessage;


///--------------SOCKET.IO------------------

var socket = io.connect('https://192.168.137.1');
socket.on('open', function() {

	console.log('服务器连接成功');
	
	socket.on('bind', function(v){
		console.log('socket on bind');
		initRtcPeerConnection();
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
		if (message.result === true && message.closed === true) {
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
	socket.on('call', function(message) {
		console.log('socket on call');
		targetUserId = message.userid;
		
		if (!camStream && !screenStream) {
			return;
		}
		if (camStream) {
		console.log('addStream camStream');
			rtcPeerConnection.addStream(camStream);
		}
		if (screenStream) {
			console.log('addStream screenStream');
			rtcPeerConnection.addStream(screenStream);
		}
	
		console.log('start create offer');
		rtcPeerConnection.createOffer(onOfferCreated, onError);
	});
	
	socket.on('candidate', function(message) {
		console.log('socket on candidate');
		var candidate = new RTCIceCandidate({
			sdpMLineIndex: message.candidate.sdpMLineIndex,
			candidate: message.candidate.candidate
		});
		rtcPeerConnection.addIceCandidate(candidate);
	});
	
	socket.on('offer', function(message) {
		console.log('socket on offer');
		console.log('>>> setRemoteDescription offer');
		rtcPeerConnection.setRemoteDescription(new RTCSessionDescription(message.sdp), onRemoteSDPSet, onError);
		
		// test double 
		//offerSDP = message.sdp;
	});
	
	socket.on('answer', function(message) {
		console.log('socket on answer');
		console.log('>>> setRemoteDescription answer');
		rtcPeerConnection.setRemoteDescription(new RTCSessionDescription(message.sdp));
		
		// test double 
		//answerSDP = message.sdp;
	});
	
	console.log('send socket message: bind');
	socket.emit('bind', USER_ID);
	getRooms();
	
});


///--------------LOGIC----------------

function getRooms() {
	//console.log('getRooms');
	console.log('send socket message: rooms');
	socket.emit('rooms');
}

function createRoom() {
	var room = {
		roomid: guid(),
		roomname: roomNameInput.value || 'NoNameRoom',
		roomtype: ''
	};
	console.log('send socket message: createroom');
	socket.emit('createroom', room);
}

function joinRoom(roomid) {
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
	if (isSharingCam === false) {
		initCamera();
	}
	else {
		stopSharingCamera();
	}
}

function shareScreen() {
	initScreen();
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

// type => 1.cam & mic; 2.screen; 3.screen & cam & mic
function call(userid, type) {
	//console.log('call');
	targetUserId = userid;
	var message = {
		userid: userid,
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
var camStream, screenStream;
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
	video: true 
};
var screenConstraints = {
	audio: false, //100年后，当chrome的桌面共享支持声音时，可改为true
	video: {
		mandatory: {
			chromeMediaSource: 'screen'
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
	camStream = stream;
	isCamSharing = true;
	shareCamButton.innerHTML = 'StopSharingCam';
}

function gotCameraError(error) {
	camStream = null;
	isCamSharing = false;
	shareCamButton.innerHTML = 'ShareCam';
}

function gotScreen(stream) {
	//console.log('gotScreen');
	screenStream = stream;
	isScreenSharing = true;
	shareScreenButton.innerHTML = 'StopSharingScreen';
}

function gotScreenError(stream) {
	screenStream = null;
	isScreenSharing = false;
	shareScreenButton.innerHTML = 'ShareScreen';
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
var mediaConstraints = {
    optional: [],
    mandatory: {
        OfferToReceiveAudio: true,
        OfferToReceiveVideo: true
    }
};
var rtcPeerConnection, offerSDP, answerSDP;
var targetUserId = '';

function initRtcPeerConnection() {
	
	if (rtcPeerConnection) {
		
	}
	
	rtcPeerConnection = new RTCPeerConnection(iceServers, optionalRtpDataChannels);
	rtcPeerConnection.onicecandidate = handleIceCandidate;
	rtcPeerConnection.onaddstream = handleRemoteStreamAdded;
	rtcPeerConnection.onremovestream = handleRemoteStreamRemoved;
}

function handleIceCandidate(event) {
	//console.log('handleIceCandidate event: ');
	if (event.candidate) {
		var candidate = {
			sdpMLineIndex: event.candidate.sdpMLineIndex,
			candidate: event.candidate.candidate };
		var message = {
			userid: targetUserId,
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
	//console.log('handleRemoteStreamRemoved');
	
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
	roomNameLabel.innerHTML = room.roomname;
}

// 更新room内user列表DOM
function refreshUserListDOM(users) {
	var ul = document.getElementById('userlist');
	ul.innerHTML = '';
	for (var i = 0; i < users.length; i++) {
		var li = document.createElement('li');
		li.innerHTML = users[i].username;
		li.innerHTML += '<button onclick="javascript:call(\''+ users[i].userid +'\')">Call</button>';
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
