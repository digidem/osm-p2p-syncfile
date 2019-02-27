var test = require('tape')
var path = require('path')
var fs = require('fs')
var parallel = require('run-parallel')
var tmp = require('tmp')
var OsmMem = require('osm-p2p-mem')
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

    t.notOk(syncfile.osm, 'no this.osm yet')
    t.notOk(syncfile.media, 'no this.media yet')
  })
})

test('replicate media + osm-p2p to syncfile with big data', function (t) {
  tmp.dir(function (err, dir, cleanup) {
    t.error(err)

    var osm = OsmMem()
    var media = blob()
    var syncfile
    var nodeId
    var nodeVersion
    var node

    osm.create({ type: 'node', lat: 1, lon: 1, tags: { foo: 'bar' } }, function (err, id, theNode) {
      t.error(err, 'node creation ok')
      nodeId = id
      nodeVersion = theNode.key
      node = theNode.value.v
      setup()
    })

    function setup () {
      var filepath = path.join(dir, 'sync.tar')
      syncfile = Syncfile(filepath, dir)
      syncfile.ready(addMedia)
    }

    function addMedia (err) {
      t.error(err, 'syncfile setup ok')
      var tasks = []
      for (var i = 0; i < 500; i++) {
        tasks.push(function (next) {
          var writeStream = media.createWriteStream('hi-res.jpg', next)
          fs.createReadStream(path.join(__dirname, 'hi-res.jpg')).pipe(writeStream)
        })
      }
      parallel(tasks, function (err) {
        if (err) throw err
        console.log('done, syncing')
        sync()
      })
    }

    function sync (err) {
      t.error(err, 'add media ok')
      var d = syncfile.osm.log.replicate({ live: false })
      var r = osm.log.replicate({ live: false })
      replicate(r, d, function (err) {
        t.error(err, 'replicate osm ok')
        var d = blobReplicate(syncfile.media)
        var r = blobReplicate(media)
        replicate(d, r, check)
      })
    }

    function check (err) {
      t.error(err, 'replicate media ok')

      syncfile.osm.ready(function () {
        syncfile.osm.get(nodeId, function (err, heads) {
          t.error(err, 'get ok')
          t.equal(typeof heads, 'object', 'got heads')
          t.equals(Object.keys(heads).length, 1)
          t.deepEquals(heads[nodeVersion], node)

          syncfile.media.exists('hi-res.jpg', function (err, exists) {
            t.error(err, 'exists ok')
            t.ok(exists, 'river.jpg exists')
          })

          syncfile.close(t.end.bind(t))
        })
      })
    }
  })
})

test('replicate media + osm-p2p to syncfile', function (t) {
  tmp.dir(function (err, dir, cleanup) {
    t.error(err)

    var osm = OsmMem()
    var media = blob()
    var syncfile
    var nodeId
    var nodeVersion
    var node

    osm.create({ type: 'node', lat: 1, lon: 1, tags: { foo: 'bar' } }, function (err, id, theNode) {
      t.error(err, 'node creation ok')
      nodeId = id
      nodeVersion = theNode.key
      node = theNode.value.v
      setup()
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
      var d = syncfile.osm.log.replicate({live: false})
      var r = osm.log.replicate({live: false})
      replicate(r, d, function (err) {
        t.error(err, 'replicate osm ok')
        var d = blobReplicate(syncfile.media)
        var r = blobReplicate(media)
        replicate(d, r, check)
      })
    }

    function check (err) {
      t.error(err, 'replicate media ok')

      syncfile.osm.ready(function () {
        syncfile.osm.get(nodeId, function (err, heads) {
          t.error(err, 'get ok')
          t.equal(typeof heads, 'object', 'got heads')
          t.equals(Object.keys(heads).length, 1)
          t.deepEquals(heads[nodeVersion], node)

          syncfile.media.exists('river.jpg', function (err, exists) {
            t.error(err, 'exists ok')
            t.ok(exists, 'river.jpg exists')
          })

          syncfile.close(t.end.bind(t))
        })
      })
    }
  })
})

test('replicate osm-p2p + media to new syncfile, close, then reopen & check', function (t) {
  tmp.dir(function (err, dir, cleanup) {
    t.error(err)

    var filepath = path.join(dir, 'sync.tar')
    var osm = OsmMem()
    var media = blob()
    var syncfile
    var nodeId
    var nodeVersion
    var node

    osm.create({ type: 'node', lat: 1, lon: 1, tags: { foo: 'bar' } }, function (err, id, theNode) {
      t.error(err, 'node creation ok')
      nodeId = id
      nodeVersion = theNode.key
      node = theNode.value.v
      setup()
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
      var d = syncfile.osm.log.replicate({live: false})
      var r = osm.log.replicate({live: false})
      replicate(r, d, function (err) {
        t.error(err, 'replicate osm ok')
        var d = blobReplicate(syncfile.media)
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
      osm = OsmMem()
      var d = syncfile.osm.log.replicate({live: false})
      var r = osm.log.replicate({live: false})
      replicate(r, d, function (err) {
        t.error(err, 'second osm replication ok')
        var d = blobReplicate(syncfile.media)
        var r = blobReplicate(media)
        replicate(d, r, function (err) {
          t.error(err, 'second media replicate ok')
          syncfile.close(check)
        })
      })
    }

    function check (err) {
      t.error(err, 'second syncfile close ok')

      osm.ready(function () {
        osm.get(nodeId, function (err, heads) {
          t.error(err, 'get ok')
          t.equal(typeof heads, 'object', 'got heads')
          t.equals(Object.keys(heads).length, 1)
          t.deepEquals(heads[nodeVersion], node)

          collect(media.createReadStream('river.jpg'), function (err, data) {
            t.error(err, 'read media ok')
            t.equals(data.toString(), '<IMG DATA>')
            t.end()
          })
        })
      })
    }
  })
})

function replicate (stream1, stream2, cb) {
  stream1.on('end', done)
  stream1.on('error', done)
  stream2.on('end', done)
  stream2.on('error', done)

  stream1.pipe(stream2).pipe(stream1)

  var pending = 2
  var error
  function done (err) {
    error = err || error
    if (!--pending) cb(err)
  }
}
