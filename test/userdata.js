var test = require('tape')
var path = require('path')
var fs = require('fs')
var tmp = require('tmp')
var tar = require('tar-stream')
var Syncfile = require('..')

test('cannot use userdata before ready', function (t) {
  t.plan(3)

  tmp.dir(function (err, dir, cleanup) {
    t.error(err)

    var filepath = path.join(dir, 'sync.tar')
    var syncfile = Syncfile(filepath, dir)

    syncfile.userdata(function (err) {
      t.ok(err instanceof Error)
      syncfile.userdata('foo', function (err) {
        t.ok(err instanceof Error)
        cleanup()
      })
    })

  })
})

test('can set and retrieve userdata', function (t) {
  tmp.dir(function (err, dir, cleanup) {
    t.error(err)

    var filepath = path.join(dir, 'sync.tar')
    var syncfile = Syncfile(filepath, dir)

    syncfile.ready(function () {
      syncfile.userdata(function (err, data) {
        t.error(err)
        t.deepEquals(data, {})

        syncfile.userdata({foo: 'bar'}, function (err) {
          t.error(err)

          syncfile.userdata(function (err, data) {
            t.error(err)
            t.deepEquals(data, {foo: 'bar'})

            syncfile.close(function (err) {
              t.error(err)
              t.end()
            })
          })
        })
      })
    })
  })
})
