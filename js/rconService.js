function RconService() {

  var ConnectionStatus = {
    'CONNECTING': 0,
    'OPEN': 1,
    'CLOSING': 2,
    'CLOSED': 3
  };

  var Service = {
    Socket: null,
    Address: null,
    Callbacks: {}
  };

  var LastIndex = 1001;

  function clearCallback(identifier) {
    var cb = Service.Callbacks[identifier];
    if (cb && cb.timeout) {
      clearTimeout(cb.timeout);
    }
    if (cb && cb.destroyListener) {
      cb.destroyListener();
    }
    delete Service.Callbacks[identifier];
  }

  function clearCallbacks() {
    for (var identifier in Service.Callbacks) {
      if (Service.Callbacks.hasOwnProperty(identifier)) {
        clearCallback(identifier);
      }
    }
    Service.Callbacks = {};
  }

  function closeSocket(socket) {
    if (!socket)
      return;

    socket.onopen = null;
    socket.onmessage = null;
    socket.onclose = null;
    socket.onerror = null;

    if (socket.readyState === ConnectionStatus.CONNECTING || socket.readyState === ConnectionStatus.OPEN) {
      socket.close();
    }
  }

  Service.Connect = function(addr, pass) {
    closeSocket(this.Socket);
    clearCallbacks();

    this.Socket = new WebSocket("ws://" + addr + "/" + pass);
    this.Address = addr;

    var socket = this.Socket;

    this.Socket.onmessage = function(e) {
      var data = angular.fromJson(e.data);

      //
      // This is a targetted message, it has an identifier
      // So feed it back to the right callback.
      //
      if (data.Identifier > 1000) {
        var cb = Service.Callbacks[data.Identifier];
        clearCallback(data.Identifier);

        if (cb != null) {
          cb.scope.$apply(function() {
            cb.callback(data);
          });
        }

        return;
      }

      //
      // Generic console message, let OnMessage catch it
      //
      if (Service.OnMessage != null) {
        Service.OnMessage(data);
      }
    };

    this.Socket.onopen = function(ev) {
      if (Service.OnOpen != null) {
        Service.OnOpen(ev);
      }
    };

    this.Socket.onclose = function(ev) {
      if (Service.Socket === socket) {
        Service.Socket = null;
        clearCallbacks();
      }

      if (Service.OnClose != null) {
        Service.OnClose(ev);
      }
    };

    this.Socket.onerror = function(ev) {
      if (Service.OnError != null) {
        Service.OnError(ev);
      }
    };
  }

  Service.Disconnect = function() {
    if (this.Socket) {
      this.Socket.close();
      this.Socket = null;
    }

    clearCallbacks();
  }

  Service.Command = function(msg, identifier) {
    if (this.Socket === null)
      return false;

    if (!this.IsConnected())
      return false;

    if (identifier == null)
      identifier = -1;

    var packet = {
      Identifier: identifier,
      Message: msg,
      Name: "WebRcon"
    };

    this.Socket.send(JSON.stringify(packet));
    return true;
  };

  //
  // Make a request, call this function when it returns
  //
  Service.Request = function(msg, scope, callback) {
    if (!this.IsConnected())
      return false;

    LastIndex++;
    var identifier = LastIndex;

    var request = {
      scope: scope,
      callback: callback,
      timeout: setTimeout(function() {
        clearCallback(identifier);
      }, 30000)
    };

    if (scope && typeof scope.$on === 'function') {
      request.destroyListener = scope.$on("$destroy", function() {
        clearCallback(identifier);
      });
    }

    this.Callbacks[LastIndex] = request;

    if (!Service.Command(msg, LastIndex)) {
      clearCallback(LastIndex);
      return false;
    }

    return true;
  }

  //
  // Returns true if websocket is connected
  //
  Service.IsConnected = function() {
    if (this.Socket == null)
      return false;

    return this.Socket.readyState === ConnectionStatus.OPEN;
  }

  //
  // Helper for installing connectivity logic
  //
  // Basically if not connected, call this function when we are
  // And if we are - then call it right now.
  //
  Service.InstallService = function(scope, func) {
    scope.$on("OnConnected", function() {
      func();
    });

    if (this.IsConnected()) {
      func();
    }
  }

  Service.getPlayers = function(scope, success) {
    this.Request("playerlist", scope, function(response) {
      var players = JSON.parse(response.Message);

      if (typeof success === 'function') {
        success.call(scope, players);
      }
    });
  }

  return Service;
}
