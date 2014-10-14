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
	
	// 服务器返回创建room结果
	socket.on('createroom', function(result) {
		if (result !== true) {
			alert('创建房间错误：' + result);
		}
	});
	
	socket.on('joinroom', function(user) {
		if (result === true) {
			window.navigate('/room/' + user.roomid);
		}
		else {
			alert('进入房间错误：' + result);
		}
	});
	
});

function getRooms() {
	console.log('getRooms');
	socket.emit('rooms');
}

function createRoom() {
	var roomid = guid();
	var room = {
		roomid: roomid,
		roomname: document.getElementById('roomNameInput').value || 'NoNameRoom',
		roomtype: ''
	};
	var user = {
		userid: USER_ID,
		username: document.getElementById('userNameInput').value || 'NoNameUser',
		roomid: roomid,
		ice: {}
	};
	var message = {
		room: room,
		user: user
	};
	socket.emit('createroom', message);
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

function refreshRoomListDOM(rooms) {
	var list = document.getElementById('roomlist');
	list.innerHTML = '';
	for (var i = 0; i < rooms.length; i++) {
		var li = document.createElement('li');
		li.innerHTML = '<a href="javascript:joinRoom(\'' + rooms[i].roomid + '\');">' + rooms[i].roomname + '</a>';
		list.appendChild(li);
	}
}
