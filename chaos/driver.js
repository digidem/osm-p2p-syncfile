var fs = require('fs')
var path = require('path')
var tmp = require('tmp')
var spawn = require('child_process').spawn
var Syncfile = require('..')
var IndexedTarball = require('indexed-tarball')
var repair = require('indexed-tarball/lib/integrity').repair
var collect = require('collect-stream')
var tar = require('tar-stream')

if (process.argv.length < 4) {
  console.log('USAGE: node driver.js NUM-RUNS NODE-SCRIPT [SRC-TARBALL]')
  process.exit(0)
}
var runs = Number(process.argv[2])
var script = process.argv[3]
var tarballName = process.argv[4]

function generatePath () {
  return path.join(tmp.dirSync().name, 'sync.tar')
}

function checkSyncfile (filename, cb) {
  console.log('checking', filename)
  // Check indexed-tarball integrity
  repair(filename, function (err, res) {
    if (err) return cb(err)
    if (res.state === 'good') {
      console.log('tarball state good')
    } else if (res.state === 'repaired') {
      console.log('WARN: tarball was corrupt, but repair was ok', res)
    } else {
      console.log('WARN: bad tarball state', res)
      return cb()
    }

    var tarball = new IndexedTarball(filename)
    tarball.list(function (err, files) {
      if (err) return cb(err)
      if (files.indexOf('osm-p2p-db.tar') === -1) {
        console.log('WARN: osm-p2p-db.tar missing')
      }
      if (files.length !== 1002) {
        console.log('WARN: only', files.length, 'files out of 1002 expected')
      }
      getIndexedTarballMetadata(filename, function (err, meta) {
        if (err) {
          console.log('ERR: __index.json is corrupt:', err)
          return cb(err)
        }
        if (Object.keys(meta.index).length !== 1002) {
          console.log('WARN: index has only', files.length, 'files out of 1002 expected')
        }
        if (meta.userdata.version !== '2.0.0') {
          console.log('WARN: indexed-tarball metadata version lost')
        }
        if (meta.userdata['p2p-db'] !== 'kappa-osm') {
          console.log('WARN: syncfile userdata "p2p-db" not set to "kappa-osm" (' + meta.userdata['p2p-db'] + ')')
        }
        cb()
      })
    })
    // var syncfile = new Syncfile(filename, os.tmpdir())
  })
}

function runWithTimeout (timeout, cb) {
  var syncfilePath = tarballName || generatePath()
  var delay = Math.floor(Math.random() * timeout * 1.05)
  console.log('going to kill after', delay, 'ms')
  var p = spawn('node', [script, syncfilePath, 'data/'])
  setTimeout(function () {
    p.kill('SIGKILL')
  }, delay)
p.stdout.on('data', function (data) { process.stdout.write('child> ' + data.toString()) })
p.stderr.on('data', function (data) { process.stdout.write('child> ' + data.toString()) })
  p.on('close', function (code, signal) {
    console.log('killed (code=' + code + ', signal=' + signal + ')')
    try {
      var size = fs.statSync(syncfilePath).size
      console.log('file size is', size, 'bytes')
      cb(null, syncfilePath)
    } catch (err) {
      console.log('syncfile does not exist', syncfilePath)
      cb(null, syncfilePath)
    }
  })
}

// run once to determine average run time
var syncfilePath = tarballName || generatePath()
console.log('first run')
var p = spawn('node', [script, syncfilePath, 'data'])
p.stdout.on('data', function (data) { process.stdout.write('child> ' + data.toString()) })
p.stderr.on('data', function (data) { process.stdout.write('child> ' + data.toString()) })
var start = new Date().getTime()
p.on('close', function (code, signal) {
  var duration = new Date().getTime() - start
  console.log('first run ended after', duration, 'ms (code=' + code + ', signal=' + signal + ')')

  runTimes(runs, function (next) {
    runWithTimeout(duration, function (err, filename) {
      if (err) throw err
      checkSyncfile(filename, function (err) {
        if (err) console.log('ERR:', err)
        next()
      })
    })
  })
})

function runTimes (times, fn) {
  ;(function next (n) {
    if (n <= 0) return
    fn(function () {
      next(n - 1)
    })
  })(times)
}

function getIndexedTarballMetadata (tarname, cb) {
  var extract = tar.extract()

  extract.on('entry', function(header, stream, next) {
    if (header.name === '___index.json') {
      collect(stream, function (err, data) {
        try {
          var meta = JSON.parse(data.toString())
          cb(null, meta)
        } catch (err) {
          return cb(err)
        }
      })
    }
    stream.on('end', next)
    stream.resume()
  })

  fs.createReadStream(tarname).pipe(extract)
}
