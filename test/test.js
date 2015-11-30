var io = require('socket.io-client');
var util = require('util');
//var Q = require('q');

//var messageUrl = "http://localhost:3000"
//var messageUrl = "http://localhost:3001"
//var messageUrl = "https://vsko-audit-broadcast-api-test.herokuapp.com/"
var messageUrl = "wss://vsko-audit-broadcast-api-test.herokuapp.com/"
var messageType = "/schools";

//var nrSockets = 5000;
var nrSockets = 500;
//var nrSockets = 50;


var sockets = [];
var messageCntr = [];
var connectCntr = [];
var disconnectCntr = [];



var connectSocketIO = function(i) {
	console.log("Trying to connect... (" + i + ")");

	//var socket = io( messageUrl, {forceNew: true} );
	var socket = io.connect( messageUrl, {'force new connection': true} );

	socket.on( 'connect', function ( ) {
		//console.log( "CONNECTED" );
		socket.emit('join', messageType);

		connectCntr[i]++;
	} );

	socket.on( 'disconnect', function ( ) {
		//console.log( "DISCONNECTED" );
		//console.log( "RECEIVED " + msgCounter[i] + " MSGS");
		disconnectCntr[i]++;
	} );

	socket.on('update',  function ( data ) {
		//console.log("New data arrived: " + data);
		messageCntr[i]++;
	} );

	return socket;
}


var openSockets = function(b) {
	var bunchSize = 1;
	for (i = b; (i < b+bunchSize) && (i < nrSockets); i++) {
		messageCntr[i] = 0
		connectCntr[i] = 0
		disconnectCntr[i] = 0
		sockets[i] = connectSocketIO(i)
		console.log("Got socket: " + sockets[i])
	}
	if (i < nrSockets) {
		console.log("Taking a break...")
		setTimeout(openSockets, 400, b+bunchSize);
	} else {
		console.log("Done launching sockets")
	}
}

openSockets(0);

process.on('SIGINT', function() {
  sockets.forEach(function(socket) {
  	//socket.close()
  	socket.disconnect()
  });
  var sum = function(a,b) { return a + b }
  var nrMsgs = messageCntr.reduce(sum, 0);
  var nrConnects = connectCntr.reduce(sum, 0);
  var nrDisconnects = disconnectCntr.reduce(sum, 0);

  console.log('')
  console.log('nrMsgs: '+ nrMsgs);
  console.log('nrConnects: '+ nrConnects);
  console.log('nrDisconnects: '+ nrDisconnects);
  process.exit()
});
