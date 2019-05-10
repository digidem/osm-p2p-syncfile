var Osm = require('osm-p2p')
var Blob = require('safe-fs-blob-store')
var BlobSync = require('blob-store-replication-stream')
var Syncfile = require('..')
var tmp = require('tmp')
var os = require('os')
var path = require('path')
var randombytes = require('randombytes')

if (process.argv.length !== 4) {
  console.log('USAGE: node sync-new-syncfile.js [TARBALL] [DATADIR]')
  process.exit(0)
}

function createDb (dir) {
  console.log('data @', dir)
  var osm = Osm(dir)
  var media = Blob(path.join(dir, 'media'))
  return { osm: osm, media: media }
}

var db = createDb(process.argv[3] || 'data')

var syncfilePath = process.argv[2] || path.join(tmp.dirSync().name, 'sync.tar')
console.log('syncfile @', syncfilePath)
var syncfile = new Syncfile(syncfilePath, os.tmpdir())

console.log('indexing')
db.osm.ready(function () {
  console.log('done')
  console.log('syncing')
  sync(db, syncfile, function () {
    console.log('done')
    console.log('writing syncfile')
    syncfile.close(function () {
      console.log('done')
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

