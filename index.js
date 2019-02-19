var IndexedTarball = require('indexed-tarball')
var itar = require('indexed-tarball-blob-store')
var tar = require('tar-fs')
var level = require('level')
var hyperlog = require('hyperlog')
var path = require('path')
var once = require('once')
var fs = require('fs')
var rimraf = require('rimraf')
var mkdirp = require('mkdirp')
var pump = require('pump')
var debug = require('debug')('osm-p2p-syncfile')
var readyify = require('./lib/readyify')

module.exports = Syncfile

// syncfile data format version
var VERSION = '2'
// used to identify indexed tarball as a syncfile
var TYPE = 'MAPEO-SYNCFILE'

var State = {
  INIT:    1,
  READY:   2,
  CLOSING: 3,
  CLOSED:  4
}

function Syncfile (filepath, tmpdir, opts) {
  if (!(this instanceof Syncfile)) return new Syncfile(filepath, tmpdir, opts)

  if (!tmpdir || typeof tmpdir !== 'string') throw new Error('must specify tmpdir to use')

  this._state = State.INIT

  var self = this
  this._ready = readyify(openAndInitialize)

  function openAndInitialize (cb) {
    var exists = fs.existsSync(filepath)
    var tarball = self.tarball = new IndexedTarball(filepath, opts)
    if (!exists) {
      tarball.userdata({ version: VERSION, type: TYPE, metadata: {} }, onOpen)
    } else {
      validateTarball(tarball, onOpen)
    }

    function onOpen (err) {
      if (err) return cb(err)
      var syncdir = path.join(tmpdir, 'osm-p2p-syncfile-' + Math.random().toString().substring(2))
      self._syncdir = syncdir
      mkdirp(syncdir, function (err) {
        if (err) return cb(err)
        extractHyperlog(tarball, syncdir, onExtract)
      })
    }

    function onExtract (err, log) {
      if (err) return cb(err)
      self.media = itar({ tarball: tarball })
      self.log = log
      self._state = State.READY
      cb()
    }
  }
}

Syncfile.prototype.ready = function (cb) {
  if (this._state === State.CLOSED || this._state === State.CLOSING) {
    return process.nextTick(cb, new Error('syncfile is closed'))
  }
  this._ready(cb)
}

Syncfile.prototype.userdata = function (data, cb) {
  if (!cb && typeof data === 'function') {
    cb = data
    data = null
  }
  var self = this
  if (this._state === State.INIT) {
    return this.ready(function (err) {
      if (err) return cb(err)
      self.userdata(data, cb)
    })
  }

  if (!data) {
    this.tarball.userdata(function (err, data) {
      if (err) return cb(err)
      cb(null, data.metadata || {})
    })
  } else {
    this.tarball.userdata({ version: VERSION, type: TYPE, metadata: data }, cb)
  }
}

Syncfile.prototype.close = function (cb) {
  if (this._state === State.CLOSED || this._state === State.CLOSING) {
    return process.nextTick(cb, new Error('syncfile is closed'))
  }
  var self = this
  if (this._state === State.INIT) {
    return this.ready(function (err) {
      if (err) return cb(err)
      self.close(cb)
    })
  }
  this._state = State.CLOSING
  var log = this.log
  this.log = undefined
  this.media = undefined

  log.db.close(function (err) {
    if (err) return cb(err)
    var ws = self.tarball.append('osm-p2p-log.tar', cleanup)
    tar.pack(self._syncdir).pipe(ws)
  })

  // clean up tmp dir
  function cleanup (err) {
    if (err) return cb(err)
    rimraf(self._syncdir, function (err) {
      if (err) return cb(err)
      this._state = State.CLOSED
      cb()
    })
  }
}

// Extract a hyperlog from an indexed tarball or create a new one, putting it in
// the dir `syncdir`
function extractHyperlog (tarball, syncdir, cb) {
  cb = once(cb)

  tarball.list(function (err, files) {
    if (err) return cb(err)
    if (files.indexOf('osm-p2p-log.tar') > -1) {
      extractLog(onExtract)
    } else if (files.indexOf('osm-p2p-db.tar') > -1) {
      // v1 put the whole osm folder in the sync file
      extractLogFromOsm(onExtract)
    } else {
      process.nextTick(onExtract)
    }
  })

  function extractLog (cb) {
    var rs = tarball.read('osm-p2p-log.tar')
    var ex = tar.extract(syncdir)
    pump(rs, ex, cb)
  }

  function extractLogFromOsm (cb) {
    var rs = tarball.read('osm-p2p-db.tar')
    // extract the `log/` folder to the syncdir.
    // this looks weird because in tar-fs map runs before ignore
    var ex = tar.extract(syncdir, {
      ignore: function (_, header) {
        return header.name.startsWith('IGNORE-')
      },
      map: function (header) {
        if (header.name.startsWith('log/')) {
          header.name = header.name.replace(/^log\//, '')
        } else {
          header.name = 'IGNORE-' + header.name
        }
      }
    })
    pump(rs, ex, cb)
  }

  function onExtract (err) {
    if (err) return cb(err)
    try {
      var db = level(syncdir)
      var log = hyperlog(db, { valueEncoding: 'json' })
      cb(null, log)
    } catch (err) {
      cb(err)
    }
  }
}

// Check this is actually a syncfile and is a version that we can read
function validateTarball (tarball, cb) {
  tarball.userdata(function (err, data) {
    if (err) return cb(err)
    data = data || {}
    if (data.version === '1.0.0') return upgradeFromV1(tarball, data, cb)
    if (data.type !== TYPE) return cb(new Error('File is not a mapeo syncfile'))
    if (data.version !== VERSION) return cb(new Error('Unknown syncfile version'))
    cb()
  })
}

// Very small breaking change, I don't think we have any syncfiles actually out
// in the wild right now. But v2 also only stores the hyperlog, not the whole
// osm folder with the indexes
function upgradeFromV1 (tarball, data, cb) {
  var v2Userdata = {
    version: VERSION,
    type: TYPE,
    medatadata: data.syncfile || {}
  }
  tarball.userdata(v2Userdata, cb)
}
