var test = require('tape')
var path = require('path')
var fs = require('fs')
var tmp = require('tmp')
var tar = require('tar-stream')
var rimraf = require('rimraf')
var Syncfile = require('..')

test('bad creation', function (t) {
  t.plan(1)
  t.throws(function () {
    new Syncfile(null, null)
  }, 'must specify tmpdir to use', 'fails ok')
})

test('can initialize with new syncfile', function (t) {
  tmp.dir(function (err, dir, cleanup) {
    t.error(err)

    var filepath = path.join(dir, 'sync.tar')
    var syncfile = Syncfile(filepath, dir)

    syncfile.ready(function () {
      t.ok(fs.existsSync(filepath), 'syncfile dir exists')
      t.equal(fs.readdirSync(dir).length, 2, 'two files in syncfile dir')
      t.notEqual(fs.readdirSync(dir).indexOf('sync.tar'), -1, 'sync.tar is present')

      syncfile.tarball.userdata(function (err, data) {
        t.error(err, 'usedata written ok')
        t.deepEquals(data, {version: '2.0.0', syncfile: {}}, 'userdata as expected')

        syncfile.close(function (err) {
          t.error(err, 'syncfile closed ok')
          t.notOk(fs.existsSync(filepath), 'tmp dir deleted')
          t.end()
        })
      })
    })
  })
})

test('can initialize with an existing syncfile', function (t) {
  tmp.dir(function (err, dir, cleanup) {
    t.error(err)

    var syncDir = tmp.dirSync().name
    var filepath = path.join(syncDir, 'sync.tar')

    setupAndClose(function (err) {
      t.error(err)
      t.ok(fs.existsSync(filepath))
      t.equal(fs.readdirSync(syncDir).length, 1)
      t.notEqual(fs.readdirSync(syncDir).indexOf('sync.tar'), -1)
      t.notOk(fs.existsSync(dir), 'tmp dir deleted')

      setupAndClose(function (err) {
        t.error(err)
        t.ok(fs.existsSync(filepath))
        t.equal(fs.readdirSync(syncDir).length, 1)
        t.notEqual(fs.readdirSync(syncDir).indexOf('sync.tar'), -1)
        t.notOk(fs.existsSync(dir), 'tmp dir deleted')
        rimraf.sync(syncDir)
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

    var syncDir = tmp.dirSync().name
    var filepath = path.join(syncDir, 'sync.tar')

    setupAndClose(function (err) {
      t.error(err)
      t.ok(fs.existsSync(filepath))
      t.equal(fs.readdirSync(syncDir).length, 1)
      t.notOk(fs.existsSync(dir), 'tmp dir deleted')
      t.notEqual(fs.readdirSync(syncDir).indexOf('sync.tar'), -1)

      setupAndClose(function (err) {
        t.error(err)
        t.ok(fs.existsSync(filepath))
        t.equal(fs.readdirSync(syncDir).length, 1)
        t.notOk(fs.existsSync(dir), 'tmp dir deleted')
        t.notEqual(fs.readdirSync(syncDir).indexOf('sync.tar'), -1)

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
          rimraf.sync(syncDir)
          t.end()
        })
      })
    })

    function setupAndClose (cb) {
      var syncfile = Syncfile(filepath, dir)
      syncfile.ready(function () {
        syncfile._mfeed.writer('default', function (err, w) {
          t.error(err)
          w.append({ type: 'node' }, function (err) {
            t.error(err)
            syncfile.close(cb)
          })
        })
      })
    }
  })
})
