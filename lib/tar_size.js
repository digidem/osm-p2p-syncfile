var through2 = require('through2')
var pump = require('pump')
var tar = require('tar-fs')
var once = require('once')

module.exports = tarSize

function tarSize (filepath, cb) {
  cb = once(cb)
  var ws = sizeStream()
  ws.on('size', function (size) {
    cb(null, size)
  })
  pump(tar.pack(filepath), ws, function (err) {
    if (err) cb(err)
  })
}

function sizeStream () {
  var size = 0
  return through2(function (chunk, enc, next) {
    size += chunk.length
    next()
  }, function flush (next) {
    this.emit('size', size)
  })
}
