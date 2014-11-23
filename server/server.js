'use strict';

//引入程序包
var express = require('express');
var app = express();
var fs = require('fs');
var process = require('child_process');

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
var MAX_PERSONS_NUM_IN_ROOM = 2; //房间内最大用户数

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
		sessionDescription: {},
		cameraSharing: false,
		microphoneSharing: false,
		screenSharing: false
	};

	log('on connection');
	
	socket.emit('open');
	
	
	///-----------------P2P--------------------
	
	// 绑定userid与socket.name
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
	// message.from
	// message.to
	// message.streamtype => 1.cam & mic; 2.screen; 3.screen & cam & mic
	socket.on('call', function(message) {
		log('receive call message from ' + message.from + ' to ' + message.to);
		// 遍历找到该用户并回复之
		io.sockets.clients().forEach(function (socketClient) {
			if (socketClient.name === message.to) {
				socketClient.emit('call', { streamtype: message.streamtype, from: client.userid, to: message.from } );
			}
		});
	});
	
	// 将candidate告知对方
	// message.from => from whom
	// message.to   => to whom
	// candidate
	// streamtype
	// tag => true:offer; false:answer
	socket.on('candidate', function(message) {
		log('receive candidate message from ' + message.from + ' to ' + message.to);
		io.sockets.clients().forEach(function (socketClient) {
			if (socketClient.name === message.to) {
				socketClient.emit('candidate', message);
			}
		});
	});
	
	// 应答P2P连接
	// message.sdp    => sdp
	// message.from => to whom
	// message.to
	// message.streamtype
	socket.on('answer', function(message) {
		log('receive answer message from ' + message.from + ' to ' + message.to);
		io.sockets.clients().forEach(function (socketClient) {
			if (socketClient.name === message.to) {
				socketClient.emit('answer', message);
			}
		});
	});
	
	// 公布P2P连接
	// message.sdp    => sdp
	// message.from => to whom
	// message.to
	// message.streamtype
	socket.on('offer', function(message) {
		log('receive offer message from ' + message.from + ' to ' + message.to);
		io.sockets.clients().forEach(function (socketClient) {
			if (socketClient.name === message.to) {
				socketClient.emit('offer', message);
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
	socket.on('joinroom', function (message) {
	
		//log('client.roomid:' + client.roomid);
		//log('user.roomid:' + user.roomid);
	
		if (client.userid !== '' && client.roomid !== '' && client.roomid !== message.roomid) {
			var rMessage = {
				result: false,
				text: '请先从其它房间中退出',
				room: { }
			};
			socket.emit('joinroom', rMessage); // 反馈进入房间失败
			return;
		}
		else if (client.userid !== '' && client.roomid !== '' && client.roomid === message.roomid) {
			var rMessage = {
				result: false,
				text: '已进入该房间',
				room: { }
			};
			socket.emit('joinroom', rMessage); // 反馈进入房间失败
			return;
		}
		
		if (getUsersInRoom(message.roomid).length >= MAX_PERSONS_NUM_IN_ROOM) {
			var rMessage = {
				result: false,
				text: '房间已达最大用户数',
				room: { }
			};
			socket.emit('joinroom', rMessage); // 反馈进入房间失败
			return;
		}
	
		//初始化client
		client.userid = message.userid;
		client.username = message.username;
		client.roomid = message.roomid;
		
		// 维护全局变量
		users.push(client);
		
		// 将client加入room
		socket.join(message.roomid);
		
		var rMessage = {
			result: true,
			text: '',
			room: getRoom(message.roomid)
		};
		socket.emit('joinroom', rMessage); // 反馈房间进入成功
		
		io.sockets.in(message.roomid).emit('users', getUsersInRoom(message.roomid)); // 通知房间内所有用户有新人供吊打
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
		client.cameraSharing = false;
		client.microphoneSharing = false;
		client.screenSharing = false;
		
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
		client.cameraSharing = false;
		client.microphoneSharing = false;
		client.screenSharing = false;
		
		var rMessage = {
			result: true,
			text: ''
		};
		socket.emit('leaveroom', rMessage);
	});
	
	// 收到文字消息
	socket.on('textmessage', function(text) {
		
		if (client.userid === '' || client.roomid === '') {
			var rMessage = {
				result: false,
				time: getTime(),
				from: '',
				text: '未进入任何房间'
			};
			socket.emit('textmessage', rMessage);
			return;
		}
		
		var rMessage = {
			result: true,
			time: getTime(),
			from: client.username,
			text: text,
			color: client.color
		};
		io.sockets.in(client.roomid).emit('textmessage', rMessage); // 房间内群发
	});

	// 设备共享状态更新
	// userid => 
	// cameraSharing => true, false
	// microphoneSharing => true, false
	socket.on('sharecam', function(message) {
		client.cameraSharing = message.cameraSharing;
		client.microphoneSharing = message.microphoneSharing;
		var rMessage = {
			cameraSharing:  message.cameraSharing,
			microphoneSharing: message.microphoneSharing,
			userid: message.userid,
			username: getUser(message.userid).username
		};
		io.sockets.in(client.roomid).emit('sharecam', rMessage); // 房间内群发
	});
	
	// 设备共享状态更新
	// userid =>
	// screenSharing => true, false
	socket.on('sharescreen', function(message) {
		client.screenSharing = message.screenSharing;
		var rMessage = {
			screenSharing: message.screenSharing,
			userid: message.userid,
			username: getUser(message.userid).username
		};
		io.sockets.in(client.roomid).emit('sharescreen', rMessage); // 房间内群发
	});
	
});

function testPing(address) {
	process.exec('ping ' + address, function (error, stdout, stderr) {
		log(stdout.toString());
		if (error !== null) {
			log('exec error: ' + error);
		}
	});
}

function pullDocker(port) {
	process.exec('sudo docker pull fedora/ssh', function (error, stdout, stderr) {
		log(stdout.toString());
		if (error !== null) {
			log('exec error: ' + error);
		}
	});
}

function runDocker(port) {
	process.exec('sudo docker run -d -p ' + port + ':22 fedora/ssh', function (error, stdout, stderr) {
		log(stdout.toString());
		if (error !== null) {
			log('exec error: ' + error);
		}
	});
}

function getTime() {
	var date = new Date();
	return date.toLocaleTimeString();
	//return date.getHours() + ":" + date.getMinutes() + ":" + date.getSeconds();
}

function customColor() { 
	var colors = ['#F5A9A9', '#F5BCA9', '#F5D0A9', '#F3E2A9', '#F2F5A9', '#E1F5A9', '#D0F5A9', '#BCF5A9', '#A9F5A9', 
		'#A9F5D0', '#A9F5E1', '#A9F5F2', '#A9E2F3', '#A9D0F5', '#A9BCF5', '#A9A9F5', '#BCA9F5', '#D0A9F5', '#E2A9F3', 
		'#F5A9F2', '#F5A9E1', '#F5A9D0', '#F5A9BC', '#E6E6E6'];
	return colors[Math.round(Math.random() * 0x10000 % colors.length)];
}
