'use strict';

//引入程序包
var express = require('express');
var app = express();
var fs = require('fs');

var options = {
	key: fs.readFileSync('keys/agent-test-key.pem'),
	cert: fs.readFileSync('keys/agent-test-cert.pem')
};

//var server = require('http').createServer(app);
var sserver = require('https').createServer(options, app);
var io = require('socket.io').listen(sserver);
io.set('log level', 1); 
//server.listen(1986);
sserver.listen(1987);

app.use(express.logger('dev'));
app.use(express.methodOverride());
app.use(app.router);
app.use('/', express.static(__dirname + '/public'));

var rooms = []; //房间
var users = []; //进入房间的用户

function removeRoom(roomid) {
	var index = getRoomIndex(roomid);
	if (index >= 0) {
		rooms.splice(index, 1);
	}
}

function getRoom(roomid) {
	var index = getRoomIndex(roomid);
	if (index >= 0) {
		return rooms[index];
	}
	return { };
}

function getRoomIndex(roomid) {
	for (var i = 0; i < rooms.length; i++) {
		if (rooms[i].roomid == roomid) {
			return i;
		}
	}
	return -1;
}

function removeUser(userid) {
	var index = getUserIndex(userid);
	if (index >= 0) {
		users.splice(index, 1);
	}
}

function getUser(userid) {
	var index = getUserIndex(userid);
	if (index >= 0) {
		return users[index];
	}
	return { };
}

function getUserIndex(userid) {
	for (var i = 0; i < users.length; i++) {
		if (users[i].userid === userid) {
			return i;
		}
	}
	return -1;
}

function getUsersInRoom(roomid) {
	if (roomid) {
		var tmpUsers = [];
		for (var i = 0; i < users.length; i++) {
			if (users[i].roomid === roomid) {
				tmpUsers.push(users[i]);
			}
		}
		return tmpUsers;
	}
	return users;
}

function log(message) {
	console.log(">>> " + message);
}


io.sockets.on('connection', function (socket) {

	// 构造客户端对象
	var client = {
		userid: '',
		username: '',
		roomid: '',
		color: customColor(),
		sessionDescription: {}
	};

	log('on connection');
	
	socket.emit('open');
	
	
	///-----------------P2P--------------------
	
	// 绑定userid与socket
	socket.on('bind', function(userid) {
		log('bind ' + userid);
		
		// 绑定
		socket.name = userid;
		
		// 遍历找到该用户并回复之
		io.sockets.clients().forEach(function (socketClient) {
			if (socketClient.name === userid) {
				socketClient.emit('bind', true);
			}
		});
	});
	
	// 请求共享
	socket.on('call', function(message) {
		log('call userid' + message.userid + ', type is ' + message.streamtype);
		
		// 遍历找到该用户并回复之
		io.sockets.clients().forEach(function (socketClient) {
			if (socketClient.name === message.userid) {
				socketClient.emit('call', { streamtype: message.streamtype, userid: client.userid } );
			}
		});
	});
	
	// 传递SDP
	// message.event  => candidate event
	// message.userid => to whom
	socket.on('candidate', function(message) {
		log('candidate from ' + message.userid + ' to ' + client.userid);
		io.sockets.clients().forEach(function (socketClient) {
			if (socketClient.name === message.userid) {
				socketClient.emit('candidate', { candidate: message.candidate, userid: client.userid } );
			}
		});
	});
	
	// 应答P2P连接
	// message.sdp    => sdp
	// message.userid => to whom
	socket.on('answer', function(message) {
		log('answer from ' + message.userid + ' to ' + client.userid);
		io.sockets.clients().forEach(function (socketClient) {
			if (socketClient.name === message.userid) {
				socketClient.emit('answer', { sdp: message.sdp, userid: client.userid } );
			}
		});
	});
	
	// 发起P2P连接
	// message.sdp    => sdp
	// message.userid => to whom
	socket.on('offer', function(message) {
		log('offer from ' + message.userid + ' to ' + client.userid);
		io.sockets.clients().forEach(function (socketClient) {
			if (socketClient.name === message.userid) {
				socketClient.emit('offer', { sdp: message.sdp, userid: client.userid } );
			}
		});
	});
	
	
	///--------------维护room与user-----------------
	
	// 获取所有room
	socket.on('rooms', function () {
		socket.emit('rooms', rooms);
	});
	
	// 获取room内所有user
	socket.on('users', function (roomid) {
		socket.emit('users', getUsersInRoom(roomid));
	});
	
	// 创建room
	socket.on('createroom', function (room) {
	
		//log('client.roomid:' + client.roomid);
		//log('room.roomid:' + room.roomid);
		
		if (client.userid !== '') {
			var rMessage = {
				result: false,
				text: '请先从其它房间中退出',
				room: room
			};
			socket.emit('createroom', rMessage); // 反馈进入房间失败
			return;
		}
		
		rooms.push(room);
		
		var rMessage = {
			result: true,
			text: '',
			room: room
		};
		socket.emit('createroom', rMessage); // 反馈房间创建成功
		
		io.sockets.emit('rooms', rooms); // 通知所有client，有新房间
	});
	
	// 有用户进入房间
	socket.on('joinroom', function (user) {
	
		//log('client.roomid:' + client.roomid);
		//log('user.roomid:' + user.roomid);
	
		if (client.userid !== '' && client.roomid !== '' && client.roomid !== user.roomid) {
			var rMessage = {
				result: false,
				text: '请先从其它房间中退出',
				room: { }
			};
			socket.emit('joinroom', rMessage); // 反馈进入房间失败
			return;
		}
		else if (client.userid !== '' && client.roomid !== '' && client.roomid === user.roomid) {
			var rMessage = {
				result: false,
				text: '已进入该房间',
				room: { }
			};
			socket.emit('joinroom', rMessage); // 反馈进入房间失败
			return;
		}
	
		//初始化client
		client.userid = user.userid;
		client.username = user.username;
		client.roomid = user.roomid;
		
		// 维护全局变量
		users.push(user);
		
		// 将client加入room
		socket.join(user.roomid);
		
		var rMessage = {
			result: true,
			text: '',
			room: getRoom(user.roomid)
		};
		socket.emit('joinroom', rMessage); // 反馈房间进入成功
		
		io.sockets.in(user.roomid).emit('users', getUsersInRoom(user.roomid)); // 通知房间内所有用户有新人供吊打
	});
	
	// 离开room
	socket.on('leaveroom', function () {
		
		if (client.userid === '') {
			var rMessage = {
				result: false,
				text: '未进入任何房间',
				closed: false
			};
			socket.emit('leaveroom', rMessage); // 反馈离开房间失败
			return;
		}
		
		// 将client从room中退出
		socket.leave(client.roomid);
		
		// 维护全局变量
		removeUser(client.userid);
		
		var closed;
		var curUsers = getUsersInRoom(client.roomid);
		if (curUsers.length > 0) {
			// 房间里还有人
			io.sockets.in(client.roomid).emit('users', curUsers); // 通知房间内的用户人数有变化
			closed = false;
		}
		else {
			// 房间里无人，关闭房间
			removeRoom(client.roomid);
			io.sockets.emit('rooms', rooms); // 通知所有client，room有变化
			closed = true;
		}
		
		// 重置client
		client.userid = '';
		client.username = '';
		client.roomid = '';
		
		var rMessage = {
			result: true,
			text: '',
			closed: closed
		};
		socket.emit('leaveroom', rMessage); // 反馈离开房间成功
	});
	
	// 监听出退事件
	socket.on('disconnect', function () {  
		
		// 将client从room中退出
		socket.leave(client.roomid);
		
		// 维护全局变量
		removeUser(client.userid);
		
		var curUsers = getUsersInRoom(client.roomid);
		if (curUsers.length > 0) {
			// 房间里还有人
			io.sockets.in(client.roomid).emit('users', curUsers); // 通知房间内的用户人数有变化
		}
		else {
			// 房间里无人，关闭房间
			removeRoom(client.roomid);
			io.sockets.emit('rooms', rooms); // 通知所有client，room有变化
		}
		
		// 重置client
		client.userid = '';
		client.username = '';
		client.roomid = '';
		
		var rMessage = {
			result: true,
			text: ''
		};
		socket.emit('leaveroom', rMessage);
	});
	
	// 收到文字消息
	socket.on('textmessage', function(text) {
		
		if (client.userid === '') {
			return;
		}
		
		var message = {
			time: getTime(),
			from: client.username,
			text: text,
			color: client.color
		};
		io.sockets.in(client.roomid).emit('textmessage', message);
	});

});

function getTime() {
	var date = new Date();
	return date.getHours() + ":" + date.getMinutes() + ":" + date.getSeconds();
}

function customColor() { 
	var colors = ['AliceBlue', 'AntiqueWhite', 'Aqua', 'AquaMarine', 'Pink', 'Red', 'Green', 'Orange', 'Blue', 'BlueViolet', 'Brown', 'Burlywood', 'CadetBlue'];
	return colors[Math.round(Math.random() * 0x10000 % colors.length)];
}