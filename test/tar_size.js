var tarSize = require('../lib/tar_size')
var tar = require('tar-fs')
var tmp = require('tmp')
var test = require('tape')
var pump = require('pump')
var fs = require('fs')

test('size calculation is correct', function (t) {
  var dirToSizeup = __dirname
  var tarFilename = tmp.tmpNameSync()
  var calculatedSize
  var pending = 2

  pump(tar.pack(dirToSizeup), fs.createWriteStream(tarFilename), done)
  tarSize(dirToSizeup, function (err, size) {
    calculatedSize = size
    done(err)
  })

  function done (err) {
    t.error(err, 'no error')
    if (--pending > 0) return
    var stats = fs.statSync(tarFilename)
    t.equal(calculatedSize, stats.size, 'calculated size matches disk size')
    t.end()
  }
})
