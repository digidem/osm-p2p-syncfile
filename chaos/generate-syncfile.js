var Osm = require('osm-p2p')
var Blob = require('safe-fs-blob-store')
var BlobSync = require('blob-store-replication-stream')
var Syncfile = require('..')
var tmp = require('tmp')
var os = require('os')
var path = require('path')
var randombytes = require('randombytes')

if (process.argv.length < 3) {
  console.log('USAGE: node generate-syncfile.js [TARBALL]')
  process.exit(0)
}

function createDb (n) {
  var dir = tmp.dirSync().name
  var osm = Osm(dir)
  var media = Blob(path.join(dir, 'media'))
  console.log('data @', dir)
  return { osm: osm, media: media }
}

var db1 = createDb(1)
var syncfilePath = process.argv[2] || path.join(tmp.dirSync().name, 'sync.tar')
console.log('syncfile @', syncfilePath)
var syncfile = new Syncfile(syncfilePath, os.tmpdir())

function writeRandomData (numRecords, cb) {
  console.log('writing', numRecords, 'map records')
  var batch = new Array(numRecords).fill(0).map(function () {
    return {
      type: 'put',
      value: {
        type: 'node',
        lat: 12.0 + Math.random() * 10 - 5,
        lon: 53.0 + Math.random() * 10 - 5,
        tags: { foo: 'bar' },
        changeset: '123' 
      }
    }
  })

  db1.osm.batch(batch, function (err) {
    console.log('done')
    cb(err)
  })
}

function writeRandomMedia (numPhotos, cb) {
  console.log('writing', numPhotos, 'photos')
  ;(function next (n) {
    if (n <= 0) {
      console.log('done')
      return cb()
    }
    var data = randombytes(1024 * 64)
    var name = randombytes(24).toString('hex')
    db1.media.createWriteStream(name + '.png', function () {
      next(--n)
    }).end(data)
  })(numPhotos)
}

writeRandomData(10000, function (err) {
  if (err) throw err
  writeRandomMedia(1000, function (err) {
    if (err) throw err
    console.log('indexing')
    db1.osm.ready(function () {
      console.log('done')
      syncfile.ready(onSync)
    })
  })
})

function onSync () {
  console.log('syncing')
  sync(db1, syncfile, function () {
    console.log('done')
    console.log('writing syncfile')
    syncfile.close(function () {
      console.log('done')
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
  replicate(db.osm.replicate(), syncfile.replicateData(), function (err) {
    if (err) throw err
    if (!--pending) cb()
  })
  replicate(BlobSync(db.media), syncfile.replicateMedia(), function (err) {
    if (err) throw err
    if (!--pending) cb()
  })
}

