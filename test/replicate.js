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

    t.notOk(syncfile.replicateData, 'replicateData does not exist')
    t.notOk(syncfile.replicateMedia, 'replicateMedia does not exist')
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

      syncfile._mfeed.feeds()[0].get(0, function (err, res) {
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

function replicate (stream1, stream2, cb) {
  pump(stream1, stream2, stream1, cb)
}
