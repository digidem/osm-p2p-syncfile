var test = require('tape')
var path = require('path')
var tmp = require('tmp')
var fs = require('fs')
var Osm = require('osm-p2p-mem')
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

    var osm = Osm()
    var syncfile

    osm.create({ type: 'node', lat: 1, lon: 1, tags: { foo: 'bar' } }, function (err) {
      t.error(err, 'node creation ok')
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
      d.once('error', function (err) { t.error(err) })

      replicate(osm.log.replicate(), d, check)
    }

    function check (err) {
      t.error(err, 'replication ok')
      t.equals(fs.readdirSync(syncfile._tmpdir).length, 1, 'tmpdir has db')
      t.end()
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
