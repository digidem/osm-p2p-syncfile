var fs = require('fs')
var EventEmitter = require('events').EventEmitter
var inherits = require('inherits')
var IndexedTarball = require('indexed-tarball')

module.exports = Syncfile

function Syncfile (filepath, tmpdir, opts) {
  if (!(this instanceof Syncfile)) return new Syncfile(filepath, tmpdir, opts)

  this.tarball = new IndexedTarball(filepath, opts)

  process.nextTick(this.emit.bind(this, 'ready'))
}

inherits(Syncfile, EventEmitter)
