var test = require('tape')
var path = require('path')
var tmp = require('tmp')
var multifeed = require('multifeed')
var hypercore = require('hypercore')
var eos = require('end-of-stream')
var pump = require('pump')
var ram = require('random-access-memory')
var blob = require('abstract-blob-store')
var blobReplicate = require('blob-store-replication-stream')
var collect = require('collect-stream')
var fs = require('fs')
var parallel = require('run-parallel-limit')
var fsblob = require('safe-fs-blob-store')
var Syncfile = require('..')

blob.prototype._list = function (cb) {
  return process.nextTick(cb, null, Object.keys(this.data))
}

test('try to replicate before ready', function (t) {
  t.plan(3)

  tmp.dir(function (err, dir, cleanup) {
    t.error(err)

    var filepath = path.join(dir, 'sync.tar')
    var syncfile = Syncfile(filepath, dir)

    t.throws(syncfile.replicateData, 'replicateData() throws when not ready')
    t.throws(syncfile.replicateMedia, 'replicateMedia() throws when not ready')
  })
})

test('try to replicate after close', function (t) {
  t.plan(3)

  tmp.dir(function (err, dir, cleanup) {
    t.error(err)

    var filepath = path.join(dir, 'sync.tar')
    var syncfile = Syncfile(filepath, dir)
    syncfile.ready(function () {
      syncfile.close(onClose)
    })

    function onClose () {
      t.throws(syncfile.replicateData, 'replicateData() throws when closed')
      t.throws(syncfile.replicateMedia, 'replicateMedia() throws when closed')
    }
  })
})

test('replicate media + osm-p2p to syncfile', function (t) {
  tmp.dir(function (err, dir, cleanup) {
    t.error(err)

    var mfeed = multifeed(hypercore, ram, { valueEncoding: 'json' })
    var media = blob()
    var syncfile
    var node = { type: 'node', lat: 1, lon: 2 }

    mfeed.writer('default', function (err, w) {
      t.error(err)
      w.append(node, function (err) {
        t.error(err)
        setup()
      })
    })

    function setup () {
      var filepath = path.join(dir, 'sync.tar')
      syncfile = Syncfile(filepath, dir)
      syncfile.ready(addMedia)
    }

    function addMedia (err) {
      t.error(err, 'syncfile setup ok')
      media.createWriteStream('river.jpg', sync)
        .end('<IMG DATA>')
    }

    function sync (err) {
      t.error(err, 'add media ok')
      var d = syncfile.replicateData({live: false})
      var r = mfeed.replicate({live: false})
      replicate(r, d, function (err) {
        t.error(err, 'replicate osm ok')
        var d = syncfile.replicateMedia()
        var r = blobReplicate(media)
        replicate(d, r, check)
      })
    }

    function check (err) {
      t.error(err, 'replicate media ok')

      syncfile._mfeed.feeds()[0].get(0, {wait:false}, function (err, res) {
        t.error(err, 'get ok')
        t.deepEquals(res, node)

        syncfile._media.exists('river.jpg', function (err, exists) {
          t.error(err, 'exists ok')
          t.ok(exists, 'river.jpg exists')
        })

        syncfile.close(t.end.bind(t))
      })
    }
  })
})

test('replicate osm-p2p + media to new syncfile, close, then reopen & check', function (t) {
  tmp.dir(function (err, dir, cleanup) {
    t.error(err)

    var filepath = path.join(dir, 'sync.tar')
    var mfeed = multifeed(hypercore, ram, { valueEncoding: 'json' })
    var media = blob()
    var syncfile
    var node = { type: 'node', lat: 1, lon: 2 }

    mfeed.writer('default', function (err, w) {
      t.error(err)
      w.append(node, function (err) {
        t.error(err)
        setup()
      })
    })

    function setup () {
      syncfile = Syncfile(filepath, dir)
      syncfile.ready(addMedia)
    }

    function addMedia (err) {
      t.error(err, 'syncfile setup ok')
      media.createWriteStream('river.jpg', sync)
        .end('<IMG DATA>')
    }

    function sync (err) {
      t.error(err, 'add media ok')
      var d = syncfile.replicateData({live: false})
      var r = mfeed.replicate({live: false})
      replicate(r, d, function (err) {
        t.error(err, 'replicate osm ok')
        var d = syncfile.replicateMedia()
        var r = blobReplicate(media)
        replicate(d, r, function (err) {
          t.error(err, 'replicate media ok')
          syncfile.close(reopen)
        })
      })
    }

    function reopen (err) {
      t.error(err, 'closed ok')
      syncfile = new Syncfile(filepath, dir)
      syncfile.ready(sync2)
    }

    function sync2 (err) {
      t.error(err, 'reopen ok')

      mfeed = multifeed(hypercore, ram, { valueEncoding: 'json' })
      mfeed.ready(function () {
        var d = syncfile.replicateData({live: false})
        var r = mfeed.replicate({live: false})
        replicate(r, d, function (err) {
          // HACK(noffle): ignore for now; bug in multifeed
          if (err && err.message === 'premature close') err = undefined

          t.error(err, 'second replicate osm ok')
          var d = syncfile.replicateMedia()
          var r = blobReplicate(media)
          replicate(d, r, function (err) {
            t.error(err, 'second replicate media ok')
            check()
          })
        })
      })
    }

    function check (err) {
      t.error(err, 'second syncfile close ok')

      syncfile._mfeed.feeds()[0].get(0, function (err, res) {
        t.error(err, 'get ok')
        t.deepEquals(res, node)

        collect(media.createReadStream('river.jpg'), function (err, data) {
          t.error(err, 'read media ok')
          t.equals(data.toString(), '<IMG DATA>')
          t.end()
        })
      })
    }
  })
})

test('replicate media + osm-p2p to syncfile with big data', function (t) {
  tmp.dir(function (err, dir, cleanup) {
    t.error(err)

    var filepath = path.join(dir, 'sync.tar')
    var mfeed = multifeed(hypercore, ram, { valueEncoding: 'json' })
    var media = blob()
    var syncfile
    var nodeId
    var nodeVersion
    var node = { type: 'node', lat: 1, lon: 2 }

    mfeed.writer('default', function (err, w) {
      t.error(err)
      w.append(node, function (err) {
        t.error(err)
        setup()
      })
    })

    function setup () {
      var filepath = path.join(dir, 'sync.tar')
      syncfile = Syncfile(filepath, dir)
      syncfile.ready(addMedia)
    }

    function addMedia (err) {
      t.error(err, 'syncfile setup ok')
      var tasks = []
      var n = 0
      for (var i = 0; i < 500; i++) {
        tasks.push(function (next) {
          var writeStream = media.createWriteStream(`hi-res-${n++}.jpg`, next)
          fs.createReadStream(path.join(__dirname, 'hi-res.jpg')).pipe(writeStream)
        })
      }
      parallel(tasks, 5, function (err) {
        if (err) throw err
        console.log('done, syncing')
        sync()
      })
    }

    function sync (err) {
      t.error(err, 'add media ok')
      var d = syncfile.replicateData({live: false})
      var r = mfeed.replicate({live: false})
      replicate(r, d, function (err) {
        t.error(err, 'replicate osm ok')
        var d = syncfile.replicateMedia()
        var r = blobReplicate(media)
        replicate(d, r, function (err) {
          t.error(err, 'replicate media ok')
          syncfile.close(reopen)
        })
      })
    }

    function reopen (err) {
      t.error(err, 'closed ok')
      syncfile = new Syncfile(filepath, dir)
      syncfile.ready(sync2)
    }

    function sync2 (err) {
      t.error(err, 'reopen ok')

      mfeed = multifeed(hypercore, ram, { valueEncoding: 'json' })
      mfeed.ready(function () {
        var d = syncfile.replicateData({live: false})
        var r = mfeed.replicate({live: false})
        replicate(r, d, function (err) {
          // HACK(noffle): ignore for now; bug in multifeed
          if (err && err.message === 'premature close') err = undefined

          t.error(err, 'second replicate osm ok')
          var d = syncfile.replicateMedia()
          var r = blobReplicate(media)
          replicate(d, r, function (err) {
            t.error(err, 'second replicate media ok')
            check()
          })
        })
      })
    }

    function check (err) {
      t.error(err, 'second syncfile close ok')

      syncfile._mfeed.feeds()[0].get(0, function (err, res) {
        t.error(err, 'get ok')
        t.deepEquals(res, node)

        media.exists('hi-res-0.jpg', function (err, exists) {
          t.error(err, 'read media ok')
          t.ok(exists, 'media exists')
          t.end()
        })
      })
    }
  })
})

function replicate (stream1, stream2, cb) {
  pump(stream1, stream2, stream1, cb)
}
