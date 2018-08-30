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

var State = {
  INIT:   1,
  READY:  2,
  ERROR:  3,
  CLOSED: 4
}

function Syncfile (filepath, tmpdir, opts) {
  if (!(this instanceof Syncfile)) return new Syncfile(filepath, tmpdir, opts)

  this._state = State.INIT
  this._tmpdir = tmpdir

  var self = this
  this._ready = readyify(function (done) {
    try {
      self.tarball = new IndexedTarball(filepath, opts)
      self._extractOsm(function (err) {
        if (err) {
          self._state = State.ERROR
          self._error = err
          done(err)
        } else {
          self._state = State.READY
          done()
        }
      })
    } catch (e) {
      self._state = State.ERROR
      self._error = e
      done(e)
    }
  })
}

Syncfile.prototype.ready = function (cb) {
  if (this._state === State.CLOSED) return process.nextTick(cb, new Error('syncfile is closed'))
  else this._ready(cb)
}

Syncfile.prototype.createMediaReplicationStream = function () {
  var t = through()

  switch (this._state) {
    case State.INIT:
      process.nextTick(t.emit.bind(t, 'error', new Error('syncfile is still opening')))
      return t
    case State.ERROR:
      process.nextTick(t.emit.bind(t, 'error', this._error))
      return t
    case State.CLOSED:
      process.nextTick(t.emit.bind(t, 'error', new Error('syncfile is closed')))
      return t
  }

  return t
}

Syncfile.prototype.createDatabaseReplicationStream = function () {
  var t = through()

  switch (this._state) {
    case State.INIT:
      process.nextTick(t.emit.bind(t, 'error', new Error('syncfile is still opening')))
      return t
    case State.ERROR:
      process.nextTick(t.emit.bind(t, 'error', this._error))
      return t
    case State.CLOSED:
      process.nextTick(t.emit.bind(t, 'error', new Error('syncfile is closed')))
      return t
  }

  return t
}

Syncfile.prototype.close = function (cb) {
  switch (this._state) {
    case State.INIT:
      process.nextTick(cb, new Error('syncfile is still opening'))
      return
    case State.ERROR:
      process.nextTick(cb, this._error)
      return
    case State.CLOSED:
      process.nextTick(cb, new Error('syncfile is already closed'))
      return
  }

  this._state = State.CLOSED
  rimraf(this._tmpdir, cb)
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
    // find p2p archive in db (last file) and decompress through tar-stream
    // and finally to disk
    var rs = this.tarball.read('osm-p2p-db.tar')
    rs.on('error', cb)
    // TODO: pipe into tar-stream#extract and then pipe that to a directory(?)
  }

  function openDb (err) {
    if (err) return cb(err)
    cb()
    // 3. open osm-p2p from fs
    // 4. tarball#pop the db off
    // 5. cb
  }
}
