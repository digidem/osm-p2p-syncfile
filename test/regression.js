var test = require('tape')
var tar = require('tar-stream')
var path = require('path')
var tmp = require('tmp')
var multifeed = require('multifeed')
var pump = require('pump')
var ram = require('random-access-memory')
var blob = require('abstract-blob-store')
var blobReplicate = require('blob-store-replication-stream')
var fs = require('fs')
var Syncfile = require('..')

blob.prototype._list = function (cb) {
  return process.nextTick(cb, null, Object.keys(this.data))
}

// TODO: ensure we handle existing tarballs with windows separators OK too

test('REGRESSION: windows file separators are written to tarball', function (t) {
  t.plan(15)

  tmp.dir(function (err, dir, cleanup) {
    t.error(err)

    var filepath = path.join(dir, 'sync.tar')
    var mfeed = multifeed(ram, { valueEncoding: 'json' })
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
      media.createWriteStream('river.jpg', sync)
        .end('<IMG DATA>')
    }

    function sync (err) {
      t.error(err, 'add media ok')
      var d = syncfile.replicateData(true, {live: false})
      var r = mfeed.replicate(false, {live: false})
      replicate(r, d, function (err) {
        t.error(err, 'replicate osm ok')
        var d = syncfile.replicateMedia()
        var r = blobReplicate(media)
        replicate(d, r, function (err) {
          t.error(err, 'replicate media ok')
          syncfile.close(reopen)
        })
      })
    }

    var names = []

    function reopen (err) {
      t.error(err, 'closed ok')

      var extract = tar.extract()
      extract.on('entry', function (header, stream, next) {
        // console.log('got', header.name)
        if (header.name === 'osm-p2p-db.tar') {
          var extract2 = tar.extract()
          extract2.on('entry', function (header, stream, next) {
            // console.log('inner-got', header.name)
            names.push(header.name)
            stream.on('end', next)
            stream.resume()
          })
          extract2.on('finish', check)
          stream.pipe(extract2)
        } else {
          stream.resume()
        }
        stream.on('end', next)
      })

      fs.createReadStream(filepath).pipe(extract)
    }

    function check () {
      t.same(names.length, 5, 'right number of files in osm-p2p-db.tar')
      names.forEach(name => {
        t.ok(name.indexOf('\\') === -1, 'no windows-style path separators')
      })
      cleanup(() => t.ok(true, 'cleanup ok'))
    }
  })
})

function replicate (stream1, stream2, cb) {
  pump(stream1, stream2, stream1, cb)
}
