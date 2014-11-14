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
var remoteScr = document.getElementById('remoteScr');
var localCam = document.getElementById('localCam');
var localScr = document.getElementById('localScr');

var settingHeader = document.getElementById('settingHeader');

var camWidthInput = document.getElementById('camWidthInput');
var camHeightInput = document.getElementById('camHeightInput');
var scrWidthInput = document.getElementById('scrWidthInput');
var scrHeightInput = document.getElementById('scrHeightInput');

createRoomButton.onclick = createRoom;
leaveRoomButton.onclick = leaveRoom;
shareCamButton.onclick = shareCam;
shareScreenButton.onclick = shareScreen;
sendMessageButton.onclick = sendMessage;

messageInput.onkeydown = pressEnterToSendMessage;
window.onload = loadedWindow;
window.onbeforeunload = closingWindow;
settingHeader.onclick = toggle;





///--------------SOCKET.IO------------------

var socket = io.connect('https://192.168.2.102');
socket.on('open', function() {

	//console.log('服务器连接成功');
	
	socket.on('bind', function(v){
		//console.log('socket on bind');
	});
	
	// 服务器返回房间列表
	socket.on('rooms', function(rooms) {
		//console.log('socket on rooms');
		
		// 更新房间列表
		refreshRoomListDOM(rooms);
	});
	
	// 服务器返回用户列表
	socket.on('users', function(users) {
		//console.log('socket on users');
		
		// 更新房间内的用户列表
		refreshUserListDOM(users);
	});
	
	// 服务器返回创建room结果
	// message.result => true/false 是否创建成功
	// message.text   => 创建失败的原因
	// message.room   => 创建的room
	socket.on('createroom', function(message) {
		//console.log('socket on createroom');
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
		//console.log('socket on joinroom');
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
		//console.log('socket on leaveroom');
		if (message.result === true) {
			refreshRoomDOM();
			refreshUserListDOM([]);
		}
	});
	
	// 更新状态
	socket.on('sharecam', function(message) {
		refreshUserDeviceDOM(message.userid, message.username, message.cameraSharing, message.microphoneSharing);
	});
	
	// 更新状态
	socket.on('sharescreen', function(message) {
		refreshUserDeviceDOM(message.userid, message.username, '', '', message.screenSharing);
	});
	
	socket.on('textmessage', function(message) {
		//console.log('socket on textmessage');
		if (message.result === true) {
			refreshMessageListDOM(message.time, message.from, message.text, message.color);
			messageInput.value = '';
		}
		else {
			refreshMessageListDOM(message.time, '发送失败',  message.text, 'Red');
		}
	});
	
	// 收到media共享的请求
	// from 
	// to
	// streamtype => 1.camera, 2.microphone, 3.cam & mic, 4.screen
	socket.on('call', function(message) {
		console.log('receive call message from' + message.from);
		
		if (message.streamtype === 1 || message.streamtype === 2 || message.streamtype === 3) {
			if (!mediaStream) {
				console.log('no media stream');
				return;
			}
			rtcPeerConnections[message.from + '-offer-media'] = buildRtcPeerConnection(message.from, message.streamtype, true);
			rtcPeerConnections[message.from + '-offer-media'].addStream(mediaStream);
			switch (message.streamtype) {
				case 1:
					rtcPeerConnections[message.from + '-offer-media'].createOffer(rtcPeerConnections[message.from + '-offer-media'].onoffercreated, onError, videoOnlyOfferConstraints);
					break;
				case 2:
					rtcPeerConnections[message.from + '-offer-media'].createOffer(rtcPeerConnections[message.from + '-offer-media'].onoffercreated, onError, audioOnlyOfferConstraints);
					break;
				case 3:
					rtcPeerConnections[message.from + '-offer-media'].createOffer(rtcPeerConnections[message.from + '-offer-media'].onoffercreated, onError, offerConstraints);
					break;
			}
		}
		else if (message.streamtype === 4) {
			if (!screenStream) {
				console.log('no screen stream');
				return;
			}
			rtcPeerConnections[message.from + '-offer-screen'] = buildRtcPeerConnection(message.from, message.streamtype, true);
			rtcPeerConnections[message.from + '-offer-screen'].addStream(screenStream);
			rtcPeerConnections[message.from + '-offer-screen'].createOffer(rtcPeerConnections[message.from + '-offer-screen'].onoffercreated, onError, videoOnlyOfferConstraints);
		}
		else {
			console.log('message.streamtype (' + message.streamtype + ') is wrong');
		}
	});
	
	// from
	// to
	// candidate
	// streamtype
	// tag
	socket.on('candidate', function(message) {
		console.log('receive candidate message from ' + message.from);
		var candidate = new RTCIceCandidate({
			sdpMLineIndex: message.candidate.sdpMLineIndex,
			candidate: message.candidate.candidate
		});	
		getRTCPeerConnection(message.from, message.streamtype, !message.tag).addIceCandidate(candidate);
	});
	
	// from
	// to
	// sdp
	// streamtype
	socket.on('offer', function(message) {
		console.log('receive offer message from ' + message.from);
		var rtcPeerConnection = getRTCPeerConnection(message.from, message.streamtype, false);
		console.log('setRemoteDescription');
		rtcPeerConnection.setRemoteDescription(new RTCSessionDescription(message.sdp), rtcPeerConnection.onremotesdpset, onError);
	});
	
	// from
	// to
	// sdp
	// streamtype
	socket.on('answer', function(message) {
		console.log('receive answer message from ' + message.from);
		var rtcPeerConnection = getRTCPeerConnection(message.from, message.streamtype, true);
		console.log('setRemoteDescription');
		rtcPeerConnection.setRemoteDescription(new RTCSessionDescription(message.sdp));
	});
	
	
	//console.log('send socket message: bind');
	socket.emit('bind', USER_ID);
	
	// 刷新房间列表
	getRooms();
});


///--------------LOGIC----------------

function getRooms() {
	//console.log('getRooms');
	//console.log('send socket message: rooms');
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
	//console.log('send socket message: createroom');
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
	
	var message = {
		userid: USER_ID,
		username: userNameInput.value || 'NoNameUser',
		roomid: roomid,
		ice: { }
	};
	//console.log('send socket message: joinroom');
	socket.emit('joinroom', message);
}

function getUsers(roomid) {
	//console.log('getUsers');
	
	//console.log('send socket message: users');
	socket.emit('users', roomid);
}

function leaveRoom() {
	//console.log('leaveroom');
	if (mediaStream) { mediaStream.stop(); }
	if (screenStream) { screenStream.stop(); }
	if (remoteCameraStream) { remoteCameraStream.stop(); }
	if (remoteScreenStream) { remoteScreenStream.stop(); }
	
	//console.log('send socket message: leaveroom');
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
	//console.log('send socket message: share');
	socket.emit('share', type);
}

function stopSharing() {
	//console.log('stopsharing');
	//console.log('send socket message: stopsharing');
	socket.emit('stopsharing');
}

// type => 1.cam, 2.mic, 3.cam & mic, 4.screen
function call(userid, type) {
	//console.log('call');
	var message = {
		from: USER_ID,
		to: userid,
		streamtype: type
	};

	var tmp = (type === 4) ? '-answer-screen' : '-answer-media';
	rtcPeerConnections[userid + tmp] = buildRtcPeerConnection(userid, type, false);
	
	console.log('send call message to ' + message.to);
	socket.emit('call', message);
}

function sendMessage() {
	var text = messageInput.value;
	if ( text && text !== '') {
		socket.emit('textmessage', text);
	}
}

function pressEnterToSendMessage(e) {
	if (e.keyCode == 13) {
		sendMessage();
	}
}


///---------------USER MEDIA-----------------

var isCamSharing = false, isScreenSharing = false;
var mediaStream, screenStream;
var remoteCameraStream, remoteScreenStream;

function initCamera() {
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
				maxWidth: camWidthInput.value || 640,
				maxHeight: camHeightInput.value || 360
			},
			optional: []
		}
	};
	getUserMedia(camConstraints, gotCamera, gotCameraError);
}

function initScreen() {
	var screenConstraints = {
		audio: false, //100年后，当chrome的桌面共享支持声音时，可改为true
		video: {
			mandatory: {
				chromeMediaSource: 'screen',
				maxWidth: scrWidthInput.value || 1920,
				maxHeight: scrHeightInput.value || 1080
			},
			optional: []
		}
	};
	getUserMedia(screenConstraints, gotScreen, gotScreenError);
}

function gotCamera(stream) {
	//console.log('gotCamera');
	attachMediaStream(localCam, stream);
	mediaStream = stream;
	isCamSharing = true;
	shareCamButton.innerHTML = 'StopSharingCam';
	var rMessage = {
		userid: USER_ID,
		cameraSharing: true,
		microphoneSharing: true
	};
	console.log('send sharecam message');
	socket.emit('sharecam', rMessage);
}

function gotCameraError(error) {
	//console.log('gotCameraError');
	alert('共享摄像头失败');
	stopSharingCamera();
}

function gotScreen(stream) {
	//console.log('gotScreen');
	attachMediaStream(localScr, stream);
	screenStream = stream;
	isScreenSharing = true;
	shareScreenButton.innerHTML = 'StopSharingScreen';
	var rMessage = {
		userid: USER_ID,
		screenSharing: true
	};
	console.log('send sharescreen message');
	socket.emit('sharescreen', rMessage);
}

function gotScreenError(error) {
	//console.log('gotScreenError');
	alert('共享桌面失败');
	stopSharingScreen();
}

function stopSharingCamera() {
	if (mediaStream) {
		mediaStream.stop();
	}
	mediaStream = null;
	isCamSharing = false;
	shareCamButton.innerHTML = 'ShareCamera';
	var rMessage = {
		userid: USER_ID,
		cameraSharing: false,
		microphoneSharing: false
	};
	socket.emit('sharecam', rMessage);
}

function stopSharingScreen() {
	if (screenStream) {
		screenStream.stop();
	}
	screenStream = null;
	isScreenSharing = false;
	shareScreenButton.innerHTML = 'ShareScreen';
	var rMessage = {
		userid: USER_ID,
		screenSharing: false
	};
	socket.emit('sharescreen', rMessage);
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

function getRTCPeerConnection(id, type, isOffer) {
	var tmp1 = (isOffer === true) ? '-offer' : '-answer';
	var tmp2 = (type === 4) ? '-screen' : '-media';
	return rtcPeerConnections[id + tmp1 + tmp2];
}

function buildRtcPeerConnection(id, type, isOffer) {	
	var rtcPeerConnection = new RTCPeerConnection(iceServers, optionalRtpDataChannels);
	rtcPeerConnection.onicecandidate = handleIceCandidate;
	rtcPeerConnection.onaddstream = handleRemoteStreamAdded;
	rtcPeerConnection.onremovestream = handleRemoteStreamRemoved;
	rtcPeerConnection.oniceconnectionstatechange = handleIceConnectionStateChange;
	rtcPeerConnection.onreadystatechange = handleReadyStateChange;
	
	// custom function
	rtcPeerConnection.onremotesdpset = onRemoteSDPSet;
	rtcPeerConnection.onoffercreated = onOfferCreated;
	rtcPeerConnection.isoffer = isOffer;
	
	
	function handleIceCandidate(event) {
		console.log('handleIceCandidate event');
		if (event.candidate) {
			var candidate = {
				sdpMLineIndex: event.candidate.sdpMLineIndex,
				candidate: event.candidate.candidate };
			var rMessage = {
				from: USER_ID,
				to: id,
				candidate: candidate,
				streamtype: type,
				tag: rtcPeerConnection.isoffer
			};
			console.log('send candidate message to '+ rMessage.to);
			socket.emit('candidate', rMessage);
		} else {
			console.log('End of candidates.');
		}
	}
	
	function onOfferCreated(sdp) {
		//console.log('onOfferCreated');
		rtcPeerConnection.offerSDP = sdp;
		console.log('setLocalDescription');
		rtcPeerConnection.setLocalDescription(sdp, onOfferSDPSet, onError);
	}
	
	function onRemoteSDPSet() {
		//console.log('onRemoteSDPSet');
		rtcPeerConnection.createAnswer(onAnswerCreated, onError);
	}
	
	function onAnswerCreated(sdp) {
		//console.log('onAnswerCreated');
		rtcPeerConnection.answerSDP = sdp;
		console.log('setLocalDescription');
		rtcPeerConnection.setLocalDescription(sdp, onAnswerSDPSet, onError);
	}
	
	function onOfferSDPSet() {
		//console.log('onOfferSDPSet');
		var message = {
			from: USER_ID,
			to: id,
			sdp: rtcPeerConnection.offerSDP,
			streamtype: type
		};
		console.log('send offer message to ' + message.to);
		socket.emit('offer', message);
	}

	function onAnswerSDPSet() {
		var message = {
			from: USER_ID,
			to: id,
			sdp: rtcPeerConnection.answerSDP,
			streamtype: type
		};
		console.log('send answer message to ' + message.to);
		socket.emit('answer', message);
	}
	
	function handleRemoteStreamAdded(event) {
		//console.log('handleRemoteStreamAdded');
		if (type === 4) {
			remoteScreenStream = event.stream;
			attachMediaStream(remoteScr, remoteScreenStream);
		} 
		else {
			remoteCameraStream = event.stream;
			attachMediaStream(remoteCam, remoteCameraStream);
			
			// TODO: Mix Audio from remote stream & local mic
			// TODO: Record video & audio to local disk, then upload to media-storage-server
			
			//var audioTracks = remoteCameraStream.getAudioTracks();
			
			
			
		}
	}
	
	function handleIceConnectionStateChange(event) {
		//console.log('handleIceConnectionStateChange');
		if (rtcPeerConnection.iceConnectionState === 'disconnected') {
			if (type === 4) {
				if (screenStream) {
					rtcPeerConnection.removeStream(screenStream);
				}
				if (remoteScreenStream) {
					rtcPeerConnection.removeStream(remoteScreenStream);
					remoteScreenStream.stop();
					remoteScreenStream = null;
				}
			}
			else if (type >= 1 && type <= 3) {
				if (mediaStream) {
					rtcPeerConnection.removeStream(mediaStream);
				}
				if (remoteCameraStream) {
					rtcPeerConnection.removeStream(remoteCameraStream);
					remoteCameraStream.stop();
					remoteCameraStream = null;
				}
			}
			//rtcPeerConnection.close();
		}
	}
	
	return rtcPeerConnection;
}

function handleRemoteStreamRemoved(event) {
	//console.log('handleRemoteStreamRemoved');
	
	// TODO: Stop recording
}

function handleReadyStateChange(event) {
	//console.log('handleReadyStateChange');
	//console.log(event);
}

function onError(error){
	console.log('onError', error);
}


///--------------DOM----------------

function closingWindow() {
	return '提示';
}

function loadedWindow() {
	document.getElementById('setting').style.display = 'none';
}


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
		if (users[i].userid === USER_ID) {
			continue;
		}
		var li = document.createElement('li');
		li.id = users.userid + '-li';
		li.innerHTML = '<span>' + users[i].username + '</span>';
		li.innerHTML += '<a id="' + users[i].userid + '-cam' + '" href="javascript:call(\''+ users[i].userid +'\', 3)" class="disabledlink"><img src="images/cam.png"  /></a>';
		li.innerHTML += '<a id="' + users[i].userid + '-scr' + '" href="javascript:call(\''+ users[i].userid +'\', 4)" class="disabledlink"><img src="images/screen.png"  /></a>';
		ul.appendChild(li);
		refreshUserDeviceDOM(users[i].userid, users[i].username, users[i].cameraSharing, users[i].microphoneSharing, users[i].screenSharing);
	}
}

// 更新一个用户的共享状态
function refreshUserDeviceDOM(id, name, cam, mic, scr) {
	if (id === USER_ID) {
		return;
	}
	
	var camlink = document.getElementById(id + '-cam');
	var scrlink = document.getElementById(id + '-scr');
	if (cam === true) {
		camlink.setAttribute('class', 'enabledlink');
		camlink.href = 'javascript:call("'+ id +'", 3)';
	}
	else if (cam === false) {
    	camlink.setAttribute('class', 'disabledlink');
		camlink.href = 'javascript:void(0)';
	}
	if (scr === true) {
		scrlink.setAttribute('class', 'enabledlink');
		scrlink.href = 'javascript:call("'+ id +'", 4)';
	}
	else if (scr === false) {
    	scrlink.setAttribute('class', 'disabledlink');
		scrlink.href = 'javascript:void(0)';
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
	div.scrollTop = div.scrollHeight;
}

// 折叠区域
function toggle() {
	var div = document.getElementById('setting');
	div.style.display = (div.style.display == "none") ? "block" : "none";
}
