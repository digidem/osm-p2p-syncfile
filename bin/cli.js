#!/usr/bin/env node

var Syncfile = require('.')
var blobsync = require('blob-store-replication-stream')
var os = require('os')
var fs = require('fs')
var path = require('path')
var Osm = require('osm-p2p')
var spawn = require('child_process').spawnSync

function printUsageAndDie () {
  console.log('USAGE: osm-p2p-syncfile init|sync|add|list|get SYNCFILE [ARGS]')
  process.exit(1)
}

var args = process.argv.slice(2)

if (args.length === 0) printUsageAndDie()

if (args[0] === 'init') {
  if (args.length < 2) {
    console.log('USAGE: osm-p2p-syncfile init SYNCFILE [OSM-DIR]')
    process.exit(1)
  }

  if (args.length === 2) {
    var sync1 = new Syncfile(args[1], os.tmpdir())
    sync1.ready(function () {
      sync1.close(function () {
        console.log('initialized', args[1])
      })
    })
  } else {
    var sync1 = new Syncfile(args[1], os.tmpdir())
    var osm = Osm(args[2])
    sync1.ready(function () {
      osm.ready(function () {
        replicate(sync1.osm.log.replicate({live:false}),
                  osm.log.replicate({live:false}),
                  function (err) {
                    if (err) throw err
                    sync1.close(function () {
                      console.log('initialized', args[1], 'to', args[2])
                    })
                  })
      })
    })
  }
} else if (args[0] === 'sync') {
  if (args.length !== 3) {
    console.log('USAGE: osm-p2p-syncfile sync MY-SYNCFILE THEIR-SYNCFILE')
    process.exit(1)
  }

  var sync1 = new Syncfile(args[1], os.tmpdir())
  var sync2 = new Syncfile(args[2], os.tmpdir())

  sync1.ready(function () {
    sync2.ready(function () {
      replicate(sync1.osm.log.replicate({live:false}), sync2.osm.log.replicate({live:false}), function (err) {
        if (err) throw err
        console.log('synced osm data ok')
        replicate(blobsync(sync1.media), blobsync(sync2.media), function (err) {
          if (err) throw err
          console.log('synced media data ok')
          sync1.close(function (err) {
            if (err) throw err
            sync2.close(function (err) {
              if (err) throw err
            })
          })
        })
      })
    })
  })
} else if (args[0] === 'add') {
  var sync1 = new Syncfile(args[1], os.tmpdir())
  var filename = path.basename(args[2])
  sync1.ready(function () {
    addMedia(sync1, args[2], filename, function () {
      sync1.close(function (err) {
        if (err) throw err
        console.log('added', filename, 'to', path.basename(args[1]))
      })
    })
  })
} else if (args[0] === 'list' || args[0] === 'ls') {
  var sync1 = new Syncfile(args[1], os.tmpdir())
  sync1.ready(function () {
    sync1.media.list(function (err, files) {
      if (err) throw err
      console.log('----- <media> ------')
      files.forEach(function (file) {
        console.log(file)
      })
      console.log('----- </media> -----')
      sync1.osm.query([[-90,90],[-180,180]], function (err, elms) {
        if (err) throw err
        console.log('----- <osm> ------')
        elms.forEach(function (elm) {
          console.log('id:', elm.id, 'type:', elm.type)
        })
        console.log('----- </osm> -----')
        sync1.close(function () {})
      })
    })
  })
} else if (args[0] === 'get') {
  if (args.length !== 3) {
    console.log('USAGE: osm-p2p-syncfile get MY-SYNCFILE FILENAME')
    process.exit(1)
  }

  var sync1 = new Syncfile(args[1], os.tmpdir())
  sync1.ready(function () {
    var rs = sync1.media.createReadStream(args[2])
    rs.pipe(process.stdout)
    rs.on('end', function () {
      sync1.close(function () {})
    })
  })
} else {
  printUsageAndDie()
}

function addMedia (syncfile, filepath, filename, cb) {
  var rs = fs.createReadStream(filepath)
  var ws = sync1.media.createWriteStream(filename, cb)
  rs.pipe(ws)
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
