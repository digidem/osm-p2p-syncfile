var test = require('tape')
var path = require('path')
var tmp = require('tmp')
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
