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
app.get('/room/:roomid', function (req, res, next) {
	req.session.test = req.params.roomid;
	log(req.session.test);
	res.sendfile(__dirname + '/public/room.html');
});

var rooms = []; //房间
var users = []; //进入房间的用户

function getRoomIndex(roomid) {
	for (var i = 0; i < rooms.length; i++) {
		if (rooms[i].roomid == roomid) {
			return i;
		}
	}
	return -1;
}

function getUserIndex(userid) {
	for (var i = 0; i < users.length; i++) {
		if (users[i].userid === userid) {
			return i;
		}
	}
	return -1;
}

function getUserRoomId(userid) {
	for (var i = 0; i < users.length; i++) {
		if (users[i].userid === userid) {
			return users[i].roomid;
		}
	}
	return '';
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
	
	// 初始化房间
	socket.emit('init', function(userid) {
		
	});
	
	// 传递SDP
	socket.on('candidate', function(event) {
		socket.broadcast.emit('candidate', event);
	});
	
	// 应答P2P连接
	socket.on('answer', function(sdp) {
		socket.broadcast.emit('answer', sdp);
	});
	
	// 发起P2P连接
	socket.on('offer', function(sdp) {
		socket.broadcast.emit('offer', sdp);
	});
	
	// 获取所有room
	socket.on('rooms', function () {
		socket.emit('rooms', rooms);
	});
	
	// 获取room内所有user
	socket.on('users', function (roomid) {
		socket.emit('users', getUsersInRoom(roomid));
	});
	
	// 创建room
	socket.on('createroom', function (message) {
	
		if (client.roomid !== '') {
			socket.emit('createroom', false); // 反馈房间创建失败
			return;
		}
	
		// 初始化client
		client.userid = message.user.userid;
		client.username = message.user.username;
		client.roomid = message.room.roomid;
		
		// 维护全局变量
		rooms.push(message.room);
		users.push(message.user);
		
		// 加入room
		socket.join(message.room.roomid);
		
		socket.emit('createroom', true); // 反馈房间创建成功
		io.sockets.emit('rooms', rooms); // 通知所有client，有新房间
	});
	
	// 有用户进入房间
	socket.on('joinroom', function (user) {
	
		if (client.roomid !== '') {
			socket.emit('joinroom', false); // 反馈进入房间失败
			return;
		}
	
		//初始化client
		client.userid = user.userid;
		client.username = user.username;
		client.roomid = user.roomid;
		
		// 维护全局变量
		users.push(user);
		
		// 加入room
		socket.join(user.roomid);
		
		socket.emit('joinroom', true); // 反馈房间进入成功
		io.sockets.in(user.roomid).emit('joinroom', user.username);
		io.sockets.in(user.roomid).emit('users', getUsersInRoom(user.roomid)); // 通知房间内用户有人加入
	});
	
	// 离开room
	socket.on('leaveroom', function () {
		
		if (client.roomid === '') {
			return;
		}
		
		var val = false;
		
		// 离开room
		socket.leave(client.roomid);
		
		var index = getUserIndex(client.userid);
		if (index >= 0) {
			users.splice(index, 1);
			val = true;
			var curUsers = getUsersInRoom(client.roomid);
			if (curUsers.length > 0) {
				log('leaveroom: 房间里还有其它人');
				// 房间里还有人
				io.sockets.in(client.roomid).emit('users', curUsers); // 通知房间内的用户人数有变化
			}
			else {
				// 房间里无人，关闭房间
				log('leaveroom: 房间里无人，关闭房间');
				var rIndex = getRoomIndex(client.roomid);
				if (rIndex >= 0) {
					rooms.splice(rIndex, 1);
					io.sockets.emit('rooms', rooms); // 通知所有client，room有变化
				}
			}
		}

		// 重置client
		client.userid = '';
		client.username = '';
		client.roomid = '';
		
		socket.emit('leaveroom', val);
	});
	
	// 收到文字消息
	socket.on('textmessage', function(text) {
		
		if (client.roomid === '') {
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
	
	// 监听出退事件
	socket.on('disconnect', function () {  
		
		if (client.roomid === '') {
			return;
		}

		var val = false;
		
		// 离开room
		socket.leave(client.roomid);
		
		var index = getUserIndex(client.userid);
		if (index >= 0) {
			users.splice(index, 1);
			val = true;
			var curUsers = getUsersInRoom(client.roomid);
			if (curUsers.length > 0) {
				log('leaveroom: 房间里还有其它人');
				// 房间里还有人
				io.sockets.in(client.roomid).emit('users', curUsers); // 通知房间内的用户人数有变化
			}
			else {
				// 房间里无人，关闭房间
				log('leaveroom: 房间里无人，关闭房间');
				var rIndex = getRoomIndex(client.roomid);
				if (rIndex >= 0) {
					rooms.splice(rIndex, 1);
					io.sockets.emit('rooms', rooms); // 通知所有client，room有变化
				}
			}
		}
		
		// 广播用户已退出
		//socket.broadcast.emit('system', obj);
		//console.log(client.name + 'Disconnect');
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