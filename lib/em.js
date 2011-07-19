
var EventEmitter2 = exports.EventEmitter2 = function(conf) {
  this.setConf(conf);
  this.init();
};

EventEmitter2.prototype.init = function() {
  this._events = new Object;
  this.defaultMaxListeners = 10;
};

var isArray = Array.isArray;

// By default EventEmitters will print a warning if more than
// 10 listeners are added to it. This is a useful default which
// helps finding memory leaks.
//
// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.

EventEmitter2.prototype.setConf = function(conf) {
  this.wildcard = conf && conf.wildcard;
  this.verbose = conf && conf.verbose;
  
  if(this.wildcard) {
    this.listenerTree = new Object;
  }
};

EventEmitter2.prototype.setMaxListeners = function(n) {
  this._events || this.init();
  this._events.maxListeners = n;
};

EventEmitter2.prototype.delimiter = '.';

EventEmitter2.prototype.verbose = false;

var wildcard = function(handlers, type, tree, i) {
  for(var branch in tree) {
    if(tree.hasOwnProperty(branch)) {
      searchListenerTree(handlers, type, tree[branch], i);
    }
  }
}

var searchListenerTree = function(handlers, type, tree, i) {

  if(i === type.length) { 
    if(typeof tree === 'function') {
      handlers.push(tree);
    }
    else {
      handlers = handlers.concat(tree);
    }
  }

  if(type[i]) {
    if(type[i] === '*') {
      wildcard(handlers, type, tree, i+1);
    }
    else {
      searchListenerTree(handlers, type, tree[type[i]], i+1);
    }
  }
};

var growListenerTree = function(type, listener) {

  var d = this.delimiter;

  if (type.charAt(0) === d) {
    this.emit('error', 'bad event name');
  }

  if(type.charAt(type.length-1) === d) {
    this.emit('error', 'bad event name');
  }
  
  type = type.split(d);

  var tree = this.listenerTree;
  var name = type.shift();

  while (name) {

    if (!tree[name]) {
      tree[name] = {};
    }

    tree = tree[name];    


    if (type.length === 0) {

      if (!tree['__listeners']) {
        tree['__listeners'] = listener;
      }
      else if('function' === typeof tree['__listeners']) {
        tree['__listeners'] = [tree['__listeners'], listener];
      }
      else if (isArray(tree['__listeners'])) {

        tree['__listeners'].push(listener);

        if (!tree['__listeners'].warned) {

          var m = this.defaultMaxListeners;

          if (m > 0 && tree['__listeners'].length > m) {

            tree['__listeners'].warned = true;
            console.error('(node) warning: possible EventEmitter memory ' +
                          'leak detected. %d listeners added. ' +
                          'Use emitter.setMaxListeners() to increase limit.',
                          tree['__listeners'].length);
            console.trace();
          }
        }
      }
      
      return true;
    }

    name = type.shift();
  }
  
  return true;

};

EventEmitter2.prototype.once = function(event, fn) {
  this.many(event, 1, fn);
  return this;
};

EventEmitter2.prototype.many = function(event, ttl, fn) {
  var self = this;

  //
  // If *fn* is not a function throw an error. An *fn* that is not a function
  // can not be invoked when an event is emitted and therefor is not allowed
  // to be added.
  //
  if (typeof fn !== 'function') {
    throw new Error('many only accepts instances of Function');
  }

  function listener() {
    if (--ttl == 0) {
      self.un(event, listener);
    }
    fn.apply(null, arguments);
  };

  listener._origin = fn;

  this.on(event, listener);

  return self;
};

EventEmitter2.prototype.emit = function() {

  var type = arguments[0];
  // If there is no 'error' event listener then throw.

  if (type === 'newListener') {
    if(!this._events.newListener) { return false; }
  }

  else if (type === 'error') {
    if (this._events.error && 'function' !== typeof this._events.error) {
      if (arguments[1] instanceof Error) {
        throw arguments[1]; // Unhandled 'error' event
      } else {
        throw new Error("Uncaught, unspecified 'error' event.");
      }
      return false;
    }
  }

  var handler = this._events[type];

  if(this.wildcard) {
    for (var i = type.length - 1; i >= 0; i--) { // performance indexOf
      if(type[i] === '*') {
        //handler = [];
        //growListenerTree.call(this, type, handler);
        break;
      }
    }
  }

  if ('function' === typeof handler) {

    if(arguments.length === 1) {
      handler.call(this);
    }
    else if(arguments.length > 1)
      switch (arguments.length) {
        case 2:
          handler.call(this, arguments[1]);
          break;
        case 3:
          handler.call(this, arguments[1], arguments[2]);
          break;
        // slower
        default:
          var l = arguments.length;
          var args = new Array(l - 1);
          for (var i = 1; i < l; i++) args[i - 1] = arguments[i];
          handler.apply(this, args);
      }
    return true;
  } 
  else if (handler) {
    
    var l = arguments.length;
    var args = new Array(l - 1);
    for (var i = 1; i < l; i++) args[i - 1] = arguments[i];

    var listeners = handler.slice();
    for (var i = 0, l = listeners.length; i < l; i++) {
      listeners[i].apply(this, args);
    }
    return true;

  }
};

//
// EventEmitter is defined in src/node_events.cc
// EventEmitter.prototype.emit() is also defined there.
//
EventEmitter2.prototype.on = function(type, listener) {

  this._events || this.init();

  // To avoid recursion in the case that type == "newListeners"! Before
  // adding it to the listeners, first emit "newListeners".
  this.emit('newListener', type, listener);

  if(this.wildcard) {
    for (var i = type.length - 1; i >= 0; i--) { // performance indexOf
      if(type[i] === this.delimiter) {
        growListenerTree.call(this, type, listener);
        break;
      }
    }    
  }

  if (!this._events[type]) {
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  }
  else if('function' === typeof this._events[type]) {
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];
  }
  else if (isArray(this._events[type])) {
    // If we've already got an array, just append.
    this._events[type].push(listener);

    // Check for listener leak
    if (!this._events[type].warned) {

      var m;
      if (this._events.maxListeners !== undefined) {
        m = this._events.maxListeners;
      } else {
        m = this.defaultMaxListeners;
      }

      if (m && m > 0 && this._events[type].length > m) {

        this._events[type].warned = true;
        console.error('(node) warning: possible EventEmitter memory ' +
                      'leak detected. %d listeners added. ' +
                      'Use emitter.setMaxListeners() to increase limit.',
                      this._events[type].length);
        console.trace();
      }
    }
  }

  return this;
};

EventEmitter2.prototype.addListener = EventEmitter2.prototype.on;

EventEmitter2.prototype.un = function(type, listener) {
  if ('function' !== typeof listener) {
    throw new Error('removeListener only takes instances of Function');
  }

  // does not use listeners(), so no side effect of creating _events[type]
  if (!this._events[type]) return this;

  var list = this._events[type];

  if (isArray(list)) {
    var position = -1;
    for (var i = 0, length = list.length; i < length; i++) {
      if (list[i] === listener ||
        (list[i].listener && list[i].listener === listener) ||
        (list[i]._origin && list[i]._origin === listener)) {
        position = i;
        break;
      }
    }

    if (position < 0) return this;
    list.splice(position, 1);
    if (list.length == 0)
      delete this._events[type];
  } else if (list === listener ||
    (list.listener && list.listener === listener) ||
    (list._origin && list._origin === listener)) {
    delete this._events[type];
  }

  return this;
};

EventEmitter2.prototype.removeListener = EventEmitter2.prototype.un;

EventEmitter2.prototype.removeAllListeners = function(type) {
  if (arguments.length === 0) {
    this._events || this.init();
    return this;
  }

  // does not use listeners(), so no side effect of creating _events[type]
  if (type && this._events && this._events[type]) this._events[type] = null;
  return this;
};

EventEmitter2.prototype.listeners = function(type) {
  this._events || this.init();
  if (!this._events[type]) this._events[type] = [];
  if (!isArray(this._events[type])) {
    this._events[type] = [this._events[type]];
  }
  return this._events[type];
};