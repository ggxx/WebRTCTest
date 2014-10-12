//引入程序包
var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io').listen(server);
io.set('log level', 1); 
server.listen(1986);

app.use(express.logger('dev'));
app.use(express.cookieParser());
app.use(express.methodOverride());
app.use(app.router);
app.use(express.static(__dirname + '/pages'));
//app.use('/pages', express.static(__dirname + '/pages'));
//app.use('/user', express.static(__dirname + '/pages'));

//app.get('/user/:userid', function (req, res, next) {
//	res.sendfile('pages/p2p.html');
//});

var rooms = []; //roomid, roomname, roomtype 房间
var users = []; //userid, username, roomid, ice 进入房间的用户

function getRoomIndex(roomid) {
	for (var i = 0; i < rooms.length; i++) {
		if (rooms[i].roomid == roomid) {
			return i;
		}
	}
	return -1;
}

function getUserIndex(userid) {
	log('getUserIndex id='+userid);
	for (var i = 0; i < users.length; i++) {
		log('userid[i]='+users[i].userid);
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
	
	socket.on('init', function(sessionDescription) {
		client.sessionDescription = sessionDescription;
	});
	
	socket.on('call', function(sessionDescription) {
		socket.emit('call', users[getUserIndex(client.userid)].ice);
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
		log('rooms push ' + message.room.roomid);
		log('users push ' + message.user.userid + ',' + message.user.roomid);
		
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
		log('users push ' + user.userid);
		
		// 加入room
		socket.join(user.roomid);
		
		socket.emit('joinroom', true); // 反馈房间进入成功
		io.sockets.in(user.roomid).emit('joinroom', user.username);
		io.sockets.in(user.roomid).emit('users', getUsersInRoom(user.roomid)); // 通知房间内用户有人加入
	});
	
	// 关闭room
	socket.on('closeroom', function (room) {
		
		// 维护全局变量
		var index = getRoomIndex(room.roomid);
		if (index >= 0) {
			rooms.splice(index, 1);
			//socket.emit('closeroom', true);
			io.sockets.emit('rooms', rooms); // 通知所有client，room有变化
			return;
		}
		
		//socket.emit('closeroom', false);
	});
	
	// 离开room
	socket.on('leaveroom', function () {
		
		if (client.roomid === '') {
			return;
		}
		
		log('leaveroom: ' + client.userid +  ',' + client.roomid);
		
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
		
		log('textmessage');
		
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

//监听全局退出事件
io.sockets.on('disconnect', function () {  
	
});



function getTime() {
	var date = new Date();
	return date.getHours() + ":" + date.getMinutes() + ":" + date.getSeconds();
}

function customColor() { 
	var colors = ['AliceBlue', 'AntiqueWhite', 'Aqua', 'AquaMarine', 'Pink', 'Red', 'Green', 'Orange', 'Blue', 'BlueViolet', 'Brown', 'Burlywood', 'CadetBlue'];
	return colors[Math.round(Math.random() * 10000 % colors.length)];
}