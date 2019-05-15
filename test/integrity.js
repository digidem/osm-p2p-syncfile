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
var parallel = require('run-parallel')
var Syncfile = require('..')

test('create a good syncfile, truncate it, then repair', function (t) {
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
      media.createWriteStream('river.jpg', closeAndTruncate)
        .end('<IMG DATA>')
    }

    function closeAndTruncate (err) {
      t.error(err, 'add media ok')
      syncfile.close(function (err) {
        t.error(err, 'close ok')
        fs.stat(filepath, function (err, stat) {
          t.error(err, 'stat ok')
          fs.truncate(filepath, stat.size - 200, function (err) {
            t.error(err, 'truncate ok')
            reopen()
          })
        })
      })
    }

    function reopen () {
      syncfile = new Syncfile(filepath, dir, { autorepair: true })
      syncfile.ready(function (err) {
        t.error(err, 'reopen ok')
        t.notOk(syncfile._err, 'no syncfile error')
        cleanup(function () {
          t.end()
        })
      })
    }
  })
})

