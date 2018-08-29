var test = require('tape')
var path = require('path')
var fs = require('fs')
var tmp = require('tmp')
var Syncfile = require('..')

test('create + ready + syncfile exists', function (t) {
  tmp.dir(function (err, dir, cleanup) {
    t.error(err)

    var filepath = path.join(dir, 'sync.tar')
    var syncfile = Syncfile(filepath, dir)

    syncfile.once('ready', function () {
      t.ok(fs.existsSync(filepath))
      t.end()
    })
  })
})
