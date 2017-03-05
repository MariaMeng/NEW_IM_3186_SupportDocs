var SkyRTC = function() {
    var PeerConnection = (window.PeerConnection || window.webkitPeerConnection00 || window.webkitRTCPeerConnection || window.mozRTCPeerConnection);
    var URL = (window.URL || window.webkitURL || window.msURL || window.oURL);
    var getUserMedia = (navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia);
    var nativeRTCIceCandidate = (window.mozRTCIceCandidate || window.RTCIceCandidate);
    var nativeRTCSessionDescription = (window.mozRTCSessionDescription || window.RTCSessionDescription); // order is very important: "RTCSessionDescription" defined in Nighly but useless
    var moz = !! navigator.mozGetUserMedia;
    var iceServer = { //创建了RTCconfiguration，为了RTCPeerConnection创建时候作为参数使用
        "iceServers": [{
            "url": "stun:stun.l.google.com:19302"
        }]
    };
    var packetSize = 1000;
	
	
	
	var instantMeter = document.querySelector('#instant meter');
	var slowMeter = document.querySelector('#slow meter');
	var clipMeter = document.querySelector('#clip meter');

	var instantValueDisplay = document.querySelector('#instant .value');
	var slowValueDisplay = document.querySelector('#slow .value');
	var clipValueDisplay = document.querySelector('#clip .value');
	
	try {
		window.AudioContext = window.AudioContext || window.webkitAudioContext;
		window.audioContext = new AudioContext();
	} catch (e) {
		alert('Web Audio API not supported.');
	}
	
	
	
	
	

    /**********************************************************/
    /*                                                        */
    /*                       事件处理器                       */
    /*                                                        */
    /**********************************************************/
    function EventEmitter() {//对象方法，这个函数应该在Node.js中有
        this.events = {};
    }
    //绑定事件函数
    EventEmitter.prototype.on = function(eventName, callback) {
        this.events[eventName] = this.events[eventName] || [];
        this.events[eventName].push(callback);
    };
    //触发事件函数
    EventEmitter.prototype.emit = function(eventName, _) {
        var events = this.events[eventName],
            args = Array.prototype.slice.call(arguments, 1),
            i, m;

        if (!events) {
            return;
        }
        for (i = 0, m = events.length; i < m; i++) {
            events[i].apply(null, args);
        }
    };

	
	/**********************************************************/
    /*                                                        */
    /*                    声音音量检测大小                    */
    /*                                                        */
    /**********************************************************/	
	function SoundMeter(context) {
		this.context = context;
		this.instant = 0.0;
		this.slow = 0.0;
		this.clip = 0.0;
		this.script = context.createScriptProcessor(2048, 1, 1);
		var that = this;
		
		this.script.onaudioprocess = function(event) {
			var input = event.inputBuffer.getChannelData(0);
			var i;
			var sum = 0.0;
			var clipcount = 0;
			for (i = 0; i < input.length; ++i) {
				sum += input[i] * input[i];
				if (Math.abs(input[i]) > 0.99) {
					clipcount += 1;
				}
			}
			that.instant = Math.sqrt(sum / input.length);
			that.slow = 0.95 * that.slow + 0.05 * that.instant;
			that.clip = clipcount / input.length;
		};
	}
	
	//添加声音源节点
	SoundMeter.prototype.connectToSource = function(stream) {
		console.log('SoundMeter connecting');
		this.mic = this.context.createMediaStreamSource(stream);
		this.mic.connect(this.script);
		// necessary to make sample run, but should not be.
		this.script.connect(this.context.destination);
	};

	//关闭源节点
	SoundMeter.prototype.stop = function() {
		this.mic.disconnect();
		this.script.disconnect();
	};
	
	
	
	
	
	

    /**********************************************************/
    /*                                                        */
    /*                   流及信道建立部分                     */
    /*                                                        */
    /**********************************************************/


    /*******************基础部分*********************/
    function skyrtc() {
        //本地media stream
        this.localMediaStream = null;
		//本地音频流
		this.localAudioStream = null;
		//本地视频流
		this.localVideoStreeam = null;
		
        //所在房间
        this.room = "";
        //接收文件时用于暂存接收文件
        this.fileData = {};
        //本地WebSocket连接
        this.socket = null;
        //本地socket的id，由后台服务器创建
        this.me = null;
        //保存所有与本地相连的peer connection， 键为socket id，值为PeerConnection类型
        this.peerConnections = {};
        //保存所有与本地连接的socket的id
        this.connections = [];
        //初始时需要构建链接的数目
        this.numStreams = 0;
        //初始时已经连接的数目
        this.initializedStreams = 0;
        //保存所有的data channel，键为socket id，值通过PeerConnection实例的createChannel创建
        this.dataChannels = {};
        //保存所有发文件的data channel及其发文件状态
        this.fileChannels = {};
        //保存所有接受到的文件
        this.receiveFiles = {};
    }
    //继承自事件处理器，提供绑定事件和触发事件的功能，skyrtc拥有了EventEmitter类中EventEmitter.prototype.on函数和EventEmitter.prototype.emit函数
    skyrtc.prototype = new EventEmitter();//skyrtc.prototype为EventEmitter()中的一个实例,详见Node.js中EventEmitter()函数


    /*************************服务器连接部分***************************/


    //本地连接信道，信道为websocket
    skyrtc.prototype.connect = function(server, room) { //原型方法
        var socket,
            that = this;
        room = room || "";
        socket = this.socket = new WebSocket(server); //创建了一个WebSocket对象，参数是需要连接的server地址。
        
		socket.onopen = function() {//当Browser和WebSocketServer连接成功后，会触发onopen消息
            socket.send(JSON.stringify({ //将JavaScript中的对象或数组转换成字符串，然后发送
                "eventName": "__join",
                "data": {
                    "room": room
                }
            }));
            that.emit("socket_opened", socket);
        };

        socket.onmessage = function(message) {//当Browser接收到WebSocketServer发送过来的数据时，就会触发onmessage消息，参数message中包含server传输过来的数据
            var json = JSON.parse(message.data);//将 JavaScript 对象表示法 (JSON) 字符串转换为对象。 message.data为字符串
            if (json.eventName) {
                that.emit(json.eventName, json.data);
            } else {
                that.emit("socket_receive_message", socket, json);
            }
        };

        socket.onerror = function(error) {//如果连接失败，发送、接收数据失败或者处理数据出现错误，browser会触发onerror消息
            that.emit("socket_error", error, socket);
        };

        socket.onclose = function(data) {//当Browser接收到WebSocketServer端发送的关闭连接请求时，就会触发onclose消息
            that.localMediaStream.close();
            var pcs = that.peerConnections;
            for (i = pcs.length; i--;) {
                that.closePeerConnection(pcs[i]);//调用点对点连接中skyrtc.prototype.closePeerConnection函数
            }
            that.peerConnections = [];//所有与本地相连的peer connection清空
            that.dataChannels = {};
            that.fileChannels = {};
            that.connections = [];
            tjat.fileData = {};
            that.emit('socket_closed', socket);
        };

        this.on('_peers', function(data) {  //调用on函数（事件处理器中绑定事件函数），将_peers事件绑定到this（skyrtc）对象上将_peers事件绑定到this（skyrtc）对象上,如果有事件发生，就执行处理函数
            //获取所有服务器上的socket的id
            that.connections = data.connections;
            that.me = data.you;//me变量为本地socket的id，由后台服务器创建
            that.emit("get_peers", that.connections);
        });

        this.on("_ice_candidate", function(data) {//如果有新的ICE Candidate加入
            var candidate = new nativeRTCIceCandidate(data);
            var pc = that.peerConnections[data.socketId];//peerConnections为所有与本地相连的peer connection，键为socket id
            pc.addIceCandidate(candidate);
            that.emit('get_ice_candidate', candidate);
        });

        this.on('_new_peer', function(data) { //有新的peer添加时
            that.connections.push(data.socketId);//添加新的socket id
            var pc = that.createPeerConnection(data.socketId),  //创建单个PeerConnection，调用点对点连接中的skyrtc.prototype.createPeerConnection函数
                i, m;
            pc.addStream(that.localMediaStream); //Add a new stream to the RTCPeerConnection
            that.emit('new_peer', data.socketId);
        });

        this.on('_remove_peer', function(data) { //有peer要离开
            var sendId;
            that.closePeerConnection(that.peerConnections[data.socketId]); //调用下方点对点连接中的skyrtc.prototype.closePeerConnection函数
            delete that.peerConnections[data.socketId];
            delete that.dataChannels[data.socketId];
            for (sendId in that.fileChannels[data.socketId]) {
                that.emit("send_file_error", new Error("Connection has been closed"), data.socketId, sendId, that.fileChannels[data.socketId][sendId].file);
            }
            delete that.fileChannels[data.socketId];
            that.emit("remove_peer", data.socketId);
        });

        this.on('_offer', function(data) { //如果Callee收到了Caller发送的offer
            that.receiveOffer(data.socketId, data.sdp); //调用下方的信令交换部分中skyrtc.prototype.receiveOffer函数
            that.emit("get_offer", data);
        });

        this.on('_answer', function(data) { //如果Caller收到了Callee回复的answer
            that.receiveAnswer(data.socketId, data.sdp);//调用下方的信令交换部分中skyrtc.prototype.receiveAnswer函数
            that.emit('get_answer', data);
        });

        this.on('send_file_error', function(error, socketId, sendId, file) {
            that.cleanSendFile(sendId, socketId);
        });

        this.on('receive_file_error', function(error, sendId) {
            that.cleanReceiveFile(sendId);
        });

        this.on('ready', function() { //如果是ready就绪状态的时候
            that.createPeerConnections();//调用下方的点对点连接中skyrtc.prototype.createPeerConnections函数，创建与其他用户连接的PeerConnections
            that.addStreams();//调用下方的流处理部分中skyrtc.prototype.addStreams函数，将本地流添加到所有的PeerConnection实例中。
            that.addDataChannels();
            that.sendOffers();//调用下方点对点连接中的skyrtc.prototype.sendOffers函数
        });

        this.emit('connected', socket);
    };


    /*************************流处理部分*******************************/


    //创建本地流
    skyrtc.prototype.createStream = function(options) { //这个options变量可以是一个对象，如{"video": true,"audio": true}
        var that = this;

        options.video = !! options.video;
        options.audio = !! options.audio;

        if (getUserMedia) { //如果该浏览器支持WEBRTC
            this.numStreams++;
            getUserMedia.call(navigator, options, function(stream) { //调用了Call函数。让navigator执行GetUserMedia的方法
                    that.localMediaStream = stream;
                    that.initializedStreams++;
                    that.emit("stream_created", stream);
                    if (that.initializedStreams === that.numStreams) {
                        that.emit("ready");
                    }
					/*******************NEW***************************/
					/*
					var soundMeter = window.soundMeter = new SoundMeter(window.audioContext); //生成了soundmeter.js中的SoundMeter Object 
					soundMeter.connectToSource(stream);
					
					setInterval(function() {
						instantMeter.value = instantValueDisplay.innerText =soundMeter.instant.toFixed(2);
						slowMeter.value = slowValueDisplay.innerText =soundMeter.slow.toFixed(2);
						clipMeter.value = clipValueDisplay.innerText =soundMeter.clip;
					}, 200);
					*/
					/******************NEW END***********************/
                },
                 function(error) {
                    that.emit("stream_create_error", error);
                });
        } else { //如果该浏览器不支持WEBRTC
            that.emit("stream_create_error", new Error('WebRTC is not yet supported in this browser.'));
        }
    };
    
    //将本地流添加到所有的PeerConnection实例中
    skyrtc.prototype.addStreams = function() {
        var i, m,
            stream,
            connection;
        for (connection in this.peerConnections) {//peerConnections为保存所有与本地相连的peer connection， 键为socket id，值为PeerConnection类型
            this.peerConnections[connection].addStream(this.localMediaStream); //调用addStream函数，Add a new stream to the RTCPeerConnection,本地媒体流传给远程
        }
    };

    //将流绑定到video标签上用于输出
    skyrtc.prototype.attachStream = function(stream, domId) {//stream为remote stream 
        var element = document.getElementById(domId);
        if (navigator.mozGetUserMedia) {
            element.mozSrcObject = stream;
            element.play();
        } else {
            element.src = webkitURL.createObjectURL(stream);
        }
        element.src = webkitURL.createObjectURL(stream);
    };


    /***********************信令交换部分*******************************/


    //向所有PeerConnection发送Offer类型信令,包括本地的SDP，并且设置了本地的SDP，使用setLocalDescription函数
    skyrtc.prototype.sendOffers = function() {
        var i, m,
            pc,
            that = this,
            pcCreateOfferCbGen = function(pc, socketId) {
                return function(session_desc) {
					
					//for testing
					//console.trace('Output local SDP\n' + session_desc.sdp);
					
                    pc.setLocalDescription(session_desc);
                    that.socket.send(JSON.stringify({
                        "eventName": "__offer",
                        "data": {
                            "sdp": session_desc,
                            "socketId": socketId
                        }
                    }));
                };
            },
            pcCreateOfferErrorCb = function(error) {
                console.log(error);
            };
        for (i = 0, m = this.connections.length; i < m; i++) {
            pc = this.peerConnections[this.connections[i]];
            pc.createOffer(pcCreateOfferCbGen(pc, this.connections[i]), pcCreateOfferErrorCb);
        }
    };

    //接收到Offer类型信令后作为回应返回answer类型信令
    skyrtc.prototype.receiveOffer = function(socketId, sdp) {
        var pc = this.peerConnections[socketId];
        this.sendAnswer(socketId, sdp);
    };

    //发送answer类型信令
    skyrtc.prototype.sendAnswer = function(socketId, sdp) {
        var pc = this.peerConnections[socketId];
        var that = this;
        pc.setRemoteDescription(new nativeRTCSessionDescription(sdp));// The Callee sets the description the Caller sent him as the remote description using setRemoteDescription
        pc.createAnswer(function(session_desc) { //调用了W3C 中，Section 4.3.3 Legacy Interface Extensions中createAnswer (RTCSessionDescriptionCallback successCallback, RTCPeerConnectionErrorCallback failureCallback);函数
            pc.setLocalDescription(session_desc);//Callee sets the remote session description from Caller as its local description , so the local session can be compatible with the Caller.
            that.socket.send(JSON.stringify({//The Callee sends the session description back to Caller.
                "eventName": "__answer",
                "data": {
                    "socketId": socketId,
                    "sdp": session_desc
                }
            }));
        }, function(error) {
            console.log(error);
        });
    };

    //接收到answer类型信令后将对方的session描述写入PeerConnection中
    skyrtc.prototype.receiveAnswer = function(socketId, sdp) { // When the Caller receives the Callee's session description, The Caller sets that as the remote description using setRemoteDescription
        var pc = this.peerConnections[socketId];
        
		var newSDP= new nativeRTCSessionDescription(sdp);
		
		//For Testing
		console.trace('Output Remote SDP\n' + newSDP.sdp);
		
		pc.setRemoteDescription(newSDP);
    };


    /***********************点对点连接部分*****************************/


    //创建与其他用户连接的PeerConnections
    skyrtc.prototype.createPeerConnections = function() {
        var i, m;
        for (i = 0, m = rtc.connections.length; i < m; i++) {
            this.createPeerConnection(this.connections[i]);//调用下方的createPeerConnection函数
        }
    };

    //创建单个PeerConnection
    skyrtc.prototype.createPeerConnection = function(socketId) {
		if(window.confirm("Do you want to connect with "+socketId+"？")){
			var that = this;
			var pc = new PeerConnection(iceServer); //创建一个RTCPeerConnection Object 
			this.peerConnections[socketId] = pc;
			pc.onicecandidate = function(evt) { //send any ice candidates to the other peer 
				if (evt.candidate)
					that.socket.send(JSON.stringify({
						"eventName": "__ice_candidate",
						"data": {
							"label": evt.candidate.sdpMLineIndex,
							"candidate": evt.candidate.candidate,
							"socketId": socketId
						}
					}));
				that.emit("pc_get_ice_candidate", evt.candidate, socketId, pc);
			};

			pc.onopen = function() {
				that.emit("pc_opened", socketId, pc);
			};

			pc.onaddstream = function(evt) { //once remote stream arrives, show it in the remote video element. Onaddstream happens as early as possible after he setRemoteDescription
				that.emit('pc_add_stream', evt.stream, socketId, pc);//evt.stream为remote stream
			};

			pc.ondatachannel = function(evt) {
				that.addDataChannel(socketId, evt.channel);
				that.emit('pc_add_data_channel', evt.channel, socketId, pc);
			};
			return pc;
		}
		
    };

    //关闭PeerConnection连接
    skyrtc.prototype.closePeerConnection = function(pc) {
        if (!pc) return;
        pc.close();
    };
    

    /***********************数据通道连接部分*****************************/

    
    //消息广播
    skyrtc.prototype.broadcast = function(message) {
        var socketId;
        for (socketId in this.dataChannels) {
            this.sendMessage(message, socketId);
        }
    };

    //发送消息方法
    skyrtc.prototype.sendMessage = function(message, socketId) {
        if (this.dataChannels[socketId].readyState.toLowerCase() === 'open') {
            this.dataChannels[socketId].send(JSON.stringify({
                type: "__msg",
                data: message
            }));
        }
    };
    
    //对所有的PeerConnections创建Data  channel
    skyrtc.prototype.addDataChannels = function() {
        var connection;
        for (connection in this.peerConnections) {
            this.createDataChannel(connection);
        }
    };

    //对某一个PeerConnection创建Data channel
    skyrtc.prototype.createDataChannel = function(socketId, label) {
        var pc, key, channel;
        pc = this.peerConnections[socketId];

        if (!socketId) {
            this.emit("data_channel_create_error", socketId, new Error("attempt to create data channel without socket id"));
        }

        if (!(pc instanceof PeerConnection)) {
            this.emit("data_channel_create_error", socketId, new Error("attempt to create data channel without peerConnection"));
        }
        try {
            channel = pc.createDataChannel(label);
        } catch (error) {
            this.emit("data_channel_create_error", socketId, error);
        }

        return this.addDataChannel(socketId, channel);
    };

    //为Data channel绑定相应的事件回调函数
    skyrtc.prototype.addDataChannel = function(socketId, channel) {
        var that = this;
        channel.onopen = function() {
            that.emit('data_channel_opened', channel, socketId);
        };

        channel.onclose = function(event) {
            delete that.dataChannels[socketId];
            that.emit('data_channel_closed', channel, socketId);
        };

        channel.onmessage = function(message) {
            var json;
            json = JSON.parse(message.data);
            if (json.type === '__file') {
                /*that.receiveFileChunk(json);*/
                that.parseFilePacket(json, socketId);
            } else {
                that.emit('data_channel_message', channel, socketId, json.data);
            }
        };

        channel.onerror = function(err) {
            that.emit('data_channel_error', channel, socketId, err);
        };

        this.dataChannels[socketId] = channel;
        return channel;
    };



    /**********************************************************/
    /*                                                        */
    /*                       文件传输                         */
    /*                                                        */
    /**********************************************************/

    /************************公有部分************************/

    //解析Data channel上的文件类型包,来确定信令类型
    skyrtc.prototype.parseFilePacket = function(json, socketId) {
        var signal = json.signal,
            that = this;
        if (signal === 'ask') {
            that.receiveFileAsk(json.sendId, json.name, json.size, socketId);
        } else if (signal === 'accept') {
            that.receiveFileAccept(json.sendId, socketId);
        } else if (signal === 'refuse') {
            that.receiveFileRefuse(json.sendId, socketId);
        } else if (signal === 'chunk') {
            that.receiveFileChunk(json.data, json.sendId, socketId, json.last, json.percent);
        } else if (signal === 'close') {
            //TODO
        }
    };

    /***********************发送者部分***********************/


    //通过Dtata channel向房间内所有其他用户广播文件
    skyrtc.prototype.shareFile = function(dom) {
        var socketId,
            that = this;
        for (socketId in that.dataChannels) {
            that.sendFile(dom, socketId);
        }
    };

    //向某一单个用户发送文件
    skyrtc.prototype.sendFile = function(dom, socketId) {
        var that = this,
            file,
            reader,
            fileToSend,
            sendId;
        if (typeof dom === 'string') {
            dom = document.getElementById(dom);
        }
        if (!dom) {
            that.emit("send_file_error", new Error("Can not find dom while sending file"), socketId);
            return;
        }
        if (!dom.files || !dom.files[0]) {
            that.emit("send_file_error", new Error("No file need to be sended"), socketId);
            return;
        }
        file = dom.files[0];
        that.fileChannels[socketId] = that.fileChannels[socketId] || {};
        sendId = that.getRandomString();
        fileToSend = {
            file: file,
            state: "ask"
        };
        that.fileChannels[socketId][sendId] = fileToSend;
        that.sendAsk(socketId, sendId, fileToSend);
        that.emit("send_file", sendId, socketId, file);
    };

    //发送多个文件的碎片
    skyrtc.prototype.sendFileChunks = function() {
        var socketId,
            sendId,
            that = this,
            nextTick = false;
        for (socketId in that.fileChannels) {
            for (sendId in that.fileChannels[socketId]) {
                if (that.fileChannels[socketId][sendId].state === "send") {
                    nextTick = true;
                    that.sendFileChunk(socketId, sendId);
                }
            }
        }
        if (nextTick) {
            setTimeout(function() {
                that.sendFileChunks();
            }, 10);
        }
    };

    //发送某个文件的碎片
    skyrtc.prototype.sendFileChunk = function(socketId, sendId) {
        var that = this,
            fileToSend = that.fileChannels[socketId][sendId],
            packet = {
                type: "__file",
                signal: "chunk",
                sendId: sendId
            },
            channel;

        fileToSend.sendedPackets++;
        fileToSend.packetsToSend--;


        if (fileToSend.fileData.length > packetSize) {
            packet.last = false;
            packet.data = fileToSend.fileData.slice(0, packetSize);
            packet.percent = fileToSend.sendedPackets / fileToSend.allPackets * 100;
            that.emit("send_file_chunk", sendId, socketId, fileToSend.sendedPackets / fileToSend.allPackets * 100, fileToSend.file);
        } else {
            packet.data = fileToSend.fileData;
            packet.last = true;
            fileToSend.state = "end";
            that.emit("sended_file", sendId, socketId, fileToSend.file);
            that.cleanSendFile(sendId, socketId);
        }

        channel = that.dataChannels[socketId];

        if (!channel) {
            that.emit("send_file_error", new Error("Channel has been destoried"), socketId, sendId, fileToSend.file);
            return;
        }
        channel.send(JSON.stringify(packet));
        fileToSend.fileData = fileToSend.fileData.slice(packet.data.length);
    };

    //发送文件请求后若对方同意接受,开始传输
    skyrtc.prototype.receiveFileAccept = function(sendId, socketId) {
        var that = this,
            fileToSend,
            reader,
            initSending = function(event, text) {
                fileToSend.state = "send";
                fileToSend.fileData = event.target.result;
                fileToSend.sendedPackets = 0;
                fileToSend.packetsToSend = fileToSend.allPackets = parseInt(fileToSend.fileData.length / packetSize, 10);
                that.sendFileChunks();
            };
        fileToSend = that.fileChannels[socketId][sendId];
        reader = new window.FileReader(fileToSend.file);
        reader.readAsDataURL(fileToSend.file);
        reader.onload = initSending;
        that.emit("send_file_accepted", sendId, socketId, that.fileChannels[socketId][sendId].file);
    };

    //发送文件请求后若对方拒绝接受,清除掉本地的文件信息
    skyrtc.prototype.receiveFileRefuse = function(sendId, socketId) {
        var that = this;
        that.fileChannels[socketId][sendId].state = "refused";
        that.emit("send_file_refused", sendId, socketId, that.fileChannels[socketId][sendId].file);
        that.cleanSendFile(sendId, socketId);
    };

    //清除发送文件缓存
    skyrtc.prototype.cleanSendFile = function(sendId, socketId) {
        var that = this;
        delete that.fileChannels[socketId][sendId];
    };

    //发送文件请求
    skyrtc.prototype.sendAsk = function(socketId, sendId, fileToSend) {
        var that = this,
            channel = that.dataChannels[socketId],
            packet;
        if (!channel) {
            that.emit("send_file_error", new Error("Channel has been closed"), socketId, sendId, fileToSend.file);
        }
        packet = {
            name: fileToSend.file.name,
            size: fileToSend.file.size,
            sendId: sendId,
            type: "__file",
            signal: "ask"
        };
        channel.send(JSON.stringify(packet));
    };

    //获得随机字符串来生成文件发送ID
    skyrtc.prototype.getRandomString = function() {
        return (Math.random() * new Date().getTime()).toString(36).toUpperCase().replace(/\./g, '-');
    };

    /***********************接收者部分***********************/


    //接收到文件碎片
    skyrtc.prototype.receiveFileChunk = function(data, sendId, socketId, last, percent) {
        var that = this,
            fileInfo = that.receiveFiles[sendId];
        if (!fileInfo.data) {
            fileInfo.state = "receive";
            fileInfo.data = "";
        }
        fileInfo.data = fileInfo.data || "";
        fileInfo.data += data;
        if (last) {
            fileInfo.state = "end";
            that.getTransferedFile(sendId);
        } else {
            that.emit("receive_file_chunk", sendId, socketId, fileInfo.name, percent);
        }
    };

    //接收到所有文件碎片后将其组合成一个完整的文件并自动下载
    skyrtc.prototype.getTransferedFile = function(sendId) {
        var that = this,
            fileInfo = that.receiveFiles[sendId],
            hyperlink = document.createElement("a"),
            mouseEvent = new MouseEvent('click', {
                view: window,
                bubbles: true,
                cancelable: true
            });
        hyperlink.href = fileInfo.data;
        hyperlink.target = '_blank';
        hyperlink.download = fileInfo.name || dataURL;

        hyperlink.dispatchEvent(mouseEvent);
        (window.URL || window.webkitURL).revokeObjectURL(hyperlink.href);
        that.emit("receive_file", sendId, fileInfo.socketId, fileInfo.name);
        that.cleanReceiveFile(sendId);
    };

    //接收到发送文件请求后记录文件信息
    skyrtc.prototype.receiveFileAsk = function(sendId, fileName, fileSize, socketId) {
        var that = this;
        that.receiveFiles[sendId] = {
            socketId: socketId,
            state: "ask",
            name: fileName,
            size: fileSize
        };
        that.emit("receive_file_ask", sendId, socketId, fileName, fileSize);
    };
   
    //发送同意接收文件信令
    skyrtc.prototype.sendFileAccept = function(sendId) {
        var that = this,
            fileInfo = that.receiveFiles[sendId],
            channel = that.dataChannels[fileInfo.socketId],
            packet;
        if (!channel) {
            that.emit("receive_file_error", new Error("Channel has been destoried"), sendId, socketId);
        }
        packet = {
            type: "__file",
            signal: "accept",
            sendId: sendId
        };
        channel.send(JSON.stringify(packet));
    };

    //发送拒绝接受文件信令
    skyrtc.prototype.sendFileRefuse = function(sendId) {
        var that = this,
            fileInfo = that.receiveFiles[sendId],
            channel = that.dataChannels[fileInfo.socketId],
            packet;
        if (!channel) {
            that.emit("receive_file_error", new Error("Channel has been destoried"), sendId, socketId);
        }
        packet = {
            type: "__file",
            signal: "refuse",
            sendId: sendId
        };
        channel.send(JSON.stringify(packet));
        that.cleanReceiveFile(sendId);
    };

    //清除接受文件缓存
    skyrtc.prototype.cleanReceiveFile = function(sendId) {
        var that = this;
        delete that.receiveFiles[sendId];
    };

    return new skyrtc();
};