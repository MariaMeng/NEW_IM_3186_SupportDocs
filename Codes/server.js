var express = require('express');//调用了express模块
var app = express();
var server = require('http').createServer(app);//调用了http模块，
var SkyRTC = require('skyrtc').listen(server);//调用了skyrtc模块
var path = require("path");

var port = process.env.PORT || 3000;//设置端口号
server.listen(port);//监听3000端口，listen函数创建了事件监听器(EventListener)

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'view')));


/*
app.get('/', function(req, res) {
	res.sendfile(__dirname + '/index.html');
});
*/

SkyRTC.rtc.on('new_connect', function(socket) {
	console.log('Create new conection ');
});

SkyRTC.rtc.on('remove_peer', function(socketId) {
	console.log(socketId + " User leaves ");
});

SkyRTC.rtc.on('new_peer', function(socket, room) {
	console.log("New User " + socket.id + " joins " + room);
});

SkyRTC.rtc.on('socket_message', function(socket, msg) {
	console.log("Receive new message from " + socket.id + " : " + msg);
});

SkyRTC.rtc.on('ice_candidate', function(socket, ice_candidate) {
	console.log("Receive ICE Candidate from " + socket.id);
});

SkyRTC.rtc.on('offer', function(socket, offer) {
	console.log("Receive Offer from " + socket.id);
});

SkyRTC.rtc.on('answer', function(socket, answer) {
	console.log("Receive Answer from " + socket.id);
});

SkyRTC.rtc.on('error', function(error) {
	console.log("Error: " + error.message);
});