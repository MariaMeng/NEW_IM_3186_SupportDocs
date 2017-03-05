var SkyRTC = function() {
    var PeerConnection = (window.PeerConnection || window.webkitPeerConnection00 || window.webkitRTCPeerConnection || window.mozRTCPeerConnection);
    var URL = (window.URL || window.webkitURL || window.msURL || window.oURL);
    //var getUserMedia = (navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia);
    var getUserMedia = (navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia );
	var nativeRTCIceCandidate = (window.mozRTCIceCandidate || window.RTCIceCandidate);
    var nativeRTCSessionDescription = (window.mozRTCSessionDescription || window.RTCSessionDescription); // order is very important: "RTCSessionDescription" defined in Nighly but useless
    var moz = !! navigator.mozGetUserMedia;
    var iceServer = { //Create RTCconfiguration, which is used as a parameter to create RTCPeerConnection
        "iceServers": [{
            "url": "stun:stun.l.google.com:19302"
        }],
		"iceTransportPolicy":"all",
		"bundlePolicy": "balanced"	
    };
    var packetSize = 1000;
	
	/**************************Voice Detection Variable ***************************/
	
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
	
	/**************************Audio Record Variable ***************************/
	var leftchannel = [];
	var rightchannel = [];
	var recorder = null;
	var recording = false; //Judge whether it is recording state or not, if yes, then the value is true; otherwise, false
	var recordingLength = 0;//Recording length
	var volume = null;
	var audioInput = null;
	var sampleRate = null;
	var audioContext = null;
	var context = null;
	var outputElement = document.getElementById('output');
	var outputString;
	
	/*********************** Choose Audio Codec Variable*****************/
	codecSelector = document.querySelector('select#codec');
	portSelector = document.querySelector('select#portNumber');
	
	/****************** Control Start and Stop Variable ******************/
	callButton = document.getElementById("callButton");
	echoCancellation = document.getElementById("echoCancellation");
	hangupButton = document.querySelector('button#hangupButton');
	hangupButton.disabled = true;
	
	/*********************** Draw Spectrum Variable **********************/
	window.requestAnimationFrame = window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame || window.msRequestAnimationFrame;
    window.cancelAnimationFrame = window.cancelAnimationFrame || window.webkitCancelAnimationFrame || window.mozCancelAnimationFrame || window.msCancelAnimationFrame;
	var animationId = null;
	var status = 0; //flag for sound is playing 1 or stopped 0
	var allCapsReachBottom = false;//It is used in Canvas, to detect whether cap has returned to bottom or not, if returned, then true; otherwise, false. 
	
    /**********************************************************/
    /*                                                        */
    /*                   Event Handler                        */
    /*                                                        */
    /**********************************************************/
    function EventEmitter() {
        this.events = {};
    }
    //Define event bundling function
    EventEmitter.prototype.on = function(eventName, callback) {
        this.events[eventName] = this.events[eventName] || [];
        this.events[eventName].push(callback);
    };
    //Define event trigger function
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
    /*                 Detect voice volume                    */
    /*                                                        */
    /**********************************************************/	
	
	function SoundMeter(context) {
		this.context = context;
		this.instant = 0.0;
		this.slow = 0.0;
		this.clip = 0.0;
		this.script = context.createScriptProcessor(2048, 1, 1);//Single data channel
		var that = this;
		
		this.script.onaudioprocess = function(event) {
			var input = event.inputBuffer.getChannelData(0);//Returns a Float32Array containing the PCM data 
			var i;
			var sum = 0.0;
			var clipcount = 0;
			
			//console.log("Input Leng"+input.length);
			
			
			for (i = 0; i < input.length; ++i) {
				sum += input[i] * input[i];
				if (Math.abs(input[i]) > 0.99) {//If it is clip
					clipcount += 1;
				}
			}
			that.instant = Math.sqrt(sum / input.length);//Root Mean Square
			//console.log("Instant volume!!!!!!!!!!!!");
			that.slow = 0.95 * that.slow + 0.05 * that.instant;
			//that.slow = 0.85 * that.slow + 0.15 * that.instant;
			that.clip = clipcount / input.length;
		};
	}
	
	//Add audio source node
	SoundMeter.prototype.connectToSource = function(stream) {
		console.log('SoundMeter connecting');
		this.mic = this.context.createMediaStreamSource(stream);
		this.mic.connect(this.script);
		// necessary to make sample run, but should not be.
		this.script.connect(this.context.destination);
	};

	//Close audio source node
	SoundMeter.prototype.stop = function() {
		this.mic.disconnect();
		this.script.disconnect();
	};
	
	
	/**********************************************************/
    /*                                                        */
    /*           Record voice into WAV file                   */
    /*                                                        */
    /**********************************************************/
	myReference.onclick = function(event){
		window.onkeydown = function(e){
    
			// if R is pressed, we start recording 
			if ( e.keyCode == 82 ){
				recording = true;
				// reset the buffers for the new recording
				leftchannel.length = rightchannel.length = 0;
				recordingLength = 0;
				outputElement.innerHTML = 'Recording now...';
				// if S is pressed, we stop the recording and package the WAV file 
			} else if ( e.keyCode == 83 ){
        
				// we stop recording
				recording = false;
        
				outputElement.innerHTML = 'Building wav file...';

				// we flat the left and right channels down
				var leftBuffer = mergeBuffers ( leftchannel, recordingLength );
				var rightBuffer = mergeBuffers ( rightchannel, recordingLength );
				// we interleave both channels together
				var interleaved = interleave ( leftBuffer, rightBuffer );
        
				// we create our wav file, including creating WAV headers
				var buffer = new ArrayBuffer(44 + interleaved.length * 2);
				var view = new DataView(buffer);//The DataView provides a low-level interface for reading data FROM and writing it To an ArrayBuffer
        
				// RIFF chunk descriptor
				writeUTFBytes(view, 0, 'RIFF');//RIFF: one of file format,writeUTFBytes is used to write UTF-8 string into byte stream
				view.setUint32(4, 44 + interleaved.length * 2, true);
				writeUTFBytes(view, 8, 'WAVE');
				// FMT sub-chunk
				writeUTFBytes(view, 12, 'fmt ');
				view.setUint32(16, 16, true);
				view.setUint16(20, 1, true);//1: PCM type audio file
				// stereo (2 channels)
				view.setUint16(22, 2, true);//2: Two data channel in input buffer
				view.setUint32(24, sampleRate, true);
				view.setUint32(28, sampleRate * 4, true);
				view.setUint16(32, 4, true);
				view.setUint16(34, 16, true);
				// data sub-chunk
				writeUTFBytes(view, 36, 'data');
				view.setUint32(40, interleaved.length * 2, true);//The length of the audio data 
        
				// write the PCM samples
				var lng = interleaved.length;
				var index = 44;
				var volume = 1;
				for (var i = 0; i < lng; i++){
					view.setInt16(index, interleaved[i] * (0x7FFF * volume), true);
					index += 2;
				}
        
				//A Blob object represents a file-like object of immutable, raw data. 
				var blob = new Blob ( [ view ], { type : 'audio/wav' } );
        
				// let's save it locally
				outputElement.innerHTML = 'Handing off the file now...';
				var url = (window.URL || window.webkitURL).createObjectURL(blob);//Create a path for object
				var link = window.document.createElement('a');//Create an element "hyperlink" on web page
				link.href = url;//Connect the hyperlink with path.
				link.download = 'output.wav';
				var click = document.createEvent("Event");//createEvent is a windows API, which is used to create/open event object named or unnamed.
				click.initEvent("click", true, true);
				link.dispatchEvent(click);
			}
		
		}
	}
	myReferenceFinish.onclick = function(event){
		outputElement.innerHTML = '';
		window.onkeydown = function(e){
		}
	}

	function interleave(leftChannel, rightChannel){ //we interleave both channels together
		var length = leftChannel.length + rightChannel.length;
		var result = new Float32Array(length);

		var inputIndex = 0;

		for (var index = 0; index < length; ){
			result[index++] = leftChannel[inputIndex];
			result[index++] = rightChannel[inputIndex];
			inputIndex++;
		}
		return result;
	}

	function mergeBuffers(channelBuffer, recordingLength){ //flat down each channel 
		var result = new Float32Array(recordingLength);
		var offset = 0;
		var lng = channelBuffer.length;
		for (var i = 0; i < lng; i++){
			var buffer = channelBuffer[i];
			result.set(buffer, offset);
			offset += buffer.length;
		}
		return result;
	}

	function writeUTFBytes(view, offset, string){ 
		var lng = string.length;
		for (var i = 0; i < lng; i++){
			view.setUint8(offset + i, string.charCodeAt(i));
		}
	}
	
	/**********************************************************/
    /*                                                        */
    /*                  Display spectrum                      */
    /*                                                        */
    /**********************************************************/
	
	function drawSpectrum(analyser) { 
        var canvas = document.getElementById('canvas'),
            cwidth = canvas.width,
            cheight = canvas.height - 2,
            meterWidth = 10, //width of the meters in the spectrum
            gap = 2, //gap between meters
            capHeight = 2,
            capStyle = '#fff',
            meterNum = canvas.width / (meterWidth + gap), //count of the number of bar on web page
			capYPositionArray = []; ////store the vertical position of the caps for the previous frame
        ctx = canvas.getContext('2d'),
        //Define a gradient style
		gradient = ctx.createLinearGradient(0, 0, 0, 200);
        gradient.addColorStop(1, '#0f0');
        gradient.addColorStop(0.5, '#ff0');
        gradient.addColorStop(0, '#f00');
        var drawMeter = function() {
            var array = new Uint8Array(analyser.frequencyBinCount);
			analyser.getByteFrequencyData(array);
			//console.log("Output length of buffer of analyser:"+array.length);//"array.length=1024"
            if (status === 0) {//flag for sound playing:1 or stopping: 0
                //fix when some sounds end the value still not back to zero
                for (var i = array.length - 1; i >= 0; i--) {
                    array[i] = 0;
                };
                allCapsReachBottom = true;
                for (var i = capYPositionArray.length - 1; i >= 0; i--) {
                    allCapsReachBottom = allCapsReachBottom && (capYPositionArray[i] === 0);
                };
                if (allCapsReachBottom) {
                    cancelAnimationFrame(animationId); //since the sound is stoped and animation finished, stop the requestAnimation to prevent potential memory leak,THIS IS VERY IMPORTANT!
                    return;
                };
            };
            var step = Math.round(array.length / meterNum); //sample limited data from the total array,calculate the step size from analyser node
            ctx.clearRect(0, 0, cwidth, cheight);//Clear the canvas to prepare starting
            //Traverse the array to get the sample value, and draw the bar chart
			for (var i = 0; i < meterNum; i++) {
                var value = array[i * step];//get the sample value from array, step size is 12.
                if (capYPositionArray.length < Math.round(meterNum)) {
                    capYPositionArray.push(value);
                };
                ctx.fillStyle = capStyle;
                //draw the cap, with transition effect
                if (value < capYPositionArray[i]) {
                    ctx.fillRect(i * 12, cheight - (--capYPositionArray[i]), meterWidth, capHeight);
                } else {
                    ctx.fillRect(i * 12, cheight - value, meterWidth, capHeight);
                    capYPositionArray[i] = value;
                };
                ctx.fillStyle = gradient; //set the filllStyle to gradient for a better look
                ctx.fillRect(i * 12 /*meterWidth+gap*/ , cheight - value + capHeight, meterWidth, cheight); //Draw the meter on bar chart, draw  the filled rectangle
            }
            animationId = requestAnimationFrame(drawMeter);
        }
        animationId = requestAnimationFrame(drawMeter);
    }
	
    /**********************************************************/
    /*                                                        */
    /*               Stream and channel establishment         */
    /*                                                        */
    /**********************************************************/


    /*******************Fundamental part*********************/
    function skyrtc() {
        this.localMediaStream = null;//local media stream
		this.localAudioStream = null;//local audio stream
		this.localVideoStreeam = null;//local video stream 
		
        this.room = "";//room number
        this.fileData = {};//Temporarily store receiving file
		
        this.socket = null;//It is used to generate WebSocket object, to establish connection with WebSocket server.
        this.me = null;//local socket id, which is generated from server.
        this.peerConnections = {};//Store all peer connection that connected with local device,key is socket id, value is PeerConnection type.
        this.connections = [];//Store all socket id that connected with local device.
		
        this.numStreams = 0;//Number of streams that are needed to establish initially.
        this.initializedStreams = 0;//Number of streams that have already established initially.
        this.dataChannels = {};//Store all data channel, key is socket id, value is created by PeerConnection object.
        this.fileChannels = {};//Store all data channel for sending files, together with sending state.
        this.receiveFiles = {};//Store all receiving files
    }
    
    skyrtc.prototype = new EventEmitter();//Inherit functions in Event handle, especially for emit and on method.


    /*************************Connect WebSocket server***************************/

    //This function is used to create connection with WebSocket server 
    skyrtc.prototype.connect = function(server, room) { 
        var socket,
            that = this;
        room = room || "";
        socket = this.socket = new WebSocket(server); //Create a WebSocket object, whose parameter is server address.
        
		socket.onopen = function() {//After the browser connect successfully with WebSocket server, "onopen" attribute will be triggered.
            socket.send(JSON.stringify({ //Transform JavaScript object or array into JSON string, and then send to server.
                "eventName": "__join",
                "data": {
                    "room": room
                }
            }));
            that.emit("socket_opened", socket);
        };

        socket.onmessage = function(message) {//When Browser receives message from WebSocket server, "onmessage" attribute will be triggered. Parameter message involves data from server.
            var json = JSON.parse(message.data);//Transform JSON string into JavaScript object. The type of "message.data" is string.
            if (json.eventName) {//After parsing, if the result is an event name, then use emit function to trigger specific event.
                that.emit(json.eventName, json.data);
            } else {
                that.emit("socket_receive_message", socket, json);
            }
        };

        socket.onerror = function(error) {//If Browser failed to connect with WebSocket server, then "onerror" attribute will be triggered.
            that.emit("socket_error", error, socket);
        };

        socket.onclose = function(data) {//If Browser receives close connection request from WebSocket server, "onclose" attribute will be triggered. 
            //that.localAudioStream.close();
            var pcs = that.peerConnections;
            for (i = pcs.length; i--;) {
                that.closePeerConnection(pcs[i]);
            }
            that.peerConnections = [];//Clean all peer connection which connected with local device.
            that.dataChannels = {};
            that.fileChannels = {};
            that.connections = [];
            that.fileData = {};
            that.emit('socket_closed', socket);
        };
		
		this.on('_peers', function(data) {  //Receives all socket id of users, who has joined the system before this new user, from WebSocket server. 
            console.trace("Peers!\n");
			
			
            that.connections = data.connections;//Obtain all socket id from WebSocket server.
            that.me = data.you;//Variable "me" is the socket id of local device, the socket id is generated from back end.
            that.emit("get_peers", that.connections);
        });
		
		this.on("_ice_candidate", function(data) {//If new ICE Candidate joins, then nativeRTCIceCandidate will be invoked, and add new ICE Candidate into peer connection object. 
            var candidate = new nativeRTCIceCandidate(data);
            var pc = that.peerConnections[data.socketId];
            pc.addIceCandidate(candidate);
			
            console.log('---------Trigger Ice Candidate event---------------------');
			console.trace(candidate);
			
			that.emit('get_ice_candidate', candidate);
        });

        this.on('_new_peer', function(data) { //If new user joins the system, WebSocket server will inform old user the socket id of new user.
			//console.trace("New Peer!\n");
            that.connections.push(data.socketId);//Add new socket id 
            var pc = that.createPeerConnection(data.socketId),  //Create PeerConnection object
                i, m;
            pc.addStream(that.localAudioStream); //Add a new stream to the PeerConnection object 
            //that.emit('new_peer', data.socketId);
        });

        this.on('_remove_peer', function(data) { //If user receives message
            //console.trace("Some Peer Remove\n");
			var sendId;
            that.closePeerConnection(that.peerConnections[data.socketId]); 
            
			console.trace("Test Before Deleting: "+data.socketId+"\n");
			console.trace("Test Before Deleting: "+that.peerConnections[data.socketId]+"\n");
			
			delete that.peerConnections[data.socketId];
            
			console.trace("Test After Deleting: "+that.peerConnections[data.socketId]+"\n");
			
			delete that.dataChannels[data.socketId];
            for (sendId in that.fileChannels[data.socketId]) {
                that.emit("send_file_error", new Error("Connection has been closed"), data.socketId, sendId, that.fileChannels[data.socketId][sendId].file);
            }
            delete that.fileChannels[data.socketId];
            that.emit("remove_peer", data.socketId);
        });
		
		this.on('NEW_remove_peer', function(data) { 
            //console.trace("NEW Remove PEER!\n");
			var sendId;
            
			console.trace("Signaling State: "+that.peerConnections[data.socketId].signalingState+"\n");
			that.closePeerConnection(that.peerConnections[data.socketId]); 
            
			console.trace("Signaling State: "+that.peerConnections[data.socketId].signalingState+"\n");
            that.emit("remove_peer", data.socketId);//Send remove message to index.html 
        });
		
        this.on('Pause_Peer_Connection', function(data) { //If there are some peers leave
            console.trace("Pause!Pause!\n");
			document.getElementById('other-' + data.socketId).pause();
        });
		
		this.on('_offer', function(data) { //If Callee receives offer message from Caller
            that.receiveOffer(data.socketId, data.sdp); //Receives socket id from sender, together with sender's local session description
            that.emit("get_offer", data);
        });

        this.on('_answer', function(data) { //If Caller receives answer message from Callee
            that.receiveAnswer(data.socketId, data.sdp);
            that.emit('get_answer', data);
        });

        this.on('send_file_error', function(error, socketId, sendId, file) {
            that.cleanSendFile(sendId, socketId);
        });

        this.on('receive_file_error', function(error, sendId) {
            that.cleanReceiveFile(sendId);
        });

        this.on('ready', function() { //If it is ready state, then the following codes will be executed.
            //console.trace("Ready!\n");
			that.createPeerConnections();
            that.addStreams();
            that.addDataChannels();
            
			//sleep(10000); 
			
			that.sendOffers();
        });

        this.emit('connected', socket);
    };

    
	function sleep(sleepTime) {
       for(var start = Date.now(); Date.now() - start <= sleepTime; ) { } 
	}
	
	/*************************Media Stream Process*******************************/

    //Create local audio media stream
    skyrtc.prototype.createAudioStream = function(options) { //This options variable can be an object, such as {"video": true,"audio": true}
		var that = this; //this 表示被添加的原型的类的实例

        options.video = !! options.video;
        options.audio = !! options.audio;

        if (getUserMedia) { //If browser supports WebRTC 
            this.numStreams++;
            getUserMedia.call(navigator, options, function(stream) { //invokes Call function, which enables navigator to run GetUserMedia function
                    
					that.localAudioStream = stream;
					
                    that.initializedStreams++;
                    that.emit("stream_created", stream);
                    if (that.initializedStreams === that.numStreams) {
                        that.emit("ready");
                    }	
					
					/*************Voice Volume Detection***************/
					
					var soundMeter = window.soundMeter = new SoundMeter(window.audioContext); //Generate SoundMeter object  
					soundMeter.connectToSource(stream);
					
					setInterval(function() {
						instantMeter.value = instantValueDisplay.innerText =soundMeter.instant.toFixed(2);
						slowMeter.value = slowValueDisplay.innerText =soundMeter.slow.toFixed(2);
						clipMeter.value = clipValueDisplay.innerText =soundMeter.clip.toFixed(2);
					}, 200);
					
					/******************Audio Record*********************/
					audioContext = window.AudioContext || window.webkitAudioContext;
					context = new audioContext();

					// we query the context sample rate (varies depending on platforms)
					sampleRate = context.sampleRate;

					console.log('succcess');
    
					// creates a gain node
					//volume = context.createGain();

					// creates an audio node from the microphone incoming stream
					audioInput = context.createMediaStreamSource(stream);

					// connect the stream to the gain node
					//audioInput.connect(volume);

					/* From the spec: This value controls how frequently the audioprocess event is 
					dispatched and how many sample-frames need to be processed each call. 
					Lower values for buffer size will result in a lower (better) latency. 
					Higher values will be necessary to avoid audio breakup and glitches */
					var bufferSize = 2048;
					recorder = context.createScriptProcessor(bufferSize, 2, 2);//Double data channel

					recorder.onaudioprocess = function(e){//If record is triggered if the script processor node has been generated successfully. 
						if (!recording) return;//If it is not recording, then do nothing.
						var left = e.inputBuffer.getChannelData (0);
						var right = e.inputBuffer.getChannelData (1);
						// we clone the samples
						leftchannel.push (new Float32Array (left));
						rightchannel.push (new Float32Array (right));
						recordingLength += bufferSize;
						//console.log('recording');//Output recording
					}				

					// we connect the recorder
					//volume.connect (recorder);
					audioInput.connect(recorder);
					recorder.connect (context.destination); 
					
					/*********************** Draw Spectrum **********************/
					var analyser = context.createAnalyser();
					audioInput.connect(analyser);
					//analyser.connect(context.destination);
					
					if (animationId !== null) {
						cancelAnimationFrame(animationId);
					}
					status = 1;//flag for sound is playing 1 
					drawSpectrum(analyser);//Invoke drawSpectrum function
					
                },
                 function(error) {
                    that.emit("stream_create_error", error);
                });
        } else { //If browser does not support WebRTC 
            that.emit("stream_create_error", new Error('WebRTC is not yet supported in this browser.'));
        }
    };
    
	//Add local stream to all Peer connection objects 
    skyrtc.prototype.addStreams = function() {
        var i, m,
            stream,
            connection;
        for (connection in this.peerConnections) {
            this.peerConnections[connection].addStream(this.localAudioStream); //Add a new stream to the RTCPeerConnection,prepare to transmit local media to remote peer.
        }
    };

    //Attach remote stream to audio element on Web page for output.
    skyrtc.prototype.attachStream = function(stream, domId) { 
        var element = document.getElementById(domId);
        if (navigator.mozGetUserMedia) {
            element.mozSrcObject = stream;
            element.play();
        } else {
            element.src = webkitURL.createObjectURL(stream);
        }
        element.src = webkitURL.createObjectURL(stream);
    };

    /***********************Signalling Exchange *******************************/

    //Send offer message to all remote peer, including local session description.Apart from that, local session description is set at this stage, by using setLocalDescription function. 
    skyrtc.prototype.sendOffers = function() {
        var i, m,
            pc,
            that = this,
            pcCreateOfferCbGen = function(pc, socketId) {//socketId belongs to other user
                return function(session_desc) {
					//choose audio codec according to HTML selector
					session_desc.sdp = forceChosenAudioCodec(session_desc.sdp);
					
					/*
					console.trace('##########################-----------------------###########');
					console.trace(session_desc.sdp);
					*/
                    
					pc.setLocalDescription(session_desc);
                    
					/*
					console.log('---------------NEW Local Descrption---------------');
					console.trace(pc.localDescription.sdp+"\n");
					*/
					
					console.log('-------------------------------------------------------------------');
					console.log('--------------------Set Local Description--------------------------');
					console.log('-------------------------------------------------------------------');
					
					that.socket.send(JSON.stringify({ //send offer message to server, which includes local session description, and other user's socket id.
                        "eventName": "__offer",
                        "data": {
                            "sdp": session_desc,
                            "socketId": socketId
                        }
                    }));
					
					console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
					console.trace("Signaling State: "+pc.signalingState+"\n");
					
                };
            },
            pcCreateOfferErrorCb = function(error) {
                console.log(error);
            };
        
		//console.trace("Connection length:"+this.connections.length+"\n");
		for (i = 0, m = this.connections.length; i < m; i++) {
            pc = this.peerConnections[this.connections[i]];
            pc.createOffer(pcCreateOfferCbGen(pc, this.connections[i]), pcCreateOfferErrorCb);
			
			
			console.log('---------------------Create Offer--------------------');
			console.trace("Signaling State: "+pc.signalingState+"\n");
			
			/*
			console.log('--------------- Local Descrption---------------');
			console.trace(pc.localDescription.sdp+"\n");
			*/
        }
		
		
    };

	/******************************** NEW CODE ************************************/	
	function forceChosenAudioCodec(sdp) {
		return maybePreferCodec(sdp, 'audio', 'send', codecSelector.value);
	}	
	// Sets |codec| as the default |type| codec if it's present.
	// The format of |codec| is 'NAME/RATE', e.g. 'opus/48000'.
	function maybePreferCodec(sdp, type, dir, codec) {
		var str = type + ' ' + dir + ' codec';
		if (codec === '') {
			console.trace('No preference on ' + str + '.');
			return sdp;
		}

		console.trace('Prefer ' + str + ': ' + codec);

		var sdpLines = sdp.split('\r\n');//sdpLines is an array

		// Search for m line.
		var mLineIndex = findLine(sdpLines, 'm=', type);
		if (mLineIndex === null) {
			return sdp;
		}

		// If the codec is available, set it as the default in m line.
		var codecIndex = findLine(sdpLines, 'a=rtpmap', codec);
		if (codecIndex) {
			var payload = getCodecPayloadType(sdpLines[codecIndex]);
			if (payload) {
				sdpLines[mLineIndex] = setDefaultCodec(sdpLines[mLineIndex], payload);
			}
		}
		
		/**********Add Port Choose Code Here *********/
		
		//sdpLines[mLineIndex] = setPortNumber(sdpLines[mLineIndex],portSelector.value);
		
		/**********************************************/
		
		sdp = sdpLines.join('\r\n');
		return sdp;
	}
	
	// Find the line in sdpLines that starts with |prefix|, and, if specified,
	// contains |substr| (case-insensitive search).
	function findLine(sdpLines, prefix, substr) {
		return findLineInRange(sdpLines, 0, -1, prefix, substr);
	}
	
	// Find the line in sdpLines[startLine...endLine - 1] that starts with |prefix|
	// and, if specified, contains |substr| (case-insensitive search).
	function findLineInRange(sdpLines, startLine, endLine, prefix, substr) {
		var realEndLine = endLine !== -1 ? endLine : sdpLines.length;
		for (var i = startLine; i < realEndLine; ++i) {
			if (sdpLines[i].indexOf(prefix) === 0) {
				if (!substr || sdpLines[i].toLowerCase().indexOf(substr.toLowerCase()) !== -1) {
					return i;
				}
			}
		}
		return null;
	}
	
	// Gets the codec payload type from an a=rtpmap:X line.
	function getCodecPayloadType(sdpLine) {
		var pattern = new RegExp('a=rtpmap:(\\d+) \\w+\\/\\d+');
		var result = sdpLine.match(pattern);
		return (result && result.length === 2) ? result[1] : null;
	}
	
	// Returns a new m= line with the specified codec as the first one.
	function setDefaultCodec(mLine, payload) {
		var elements = mLine.split(' ');

		// Just copy the first three parameters; codec order starts on fourth.
		var newLine = elements.slice(0, 3);

		// Put target payload first and copy in the rest.
		newLine.push(payload);
		for (var i = 3; i < elements.length; i++) {
			if (elements[i] !== payload) {
				newLine.push(elements[i]);
			}
		}
		return newLine.join(' ');
	}
	
	// Returns a new m= line with the specified port number chosen from user.
	function setPortNumber(mLine, port) {
		var elements = mLine.split(' ');
		
		// Just copy the first parameters; port number starts on second.
		var newLine = elements.slice(0, 1);
		
		// Substitute port number with new one.
		newLine.push(port);
		for (var i = 2; i < elements.length; i++) {
			newLine.push(elements[i]);
		}
		return newLine.join(' ');
	}
	

	/******************************** NEW CODE END ********************************/	
	
    //In this function, sendAnswer function is invoked. 
    skyrtc.prototype.receiveOffer = function(socketId, sdp) {
        var pc = this.peerConnections[socketId];
        
		console.log('------------RECEIVE OFFER----------------------');
		console.trace("Signaling State: "+pc.signalingState+"\n");
		
		this.sendAnswer(socketId, sdp);
    };

    //Send answer message
    skyrtc.prototype.sendAnswer = function(socketId, sdp) {
        var pc = this.peerConnections[socketId];
        var that = this;
        pc.setRemoteDescription(new nativeRTCSessionDescription(sdp));// The Callee sets the description the Caller sent him as the remote description using setRemoteDescription
        pc.createAnswer(function(session_desc) { //Invoke W3C，Section 4.3.3 Legacy Interface Extensions中createAnswer (RTCSessionDescriptionCallback successCallback, RTCPeerConnectionErrorCallback failureCallback);function
            pc.setLocalDescription(session_desc);//Callee sets the remote session description from Caller as its local description , so the local session can be compatible with the Caller.
            
			console.log('-------------------------------------------------------------------');
			console.log('--------------------Set Local Description--------------------------');
			console.log('-------------------------------------------------------------------');
			
			
			that.socket.send(JSON.stringify({//The Callee sends the session description back to Caller.
                "eventName": "__answer",
                "data": {
                    "socketId": socketId,
                    "sdp": session_desc
                }
            }));
			
			console.log('---------------Send Answer---------------');
			console.trace("Signaling State: "+pc.signalingState+"\n");
			
			
        }, function(error) {
            console.log(error);
        });
		
		
		console.log('@@@@@@@@@@@@@@@@@@@@@@@@@@');
		console.trace("Signaling State: "+pc.signalingState+"\n");
		
    };

    //After receiving answer message, it will set message as remote session description 
    skyrtc.prototype.receiveAnswer = function(socketId, sdp) { // When the Caller receives the Callee's session description, The Caller sets that as the remote description using setRemoteDescription
        var pc = this.peerConnections[socketId];	
        var newSDP= new nativeRTCSessionDescription(sdp);	
		pc.setRemoteDescription(newSDP);	
		
		
		
		console.log('-----------------------Revieve Answer--------------------');
		console.trace("Signaling State: "+pc.signalingState+"\n");
		
		/*
		console.log('--------------- Remote Descrption---------------');
		console.trace(pc.remoteDescription.sdp+"\n");
		*/
    };

    /***********************Peer to Peer connection*****************************/

    //Create PeerConnections with other users
    skyrtc.prototype.createPeerConnections = function() {
        var i, m;
		
		//console.trace("Test connections length:"+rtc.connections.length+"\n");
		
        for (i = 0, m = rtc.connections.length; i < m; i++) {
            this.createPeerConnection(this.connections[i]);
        }
    };

    //Create single PeerConnection
    skyrtc.prototype.createPeerConnection = function(socketId) {
		if(window.confirm("Do you want to connect with "+socketId+"？")){
			var that = this;
			var pc = new PeerConnection(iceServer); //Create a RTCPeerConnecion object 
			this.peerConnections[socketId] = pc;
			
			//console.trace("Output Test peer!"+this.peerConnections[socketId]+"\n");
			//console.trace("Test peerConnections length:"+this.peerConnections.length+"\n");
			//console.trace("Signaling State: "+pc.signalingState+"\n");
			
			
			pc.onicecandidate = function(evt) { //send any ice candidates to the other peer 
				//sleep(1000); 
				
				if (evt.candidate){
					that.socket.send(JSON.stringify({//Send __ice_candidate message to server.
						"eventName": "__ice_candidate",
						"data": {
							"label": evt.candidate.sdpMLineIndex,
							"candidate": evt.candidate.candidate,
							"socketId": socketId
						}
					}));
					console.log('###############################################');
					console.log(evt.candidate.candidate);
					console.log(evt.candidate.sdpMLineIndex);
				}
					
				//console.log(pc.localDescription.sdp+"\n");
				that.emit("pc_get_ice_candidate", evt.candidate, socketId, pc);
				
			};

			pc.onopen = function() {
				that.emit("pc_opened", socketId, pc);
			};

			
			hangupButton.onclick = function(event){
				
				console.log('--------------- Local Descrption---------------');
				console.trace(pc.localDescription.sdp+"\n");
				
				console.log('******************************************************************');
				console.log('--------------- Remote Descrption---------------');
				console.trace(pc.remoteDescription.sdp+"\n");
				
				
				
				console.trace("PAUSE!\n");
				for(i=0,m = rtc.connections.length; i < m; i++){
					var mySocket=that.connections[i];
					document.getElementById('other-' + mySocket).pause();
				}
				
				that.socket.send(JSON.stringify({//send _pause message to server
						"eventName": "_pause",
						"data": {
							"socketId": that.me
						}
				}));
				
				//document.getElementById('me').pause();
				
				hangupButton.disabled = true;
				callButton.disabled = false;
				codecSelector.disabled = false;
			};
			
			pc.onsignalingstatechange =function(evt){
				//alert("onsignalingstatechange event detected!");
				
				if(pc.signalingState=='closed'){
					console.trace("MENG XIANG!\n");
					console.trace("Signaling State: "+pc.signalingState+"\n");
					
					
				}
			}
			
			pc.onaddstream = function(evt) { //once remote stream arrives, show it in the remote video element. Onaddstream happens as early as possible after he setRemoteDescription
				
				console.trace("---------------------------------------------------------");
				console.trace("-------------------Remote Stream Arrives-----------------");
				console.trace("---------------------------------------------------------");
				
				that.emit('pc_add_stream', evt.stream, socketId, pc);//evt.stream为remote stream
			};

			pc.ondatachannel = function(evt) {
				that.addDataChannel(socketId, evt.channel);
				that.emit('pc_add_data_channel', evt.channel, socketId, pc);
			};
			
			return pc;
		}
		
    };

    //Close PeerConnection 
    skyrtc.prototype.closePeerConnection = function(pc) {
        if (!pc) return;
        pc.close();
    };

    /***********************Data Channel *****************************/

    
    //Broadcast message 
    skyrtc.prototype.broadcast = function(message) {
        var socketId;
        for (socketId in this.dataChannels) {
            this.sendMessage(message, socketId);
        }
    };

    //Send message to other PeerConnection object
    skyrtc.prototype.sendMessage = function(message, socketId) {
        if (this.dataChannels[socketId].readyState.toLowerCase() === 'open') {
            this.dataChannels[socketId].send(JSON.stringify({
                type: "__msg",
                data: message
            }));
        }
    };
    
    //Create data channel for all Peer Connections objects
    skyrtc.prototype.addDataChannels = function() {
        var connection;
        for (connection in this.peerConnections) {
            this.createDataChannel(connection);
        }
    };

    //Create data channel for one Peer Connection object 
    skyrtc.prototype.createDataChannel = function(socketId, label) {
		console.trace("Create Data Channel!");
        
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

    //Bundle data channel with related callback functions 
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
                that.emit('data_channel_message', channel, socketId, json.data);//display text message on web page
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
    /*                 File transmission                      */
    /*                                                        */
    /**********************************************************/

    /************************Public part************************/

    //Parse packet on data channel, which is to assure type of data packet 
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

    /***********************Sender***********************/


    //Broadcast message to all other users within the room on data channel. 
    skyrtc.prototype.shareFile = function(dom) {
        var socketId,
            that = this;
        for (socketId in that.dataChannels) {
            that.sendFile(dom, socketId);
        }
    };

    //Send a file to one user
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

    //Send many file chunks
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

    //Send one file chunk
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

    //After send ask, if receiver accepts, file will be started to transmit.
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

    //After send ask, if receiver rejects, then clean file information locally.
    skyrtc.prototype.receiveFileRefuse = function(sendId, socketId) {
        var that = this;
        that.fileChannels[socketId][sendId].state = "refused";
        that.emit("send_file_refused", sendId, socketId, that.fileChannels[socketId][sendId].file);
        that.cleanSendFile(sendId, socketId);
    };

    //Clean buffer for sending files
    skyrtc.prototype.cleanSendFile = function(sendId, socketId) {
        var that = this;
        delete that.fileChannels[socketId][sendId];
    };

    //Send request to transmit file
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

    //Obtain random string to generate filesendID 
    skyrtc.prototype.getRandomString = function() {
        return (Math.random() * new Date().getTime()).toString(36).toUpperCase().replace(/\./g, '-');
    };

    /***********************Receiver***********************/


    //Receiver file chunks
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

    //After receiving all file chunks, assemble them into one file and download automatically.
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

    //Receive file request from sender.
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
   
    //If receiver accepts, then it informs sender.
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

    //If receiver rejects, then it informs sender.
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

    //Clean buffer of receiving files
    skyrtc.prototype.cleanReceiveFile = function(sendId) {
        var that = this;
        delete that.receiveFiles[sendId];
    };

    return new skyrtc();
};