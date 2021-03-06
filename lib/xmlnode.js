var Transform = require('stream').Transform;
var util = require('util');
var sax = require('sax');
var elem = require('./elem');
var debug = require('debug')('sax-stream');

module.exports = XmlNode;

function XmlNode(options) {
  if (!(this instanceof XmlNode)) {
    return new XmlNode(options);
  }

  Transform.call(this, {
    highWaterMark: options.highWaterMark || 350,
    objectMode: true
  });
  this.records = [];
  this.error = null;
  this.parser = this.createSaxParser(options);
}

util.inherits(XmlNode, Transform);

XmlNode.prototype.createSaxParser = function (options) {

  var self = this,
  record,
  currentTag,
  parser = sax.parser(options.strict || false, prepareParserOptions(options));

  var matchesCurrentTag;
  if (Array.isArray(options.tag)) {
      matchesCurrentTag = function(record, tag, isCloseTag) {
          return options.tag.indexOf(tag) !== -1 && (!isCloseTag || currentTag === tag);
      };
  } else {
      matchesCurrentTag = function(record, tag, isCloseTag) {
          return options.tag === tag && (!isCloseTag || !record.parent);
      };
  }

  parser.onopentag = function(node) {
    debug('Open "%s"', node.name);
    if (record) {
      record = elem.addChild(record, node.name);
    }
    else if (matchesCurrentTag(record, node.name, false)) {
      record = {};
      currentTag = node.name;
    }
    if (record && Object.keys(node.attributes).length) {
      record.attribs = node.attributes;
    }
  };

  parser.onclosetag = function(tag) {
    debug('Closed "%s"', tag);
    if (matchesCurrentTag(record, tag, true)) {
      debug('Emitting record', record);
      self.records.push({
          tag: currentTag,
          record: record
      });
      currentTag = undefined;
      record = undefined;
    } else if (record) {
      record = record.parent;
    }
  };

  parser.ontext = function(value) {
    if (record) {
      elem.addText(record, value);
    }
  };

  parser.oncdata = function (value) {
    if (record) {
      elem.concatText(record, value);
    }
  };

  parser.onerror = function(err) {
    self.error = err;
  };

  parser.onend = function() {
    debug('onend - flushing remaining items');
    self.pushAll(self.callback);
    self.callback = null;
  };

  return parser;
};

XmlNode.prototype.pushAll = function (callback) {
  if (this.error) {
    callback(this.error);
    this.error = null;
    return;
  }
  debug('pushing %d', this.records.length);
  this.records.forEach(this.push.bind(this));
  this.records.length = 0;
  callback();
};

XmlNode.prototype._transform = function (chunk, encoding, callback) {
  this.parser.write(chunk.toString());
  this.pushAll(callback);
};

XmlNode.prototype._flush = function (callback) {
  var self = this;
  self.callback = callback;
  self.parser.close();
};

function prepareParserOptions(options) {
  return [
    'trim',
    'normalize',
    'lowercase',
    'xmlns',
    'position',
    'strictEntities',
    'noscript'
  ].reduce(function(opts, name) {
    if (name in options) {
      opts[name] = options[name];
    }
    return opts;
  }, {
    position: false
  });
}
