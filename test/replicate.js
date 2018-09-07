var test = require('tape')
var path = require('path')
var tmp = require('tmp')
var fs = require('fs')
var OsmMem = require('osm-p2p-mem')
var Osm = require('osm-p2p')
var Syncfile = require('..')

test('try to replicate before ready', function (t) {
  t.plan(3)

  tmp.dir(function (err, dir, cleanup) {
    t.error(err)

    var filepath = path.join(dir, 'sync.tar')
    var syncfile = Syncfile(filepath, dir)

    var m = syncfile.createMediaReplicationStream()
    var d = syncfile.createDatabaseReplicationStream()

    m.once('error', function (err) {
      t.ok(err instanceof Error)
    })
    d.once('error', function (err) {
      t.ok(err instanceof Error)
    })
  })
})

test('replicate osm-p2p to syncfile', function (t) {
  tmp.dir(function (err, dir, cleanup) {
    t.error(err)

    var osm = OsmMem()
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
      syncfile.ready(sync)
    }

    function sync (err) {
      t.error(err, 'syncfile setup ok')
      var d = syncfile.createDatabaseReplicationStream()
      var r = osm.log.replicate({live: false})
      replicate(r, d, check)
    }

    function check (err) {
      t.error(err, 'replication ok')

      var tmpOsm = syncfile._osm
      tmpOsm.ready(function () {
        tmpOsm.get(nodeId, function (err, heads) {
          t.error(err, 'get ok')
          t.equal(typeof heads, 'object', 'got heads')
          t.equals(Object.keys(heads).length, 1)
          t.deepEquals(heads[nodeVersion], node)

          syncfile.close(t.end.bind(t))
        })
      })
    }
  })
})

test('replicate osm-p2p to new syncfile, close, then reopen & check', function (t) {
  tmp.dir(function (err, dir, cleanup) {
    t.error(err)

    var filepath = path.join(dir, 'sync.tar')
    var osm = OsmMem()
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
      syncfile.ready(sync)
    }

    function sync (err) {
      t.error(err, 'syncfile setup ok')
      var d = syncfile.createDatabaseReplicationStream()
      var r = osm.log.replicate({live: false})
      replicate(r, d, function (err) {
        t.error(err, 'replication ok')
        syncfile.close(reopen)
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
      var d = syncfile.createDatabaseReplicationStream()
      var r = osm.log.replicate({live: false})
      replicate(r, d, function (err) {
        t.error(err, 'second replication ok')
        syncfile.close(check)
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

          t.end()
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
