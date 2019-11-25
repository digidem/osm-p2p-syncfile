var IndexedTarball = require('indexed-tarball')
var itar = require('indexed-tarball-blob-store')
var bsrs = require('blob-store-replication-stream')
var tar = require('tar-stream')
var multifeed = require('multifeed')
var hypercore = require('hypercore')
var path = require('path')
var once = require('once')
var fs = require('fs')
var through = require('through2')
var rimraf = require('rimraf')
var mkdirp = require('mkdirp')
var readdirp = require('readdirp')
var pump = require('pump')
var debug = require('debug')('osm-p2p-syncfile')
var readyify = require('./lib/readyify')
var repair = require('indexed-tarball/lib/integrity').repair

module.exports = Syncfile

var noop = function () {}

// syncfile data format version
var VERSION = '2.0.0'

var State = {
  INIT:    1,
  READY:   2,
  ERROR:   3,
  CLOSING: 4,
  CLOSED:  5
}

function Syncfile (filepath, tmpdir, opts) {
  if (!(this instanceof Syncfile)) return new Syncfile(filepath, tmpdir, opts)

  if (!tmpdir || typeof tmpdir !== 'string') throw new Error('must specify tmpdir to use')

  this._state = State.INIT
  this._tmpdir = tmpdir

  opts = opts || {}
  this._encryptionKey = opts.encryptionKey

  var self = this
  this._ready = readyify(function (done) {
    if (opts.autorepair) {
      repair(filepath, function (err, res) {
        if (err) {
          self._state = State.ERROR
          self._error = err
          return done(err)
        }
        self._open(filepath, tmpdir, opts, done)
      })
    } else {
      self._open(filepath, tmpdir, opts, done)
    }
  })
}

Syncfile.prototype._open = function (filepath, tmpdir, opts, cb) {
  var self = this
  try {
    var exists = fs.existsSync(filepath)
    self.tarball = new IndexedTarball(filepath, opts)
    if (!exists) {
      self.tarball.userdata({version: VERSION, syncfile: {}}, extract)
    } else {
      extract()
    }

    function extract (err) {
      if (err) {
        self._state = State.ERROR
        self._error = err
        cb(err)
        return
      }
      self._extractOsm(function (err) {
        if (err) {
          self._state = State.ERROR
          self._error = err
          cb(err)
        } else {
          self._state = State.READY
          cb()
        }
      })
    }
  } catch (e) {
    self._state = State.ERROR
    self._error = e
    cb(e)
  }
}

Syncfile.prototype.ready = function (cb) {
  if (this._state === State.CLOSED) return process.nextTick(cb, new Error('syncfile is closed'))
  else if (this._state === State.CLOSING) return process.nextTick(cb, new Error('syncfile is closed'))
  else this._ready(cb)
}

Syncfile.prototype.userdata = function (data, cb) {
  if (!cb && typeof data === 'function') {
    cb = data
    data = null
  }

  if (this._state !== State.READY) {
    return cb(new Error('syncfile is not ready'))
  }

  if (!data) {
    this.tarball.userdata(function (err, data) {
      if (err) return cb(err)
      cb(null, data.syncfile || {})
    })
  } else {
    this.tarball.userdata({version: VERSION, syncfile: data}, cb)
  }
}

Syncfile.prototype.close = function (cb) {
  cb = once(cb)

  var self = this

  if (this._state !== State.READY) {
    process.nextTick(cb, this._createReadyError())
  }

  this._state = State.CLOSING
  var mfeed = this._mfeed
  this._mfeed = undefined
  this.media = undefined

  mfeed.ready(function () {
    // re-pack syncfile multifeed dir into tarball
    var tarPath = path.join(self._syncdir, 'osm-p2p-db.tar')
    var tarSize = 0
    var tcount = through(function (chunk, _, next) { tarSize += chunk.length; next(null, chunk) })

    // 1. create new tar.pack() stream, to be piped to fs.createWriteStream inside self._syncdir
    var pack = tar.pack()

    // 2. recursively walk files in self._syncdir (skip new tar file)
    var rd = readdirp({root: path.join(self._syncdir, 'multifeed')})

    // 3. write all to the tar file
    var twrite = through.obj(function (file, _, next) {
      if (file.path === 'osm-p2p-db.tar') return next()
      debug('file', file.fullPath, file.stat.size)
      var entry = pack.entry({ name: file.path, size: file.stat.size }, function (err) {
        debug('wrote', file.path)
        if (err) return next(err)
        else next()
      })
      pump(fs.createReadStream(file.fullPath), entry)
    })

    // 4. pipe them together
    pump(rd, twrite, function (err) {
      debug('finalizing')
      if (!err) pack.finalize()
      else cleanup(err)
    })
    pump(pack, tcount, fs.createWriteStream(tarPath), function (err) {
      if (err) return cleanup(err)

      debug('done', tarPath, tarSize)

      // 5. write tar file to self.tarball.append()
      fs.createReadStream(tarPath)
        .pipe(self.tarball.append('osm-p2p-db.tar', cleanup))
    })
  })

  // clean up tmp dir
  function cleanup (err) {
    mfeed.close(function (err2) {
      rimraf(self._syncdir, function (err3) {
        err = err || err2 || err3
        cb(err)
      })
    })
  }
}

Syncfile.prototype.replicateData = function (opts) {
  if (this._state !== State.READY) throw this._createReadyError()
  return this._mfeed.replicate(opts)
}

Syncfile.prototype.replicateMedia = function () {
  if (this._state !== State.READY) throw this._createReadyError()
  return bsrs(this._media)
}

Syncfile.prototype._createReadyError = function () {
  switch (this._state) {
    case State.INIT:
      return new Error('Syncfile is not ready, call syncfile.ready() before trying to replicate')
    case State.ERROR:
      return new Error(this._error || 'Unknown error')
    case State.CLOSING:
    case State.CLOSED:
      return new Error('Syncfile is closed.')
    default:
      return new Error('Syncfile is in unknown state')
  }
}

Syncfile.prototype._extractOsm = function (cb) {
  cb = once(cb)
  var self = this

  // 1. decide on tmp directory
  var syncdir = path.join(this._tmpdir, 'osm-p2p-syncfile-' + Math.random().toString().substring(2))
  this._syncdir = syncdir

  // 2. create tmp sync dir
  mkdirp(syncdir, function (err) {
    if (err) return cb(err)

    // 3. check if p2p db exists in archive
    self.tarball.list(function (err, files) {
      if (err) return cb(err)
      if (files.indexOf('osm-p2p-db.tar') === -1) {
        setupVars()
      } else {
        existingDb()
      }
    })
  })

  function existingDb () {
    // find p2p archive in db (last file) and decompress through tar-stream
    // and finally to disk
    var rs = self.tarball.read('osm-p2p-db.tar')
    rs.on('error', cb)

    // TODO(noffle): wrap this in a helper function: extract-tar-to-fs
    var ex = tar.extract()

    pump(rs, ex, function (err) {
      debug('tar stream finish')
      if (err) cb(err)
      else self.tarball.pop(setupVars)
    })

    ex.on('entry', function (header, stream, next) {
      debug('extracting', header.name)
      mkdirp(path.dirname(path.join(syncdir, 'multifeed', header.name)), function (err) {
        if (err) return next(err)
        var ws = fs.createWriteStream(path.join(syncdir, 'multifeed', header.name))
        pump(stream, ws, function (err) {
          debug('extracted', header.name)
          next(err)
        })
      })
    })
  }

  function setupVars (err) {
    if (err) return cb(err)
    self._mfeed = multifeed(hypercore, path.join(syncdir, 'multifeed'), {
      valueEncoding: 'json',
      encryptionKey: self._encryptionKey
    })
    self._media = itar({tarball: self.tarball})
    self._mfeed.ready(cb)
  }
}
