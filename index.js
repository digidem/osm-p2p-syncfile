var IndexedTarball = require('indexed-tarball')
var tar = require('tar-stream')
var Osm = require('osm-p2p')
var path = require('path')
var once = require('once')
var fs = require('fs')
var through = require('through2')
var rimraf = require('rimraf')
var mkdirp = require('mkdirp')
var readdirp = require('readdirp')
var pump = require('pump')
var readyify = require('./lib/readyify')

module.exports = Syncfile

var State = {
  INIT:    1,
  READY:   2,
  ERROR:   3,
  CLOSING: 4,
  CLOSED:  5
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
  else if (this._state === State.CLOSING) return process.nextTick(cb, new Error('syncfile is closed'))
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
    case State.CLOSING:
      process.nextTick(t.emit.bind(t, 'error', new Error('syncfile is closed')))
      return t
  }

  return t
}

Syncfile.prototype.createDatabaseReplicationStream = function () {
  var t

  switch (this._state) {
    case State.INIT:
      t = through()
      process.nextTick(t.emit.bind(t, 'error', new Error('syncfile is still opening')))
      return t
    case State.ERROR:
      t = through()
      process.nextTick(t.emit.bind(t, 'error', this._error))
      return t
    case State.CLOSED:
      t = through()
      process.nextTick(t.emit.bind(t, 'error', new Error('syncfile is closed')))
      return t
    case State.CLOSING:
      process.nextTick(t.emit.bind(t, 'error', new Error('syncfile is closed')))
      return t
  }

  return this._osm.log.replicate({live: false})
}

Syncfile.prototype.close = function (cb) {
  cb = once(cb)

  var self = this

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
    case State.CLOSING:
      process.nextTick(cb, new Error('syncfile is already closed'))
      return t
  }

  this._state = State.CLOSING

  this._osm.ready(function () {
    // re-pack syncfile p2p-db dir into tarball
    var tarPath = path.join(self._syncdir, 'osm-p2p-db.tar')
    var tarSize = 0
    var tcount = through(function (chunk, _, next) { tarSize += chunk.length; next(null, chunk) })

    // 1. create new tar.pack() stream, to be piped to fs.createWriteStream inside self._syncdir
    var pack = tar.pack()

    // 2. recursively walk files in self._syncdir (skip new tar file)
    var rd = readdirp({root: path.join(self._syncdir, 'osm')})

    // 3. write all to the tar file
    var twrite = through.obj(function (file, _, next) {
      if (file.path === 'osm-p2p-db.tar') return next()
      console.log('file', file.fullPath, file.stat.size)
      var entry = pack.entry({ name: file.path, size: file.stat.size }, function (err) {
        console.log('wrote', file.path)
        if (err) return next(err)
        else next()
      })
      pump(fs.createReadStream(file.fullPath), entry)
    })

    // 4. pipe them together
    pump(rd, twrite, function (err) {
      console.log('finalizing')
      if (!err) pack.finalize()
      else cb(err)
    })
    pump(pack, tcount, fs.createWriteStream(tarPath), function (err) {
      if (err) return cleanup(err)

      console.log('done', tarSize)

      // 5. write tar file to self.tarball.append()
      self.tarball.append('osm-p2p-db.tar', fs.createReadStream(tarPath), tarSize, cleanup)
    })
  })

  // clean up tmp dir
  function cleanup (err) {
    self._osm.close(function (err2) {
      rimraf(self._syncdir, function (err3) {
        err = err || err2 || err3
        cb(err)
      })
    })
  }
}

Syncfile.prototype._extractOsm = function (cb) {
  cb = once(cb)
  var self = this

  // 1. decide on tmp directory
  var syncdir = path.join(this._tmpdir, 'osm-p2p-syncfile-' + Math.random().toString().substring(2))
  this._syncdir = syncdir

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
    mkdirp(syncdir, openDb)
  }

  function existingDb () {
    // find p2p archive in db (last file) and decompress through tar-stream
    // and finally to disk
    var rs = this.tarball.read('osm-p2p-db.tar')
    rs.on('error', cb)
    // TODO: pipe into tar-stream#extract and then pipe that to a directory(?)
    // TODO: tarball#pop the db off
  }

  function openDb (err) {
    if (err) return cb(err)
    self._osm = Osm(path.join(syncdir, 'osm'))
    self._osm.ready(cb)
  }
}
