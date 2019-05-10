var Osm = require('osm-p2p')
var Blob = require('safe-fs-blob-store')
var BlobSync = require('blob-store-replication-stream')
var Syncfile = require('..')
var tmp = require('tmp')
var os = require('os')
var path = require('path')
var randombytes = require('randombytes')

if (process.argv.length < 3) {
  console.log('USAGE: node sync-existing-syncfile.js TARBALL')
  process.exit(0)
}

function createDb (n) {
  var dir = tmp.dirSync().name
  console.log('dir @', dir)
  var osm = Osm(dir)
  var media = Blob(path.join(dir, 'media'))
  return { osm: osm, media: media }
}

var db1 = createDb(1)
var syncfilePath = process.argv[2] || 'sync.tar'
var syncfile = new Syncfile(syncfilePath, os.tmpdir())

db1.osm.ready(function () {
  console.log('ready')
  syncfile.ready(function () {
    console.log('syncing')
    sync(db1, syncfile, function () {
      console.log('done')
      console.log('writing syncfile')
      syncfile.close(function () {
        console.log('done')
      })
    })
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

function sync (db, file, cb) {
  var pending = 2
  replicate(db.osm.replicate(), syncfile.replicateData(), function (err) {
    if (err) throw err
    if (!--pending) cb()
  })
  replicate(BlobSync(db.media), syncfile.replicateMedia(), function (err) {
    if (err) throw err
    if (!--pending) cb()
  })
}

