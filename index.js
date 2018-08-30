var IndexedTarball = require('indexed-tarball')
var tar = require('tar-stream')
var Osm = require('osm-p2p')
var path = require('path')
var once = require('once')
var fs = require('fs')
var through = require('through2')
var rimraf = require('rimraf')
var mkdirp = require('mkdirp')
var readyify = require('./lib/readyify')

module.exports = Syncfile

function Syncfile (filepath, tmpdir, opts) {
  if (!(this instanceof Syncfile)) return new Syncfile(filepath, tmpdir, opts)

  this._tmpdir = tmpdir
  this._closed = false

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
  var t = through()
  if (this._closed) {
    process.nextTick(t.emit.bind(t, 'error', new Error('syncfile is already closed')))
    return t
  }
  if (this._ready.error) {
    process.nextTick(t.emit.bind(t, 'error', this._ready.error))
    return t
  }
  if (!this._ready.ready) {
    process.nextTick(t.emit.bind(t, 'error', new Error('syncfile is not ready yet; use the syncfile.ready(cb) API')))
    return t
  }
  return t
}

Syncfile.prototype.createDatabaseReplicationStream = function () {
  var t = through()
  if (this._closed) {
    process.nextTick(t.emit.bind(t, 'error', new Error('syncfile is already closed')))
    return t
  }
  if (this._ready.error) {
    process.nextTick(t.emit.bind(t, 'error', this._ready.error))
    return t
  }
  if (!this._ready.ready) {
    process.nextTick(t.emit.bind(t, 'error', new Error('syncfile is not ready yet; use the syncfile.ready(cb) API')))
    return t
  }
  return t
}

Syncfile.prototype.close = function (cb) {
  if (this._closed) return cb(new Error('syncfile is already closed'))
  if (this._ready.error) return cb(this._ready.error)
  var self = this
  this._ready(function (err) {
    if (err) return cb(err)
    self._closed = true
    rimraf(self._tmpdir, cb)
  })
}

Syncfile.prototype._extractOsm = function (cb) {
  cb = once(cb)

  // 1. decide on tmp directory
  var tmpdir = path.join(this._tmpdir, 'osm-p2p-syncfile-' + Math.random().toString().substring(2))
  this._tmpdir = tmpdir

  // 2. check if p2p db exists in archive
  this.tarball.list(function (err, files) {
    if (err) return cb(err)
    if (files.indexOf('osm-p2p-db.tar') === -1) {
      freshDb()
    } else {
      existingDb()
    }
  })

  function freshDb () {
    mkdirp(tmpdir, openDb)
  }

  function existingDb () {
    // 3. find p2p archive in db (last file) and decompress through tar-stream
    // and finally to disk
    var rs = this.tarball.read('osm-p2p-db.tar')
    rs.on('error', cb)
    rs.pipe(fs.createWriteStream(tmpdir, openDb))
  }

  function openDb (err) {
    if (err) return cb(err)
    cb()
    // 3. open osm-p2p from fs
    // 4. tarball#pop the db off
    // 5. cb
  }
}
