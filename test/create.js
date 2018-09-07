var test = require('tape')
var path = require('path')
var fs = require('fs')
var tmp = require('tmp')
var tar = require('tar-stream')
var Syncfile = require('..')

test('bad creation', function (t) {
  var syncfile = new Syncfile(null, null)

  syncfile.ready(function (err) {
    t.ok(err instanceof Error)
    t.end()
  })
})

test('can initialize with new syncfile', function (t) {
  tmp.dir(function (err, dir, cleanup) {
    t.error(err)

    var filepath = path.join(dir, 'sync.tar')
    var syncfile = Syncfile(filepath, dir)

    syncfile.ready(function () {
      t.ok(fs.existsSync(filepath))
      t.equal(fs.readdirSync(dir).length, 2)
      t.notEqual(fs.readdirSync(dir).indexOf('sync.tar'), -1)

      syncfile.close(function (err) {
        t.error(err)
        t.end()
      })
    })
  })
})

test('can initialize with an existing syncfile', function (t) {
  tmp.dir(function (err, dir, cleanup) {
    t.error(err)

    var filepath = path.join(dir, 'sync.tar')

    setupAndClose(function (err) {
      t.error(err)
      t.ok(fs.existsSync(filepath))
      t.equal(fs.readdirSync(dir).length, 1)
      t.notEqual(fs.readdirSync(dir).indexOf('sync.tar'), -1)

      setupAndClose(function (err) {
        t.error(err)
        t.ok(fs.existsSync(filepath))
        t.equal(fs.readdirSync(dir).length, 1)
        t.notEqual(fs.readdirSync(dir).indexOf('sync.tar'), -1)
        t.end()
      })
    })

    function setupAndClose (cb) {
      var syncfile = Syncfile(filepath, dir)
      syncfile.ready(function () {
        syncfile.close(cb)
      })
    }
  })
})

test('updates to inner osm-p2p-db.tar entry results in old entry being cleared', function (t) {
  tmp.dir(function (err, dir, cleanup) {
    t.error(err)

    var filepath = path.join(dir, 'sync.tar')

    setupAndClose(function (err) {
      t.error(err)
      t.ok(fs.existsSync(filepath))
      t.equal(fs.readdirSync(dir).length, 1)
      t.notEqual(fs.readdirSync(dir).indexOf('sync.tar'), -1)

      setupAndClose(function (err) {
        t.error(err)
        t.ok(fs.existsSync(filepath))
        t.equal(fs.readdirSync(dir).length, 1)
        t.notEqual(fs.readdirSync(dir).indexOf('sync.tar'), -1)

        var seen = []
        var ex = tar.extract()
        fs.createReadStream(filepath).pipe(ex)
        ex.on('entry', function (header, stream, next) {
          seen.push(header.name)
          stream.resume()
          stream.on('end', next)
        })
        ex.on('finish', function () {
          t.deepEquals(seen.sort(), ['___index.json', 'osm-p2p-db.tar'])
          t.end()
        })
      })
    })

    function setupAndClose (cb) {
      var syncfile = Syncfile(filepath, dir)
      syncfile.ready(function () {
        syncfile.osm.create({ type: 'node' }, function (err) {
          t.error(err)
          syncfile.close(cb)
        })
      })
    }
  })
})
