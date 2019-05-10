// 1. copy sync.tar to a tmpdir
// 2. copy data/ to a tmpdir
// 3. open both
// 4. sync them together
// 5. close syncfile

var fs = require('fs')
var tmp = require('tmp')
var Osm = require('osm-p2p')
var Blob = require('safe-fs-blob-store')
var BlobSync = require('blob-store-replication-stream')
var Syncfile = require('..')
var os = require('os')
var path = require('path')
var randombytes = require('randombytes')
var ncp = require('ncp')

if (process.argv.length !== 4) {
  console.log('USAGE: node sync-both-existing.js TARBALL DATADIR')
  process.exit(0)
}

var srcTarname = process.argv[2]
var srcDirname = process.argv[3]
var dstTarname = path.join(tmp.dirSync().name, 'sync.tar')
var dstDirname = path.join(tmp.dirSync().name, 'data')

var pending = 2
ncp(srcTarname, dstTarname, function (err) {
  if (err) throw err
  console.log(srcTarname, '->', dstTarname)
  if (!--pending) run()
})
ncp(srcDirname, dstDirname, function (err) {
  if (err) throw err
  console.log(srcDirname, '->', dstDirname)
  if (!--pending) run()
})

function createDb (dir) {
  var osm = Osm(dir)
  var media = Blob(path.join(dir, 'media'))
  return { osm: osm, media: media }
}

function run () {
  var db = createDb(dstDirname)
  var syncfile = new Syncfile(dstTarname, os.tmpdir())

  console.log('readying')
  db.osm.ready(function () {
    console.log('db ready')
    syncfile.ready(function () {
      console.log('syncfile ready')
      console.log('syncing')
      sync(db, syncfile, function () {
        console.log('done')
        console.log('writing syncfile')
        syncfile.close(function () {
          console.log('done')
        })
      })
    })
  })
}

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
  replicate(db.osm.replicate(), file.replicateData(), function (err) {
    if (err) throw err
    if (!--pending) cb()
  })
  replicate(BlobSync(db.media), file.replicateMedia(), function (err) {
    if (err) throw err
    if (!--pending) cb()
  })
}
