var _ = require('underscore'),
  net = require('net'),
  events = require('events'),
  util = require('util');

function Script(opts) {
  _.extend(this, {
    source: '',
    socket: '/tmp/sandcastle.sock',
    timeout: 5000,
    exited: false,
    sandcastle: null // the parent sandcastle executing this script.
  }, opts);
};

util.inherits(Script, events.EventEmitter);

Script.prototype.run = function(globals) {

  var _this = this;

  this.reset();

  this.timeoutId = setTimeout(function() {
    if (_this.exited) return;
    _this.exited = true;
    _this.sandcastle.kickOverSandCastle();
    _this.emit('timeout');
  }, this.timeout);

  this.createClient(globals);
};

Script.prototype.reset = function() {
  if (this.timeoutId) clearTimeout(this.timeoutId);
  this.exited = false;
};

Script.prototype.createClient = function(globals) {

  var _this = this;

  this.sandcastle.sandboxReady(function() {
    
    if (_this.exited) return;

    var client = net.createConnection(_this.socket, function() {
      client.write(JSON.stringify({
        source: _this.source,// the untrusted JS.
        sourceAPI: _this.sourceAPI,// the trusted API.
        globals: JSON.stringify(globals)// trusted global variables.
      }) + '\u9999'); // the chunk separator
    });

    client.on('close', function() {
      if (!_this.dataReceived) {
        setTimeout(function() {
          _this.createClient();
        }, 500);
      }
    });

    client.on('error', function(err) {
      setTimeout(function() {
        _this.createClient();
      }, 500);
    });

    var data = '';
    client.on('data', function(chunk) {
      _this.dataReceived = true;
      var chunk = chunk.toString();
      if ( chunk.charCodeAt( chunk.length - 1 ) !== 0) {
        data += chunk;
        // data is still incomplete
        return;
      } else {
        // append all but the separator
        data += chunk.substr( 0, chunk.length - 1 );
        client.end();
      }
      
      // process parsed data
      _this.onExit(data.toString());

      // reset data for the next data transfer
      data = '';
    });

  });
};

Script.prototype.onExit = function(data) {
  var _this = this,
    output = null,
    error = null;

  if (this.exited) return;
  this.exited = true;

  try {
    output = JSON.parse(data);
    if (output.error) {
      error = new Error(output.error.message);
      error.stack = output.error.stack;
      output = null;
    }
  } catch (e) {
    error = e;
  }

  this.emit('exit', error, output);
};

exports.Script = Script;