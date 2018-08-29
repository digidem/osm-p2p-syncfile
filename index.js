var fs = require('fs')
var EventEmitter = require('events').EventEmitter
var inherits = require('inherits')

module.exports = Syncfile

function Syncfile (filepath, tmpdir, opts) {
  if (!(this instanceof Syncfile)) return new Syncfile(filepath, tmpdir, opts)

  if (!fs.existsSync(filepath)) {
    // touch file
    fs.writeFileSync(filepath, '', 'utf8')
  }

  process.nextTick(this.emit.bind(this, 'ready'))
}

inherits(Syncfile, EventEmitter)
