'use strict';

//初始化全局参数
var USER_ID = guid();

//web控件
var getRoomsButton = document.getElementById('getRoomsButton');
var sendMessageButton = document.getElementById('sendMessageButton');
var createRoomButton = document.getElementById('createRoomButton');

//初始化websocket
var socket = io.connect('http://localhost');



///////////////////////////////////////////////////////////

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


var rtcSessionDescription;
var offerer = new RTCPeerConnection(iceServers, optionalRtpDataChannels);
var offererDataChannel = offerer.createDataChannel('RTCDataChannel', { reliable: false });

offerer.onicecandidate = handleIceCandidate;
offerer.onaddstream = handleRemoteStreamAdded;
offerer.onremovestream = handleRemoteStreamRemoved;


function handleIceCandidate(event) {
  console.log('handleIceCandidate event: ', event);
  if (event.candidate) {
    sendMessage({
      type: 'candidate',
      label: event.candidate.sdpMLineIndex,
      id: event.candidate.sdpMid,
      candidate: event.candidate.candidate});
  } else {
    console.log('End of candidates.');
  }
}

function handleRemoteStreamAdded(event) {
  console.log('Remote stream added.');
  remoteVideo.src = window.URL.createObjectURL(event.stream);
  remoteStream = event.stream;
}

function handleRemoteStreamRemoved(event) {
}

setChannelEvents(offererDataChannel, "offerer");

function setChannelEvents(channel, channelNameForConsoleOutput) {
    channel.onmessage = function (event) {
        console.debug(channelNameForConsoleOutput, 'received a message:', event.data);
    };

    channel.onopen = function () {
        channel.send('first text message over RTP data ports');
    };
    channel.onclose = function (e) {
        console.error(e);
    };
    channel.onerror = function (e) {
        console.error(e);
    };
}

offerer.onicecandidate = function (event) {
    if (!event || !event.candidate) return;
    //answerer && answerer.addIceCandidate(event.candidate);
};

var mediaConstraints = {
    optional: [],
    mandatory: {
        OfferToReceiveAudio: true, // Hehe
        OfferToReceiveVideo: true // Hehe
    }
};

offerer.createOffer( function (sessionDescription) { 
	rtcSessionDescription = sessionDescription;
	offerer.setLocalDescription(sessionDescription); 
	socket.emit('init', sessionDescription); 
}, null, mediaConstraints);



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
		ice: rtcSessionDescription
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
		ice: rtcSessionDescription
	};
	socket.emit('joinroom', user);
}

function leaveRoom(roomid) {
	socket.emit('leaveroom');
}

function getLocalStream() {
	var constraints = {video: true};
	getUserMedia(constraints, handleUserMedia, handleUserMediaError);
}

function handleUserMedia(stream) {
	console.log('handleUserMedia');
	//localVideo.src = window.URL.createObjectURL(stream);
	//localStream = stream;
	//sendMessage('got user media');
    offerer.addStream(stream);
}
	

function handleUserMediaError(error) {
	console.log('handleUserMediaError');
}

function initClient() {
	//addUser();
	getRooms();
	getLocalStream();
}

function sendMessage() {
	console.log('sendMessage');
	var text = document.getElementById('messageInput').value || 'nothing';
	socket.emit('textmessage', text);
}

function call(userid) {
	socket.emit('call', userid);
}

function answer() {
	offerer.createOffer(setLocalAndSendMessage, handleCreateOfferError);
}

function setLocalAndSendMessage(sessionDescription) {
  // Set Opus as the preferred codec in SDP if Opus is present.
  offerer.setLocalDescription(sessionDescription);
  console.log('setLocalAndSendMessage sending message' , sessionDescription);
  //sendMessage(sessionDescription);
}

function handleCreateOfferError(event){
  console.log('createOffer() error: ', e);
}

/////////////////////////////

socket.on('open', function() {


	initClient();
	
	

	
	console.log('服务器连接成功');

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
	socket.on('removeuser', function() {
		
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
	socket.on('closeroom', function() {
		
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
	
	socket.on('call', function(sdp) {
		console.log('call');
		offerer.setRemoteDescription(sdp);
		
		
		/*new RTCSessionDescription(offer), function() {
		offerer.createAnswer(function(answer) {
		  offerer.setLocalDescription(new RTCSessionDescription(answer), function() {
			// send the answer to a server to be forwarded back to the caller (you)
		  }, null);
		}, null);
	  }, null);
	  */
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





