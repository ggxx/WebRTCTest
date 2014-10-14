'use strict';

//初始化全局参数
var USER_ID = guid();

//web控件
var getRoomsButton = document.getElementById('getRoomsButton');
var sendMessageButton = document.getElementById('sendMessageButton');
var createRoomButton = document.getElementById('createRoomButton');
var shareScreenButton = document.getElementById('shareScreenButton');
var shareCamButton = document.getElementById('shareCamButton');

var remoteCam = document.getElementById('remoteCam');
var localCam = document.getElementById('localCam');


///////////////////////////////////////////////////////////
//初始化websocket
var socket = io.connect('https://192.168.0.188');

//初始化RTCPeerConnection
var iceServers = {
    iceServers: [{
        url: 'stun:stun.l.google.com:19302'
    }]
};
var optionalRtpDataChannels = {
    optional: [
        { RtpDataChannels: true },
		{ DtlsSrtpKeyAgreement: true }
    ]
};

var offerSDP, answerSDP;
var rtcPeerConnection = new RTCPeerConnection(iceServers, optionalRtpDataChannels);

rtcPeerConnection.onicecandidate = handleIceCandidate;
rtcPeerConnection.onaddstream = handleRemoteStreamAdded;
rtcPeerConnection.onremovestream = handleRemoteStreamRemoved;

function handleIceCandidate(event) {
	console.log('handleIceCandidate event: ', event);
	if (event.candidate) {
		var candidate = {
			//type: 'candidate',
			//id: event.candidate.sdpMid,
			sdpMLineIndex: event.candidate.sdpMLineIndex,
			candidate: event.candidate.candidate };
		socket.emit('candidate', candidate);
	} else {
		console.log('End of candidates.');
	}
}

function handleRemoteStreamAdded(event) {
	console.log('handleRemoteStreamAdded', event.stream);
	attachMediaStream(remoteCam, event.stream);
	
	//window.AudioContext = window.AudioContext || window.webkitAudioContext;
	//var audioContext = new AudioContext();
	//var audioTracks = event.stream.getAudioTracks();
	//var inputPoint = audioContext.createGain();
    //realAudioInput = audioContext.createMediaStreamSource(event.stream);
    //audioInput = realAudioInput;
    //audioInput.connect(inputPoint);
}

function handleRemoteStreamRemoved(event) {
	console.log('handleRemoteStreamRemoved');
}

var mediaConstraints = {
    optional: [],
    mandatory: {
        OfferToReceiveAudio: true, // Hehe
        OfferToReceiveVideo: true // Hehe
    }
};



////////////////////////////////////////

function createRoom() {
	var roomId = guid();
	var room = {
		roomid: roomId,
		roomname: document.getElementById('roomNameInput').value || 'NoNameRoom',
		roomtype: 'text-only'
	};
	var user = {
		userid: USER_ID,
		username: document.getElementById('userNameInput').value || 'NoNameUser',
		roomid: roomId,
		ice: {}
	};
	var message = {
		room: room,
		user: user
	};
	socket.emit('createroom', message);
}

function getUsers(roomid) {
	socket.emit('users', roomid);
}

function getRooms() {
	console.log('getRooms');
	socket.emit('rooms');
}

function joinRoom(roomid) {
	var user = {
		userid: USER_ID,
		username: document.getElementById('userNameInput').value || 'NoNameUser',
		roomid: roomid,
		ice: {}
	};
	socket.emit('joinroom', user);
}

function leaveRoom(roomid) {
	socket.emit('leaveroom');
}

function shareScreen() {
	
}

function shareCam() {
	
}

function getLocalStream() {
	var camConstraints = { 
		audio: {
			optional: [],
			mandatory: {
				googEchoCancellation: true
				//"googAutoGainControl": "false",
				//"googNoiseSuppression": "false",
				//"googHighpassFilter": "false"
			}
		}, 
		video: true 
	};
	var videoOnlyConstraints = { 
		audio: false,
		video: true 
	};
	getUserMedia(camConstraints, handleUserMedia, handleUserMediaError);
}

function handleUserMedia(stream) {
	console.log('handleUserMedia');
	
	var video_constraints = {
		mandatory: {
			chromeMediaSource: 'screen'
		},
		optional: []
	};

	var constraints = {
		audio: false, //100年后，当chrome的桌面共享支持声音时，可改为true
		video: video_constraints
	};
	
	// 支持桌面共享时，则共享桌面（如chrome）；不支持桌面共享，则共享摄像头（如firefox）
	getUserMedia(constraints, handleScreenMedia, function(){ handleScreenMedia(stream); });
	
	
	//attachMediaStream(localCam, stream);
    //rtcPeerConnection.addStream(stream);
}

function handleScreenMedia(stream) {
	attachMediaStream(localCam, stream);
    rtcPeerConnection.addStream(stream);
}

function handleUserMediaError(error) {
	console.log('handleUserMediaError', error);
}

function sendMessage() {
	console.log('sendMessage');
	var text = document.getElementById('messageInput').value || 'nothing';
	socket.emit('textmessage', text);
}

function call(userid) {
	console.log('call', userid);
	rtcPeerConnection.createOffer(onOfferCreated, onError);
}

function onOfferCreated(sdp) {
	offerSDP = sdp;
	rtcPeerConnection.setLocalDescription(sdp, onOfferSDPSet, onError);
}

function onOfferSDPSet() {
	socket.emit('offer', offerSDP);
}

function onRemoteSDPSet() {
	rtcPeerConnection.createAnswer(onAnswerCreated, onError);
}

function onAnswerCreated(sdp) {
	answerSDP = sdp;
	rtcPeerConnection.setLocalDescription(sdp, onAnswerSDPSet, onError);
}

function onAnswerSDPSet() {
	socket.emit('answer', answerSDP);
}

function onError(error){
	console.log('onError', error);
}


/////////////////////////////

socket.on('open', function() {

	console.log('服务器连接成功');

	getLocalStream();
	getRooms();
	
	// 服务器返回用户列表
	socket.on('users', function(users) {
		// 更新房间内的用户列表
		refreshUserListDOM(users);
	});

	// 服务器返回房间列表
	socket.on('rooms', function(rooms) {		
		// 更新房间列表
		refreshRoomListDOM(rooms);
	});

	// 服务器通知新用户进入房间
	socket.on('joinroom', function(result) {
		if (result === true) {
			addTextMessage('', 'system', '您已成功进入房间');
		}
		else if (result === false) {
			addTextMessage('', 'system', '进入房间失败');
		}
		else {
			addTextMessage('', 'system', result + '已进入房间');
		}
	});

	// 
	socket.on('createroom', function(result) {
		if (result === true) {
			addTextMessage('', 'system', '您已成功创建房间');
		}
		else {
			addTextMessage('', 'system', '创建房间失败');
		}
	});
	
	// 
	socket.on('leaveroom', function() {
		refreshUserListDOM([]);
	});
	
	// 
	socket.on('textmessage', function(message) {
		console.log('textmessage');
		addTextMessage(message.time, message.from, message.text, message.color);
	});
	
	socket.on('candidate', function(message){
		console.log('socket on candidate', message);
		var candidate = new RTCIceCandidate({
			sdpMLineIndex: message.sdpMLineIndex,
			candidate: message.candidate
		});
		rtcPeerConnection.addIceCandidate(candidate);
	});
	
	socket.on('offer', function(sdp) {
		console.log('socket on offer', sdp);
		rtcPeerConnection.setRemoteDescription(new RTCSessionDescription(sdp), onRemoteSDPSet, onError);
	});
	
	socket.on('answer', function(sdp) {
		console.log('socket on answer', sdp);
		rtcPeerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
	});
	
});


/////////////////////////////////////////

function refreshUserListDOM(users) {
	var list = document.getElementById('userlist');
	list.innerHTML = '';
	for (var i = 0; i < users.length; i++) {
		var p = document.createElement('p');
		p.innerHTML = users[i].username + ' [' + users[i].userid + ']';
		p.innerHTML += '<button onclick="javascript:call(\''+ users[i].userid +'\')">Call</button>';
		list.appendChild(p);
	}
}

function refreshRoomListDOM(rooms) {
	var list = document.getElementById('roomlist');
	list.innerHTML = '';
	for (var i = 0; i < rooms.length; i++) {
		var p = document.createElement('p');
		p.innerHTML = '<a href="javascript:getUsers(\'' + rooms[i].roomid + '\');">' + rooms[i].roomname + '</a>';
		p.innerHTML += '<button onclick="javascript:joinRoom(\'' + rooms[i].roomid + '\');">Join</button>';
		p.innerHTML += '<button onclick="javascript:leaveRoom(\'' + rooms[i].roomid + '\');">Leave</button>';
		list.appendChild(p);
	}
	if (rooms.length === 0) {
		var uList = document.getElementById('userlist');
		uList.innerHTML = '';
	}
}

function addTextMessage(time, from, text, color) {
	var logs = document.getElementById('logs');
	var p = document.createElement('p');
	p.innerHTML = time + ' ' + from + ': ' + text;
	if (color) {
		p.style.backgroundColor = color;
	}
	logs.appendChild(p);
}

getRoomsButton.onclick = getRooms;
createRoomButton.onclick = createRoom;
sendMessageButton.onclick = sendMessage;
shareScreenButton.onclick = shareScreen;
shareCamButton.onclick = shareCam;

