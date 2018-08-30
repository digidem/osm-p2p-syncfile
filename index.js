var IndexedTarball = require('indexed-tarball')
var tar = require('tar-stream')
var Osm = require('osm-p2p')
var path = require('path')
var once = require('once')
var fs = require('fs')
var readyify = require('./lib/readyify')

module.exports = Syncfile

function Syncfile (filepath, tmpdir, opts) {
  if (!(this instanceof Syncfile)) return new Syncfile(filepath, tmpdir, opts)

  this._tmpdir = tmpdir

  var self = this
  this._ready = readyify(function (done) {
    try {
      self.tarball = new IndexedTarball(filepath, opts)
      self._extractOsm(done)
    } catch (e) {
      done(e)
    }
  })
}

Syncfile.prototype.ready = function (cb) {
  this._ready(cb)
}

Syncfile.prototype.createMediaReplicationStream = function () {
  // TODO: if this._error, raise error on stream on next-tick
}

Syncfile.prototype.createDatabaseReplicationStream = function () {
  // TODO: if this._error, raise error on stream on next-tick
}

Syncfile.prototype._extractOsm = function (cb) {
  cb = once(cb)

  // 1. decide on tmp directory
  var tmpdir = path.join(this._tmpdir, 'osm-p2p-syncfile-' + Math.random().toString().substring(2))

  // 2. find p2p archive in db (last file) and decompress through tar-stream and finally to disk
  var rs = this.tarball.read('osm-p2p-db.tar')
  rs.on('error', cb)
  rs.pipe(fs.createWriteStream(tmpdir))

  // 3. open osm-p2p from fs
  // 4. tarball#pop the db off
  // 5. cb
}
