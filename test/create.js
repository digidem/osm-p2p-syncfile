var test = require('tape')
var path = require('path')
var fs = require('fs')
var tmp = require('tmp')
var Syncfile = require('..')

test('bad creation', function (t) {
  var syncfile = new Syncfile(null, null)

  syncfile.ready(function (err) {
    t.ok(err instanceof Error)
    t.end()
  })
})

test('create + ready + syncfile exists', function (t) {
  tmp.dir(function (err, dir, cleanup) {
    t.error(err)

    var filepath = path.join(dir, 'sync.tar')
    var syncfile = Syncfile(filepath, dir)

    syncfile.ready(function () {
      t.ok(fs.existsSync(filepath))
      t.equal(fs.readdirSync(dir).length, 2)
      t.end()
    })
  })
})
