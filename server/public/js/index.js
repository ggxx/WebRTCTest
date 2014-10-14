'use strict';

var USER_ID = getUserId();

var socket = io.connect('https://localhost');

var createRoomButton = document.getElementById('createRoomButton');
createRoomButton.onclick = createRoom;

socket.on('open', function() {

	console.log('服务器连接成功');

	getRooms();
	
	// 服务器返回房间列表
	socket.on('rooms', function(rooms) {		
		// 更新房间列表
		refreshRoomListDOM(rooms);
	});
	
	socket.on('joinroom', function() {
		
	});
	
});

function getRooms() {
	console.log('getRooms');
	socket.emit('rooms');
}

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

function joinRoom(roomid) {
	
}

function refreshRoomListDOM(rooms) {
	var list = document.getElementById('roomlist');
	list.innerHTML = '';
	for (var i = 0; i < rooms.length; i++) {
		var li = document.createElement('li');
		li.innerHTML = '<a href="javascript:joinRoom(\'' + rooms[i].roomid + '\');">' + rooms[i].roomname + '</a>';
		list.appendChild(li);
	}
}