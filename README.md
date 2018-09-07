# osm-p2p-syncfile

## Design

osm-p2p-syncfile was made to overcome specific constraints:

1. All data (files, subdirectories, etc) must fit into a single file.
2. Space may be limited on some devices (e.g. phones), so the archive should be readable without needing to be fully extracted somewhere.
3. New files can be added without needing to rewrite the archive.
4. Many USB drives are formatted with FAT32, which has a file size limit of 4 gigabytes. The archive should automatically overflow to secondary and tertiary files seamlessly.

Technically, the [ZIP archive format](https://en.wikipedia.org/wiki/ZIP_(file_format)) supports all of these features, but there aren't any Javascript libraries that implement them. I decided it would be easier to build on the much simpler [tar archive format][tar], which has great robust streaming support via the [tar-stream](https://github.com/mafintosh/tar-stream) module.

To support constant time random-access reads, appends, and deletions, an index file is maintained at the end of the tar archive. See [indexed-tarball](https://github.com/noffle/indexed-tarball) for more details. This also supports archives that span multiple files.

## STATUS

> work-in-progress

## Example

Let's create two osm-p2p databases and sync a node and photo between them using an intermediary syncfile. Normally this syncfile would be on a USB key, and each osm-p2p database would be on a separate device.

```js
var Osm = require('osm-p2p')
var Blob = require('safe-fs-blob-store')
var Syncfile = require('osm-p2p-syncfile')

function createDb (n) {
  var osm = Osm('/tmp/foo-' + n + '.p2p')
  var media = Blob('/tmp/foo-' + n + '.media')
  return { osm: osm, media: media }
}

var db1 = createDb(1)
var db2 = createDb(2)
var syncfile = new Syncfile('/tmp/sync1', '/tmp')

var id

var node = { type: 'node', lat: 12.0, lon: 53.0, tags: { foo: 'bar' } }

db1.osm.put(node, function (err, node) {
  if (err) throw err

  id = node.value.id

  db1.ready(function () {
    db1.media.createWriteStream('photo.png', function () {
      syncfile.ready(sync)
    })
      .end('media data!')
  })
})

function sync () {
  // 1. sync db1 to the syncfile
  replicate(
    db1.osm.replicate(),
    syncfile.createDatabaseReplicationStream(),
    function (err) {
      if (err) throw err

      syncfile.close(function () {
        var syncfile = new Syncfile('/tmp/sync1', '/tmp')
        syncfile.ready(function () {
          // 2. sync the syncfile to db2
          replicate(
            syncfile.createDatabaseReplicationStream(),
            db1.osm.replicate(),
            function (err) {
              if (err) throw err
              check()
            })
        })
      })
    })
}

function check () {
  db2.osm.ready(function () {
    db2.osm.get(id, function (err, elm) {
      if (err) throw err
      console.log(elm)
      db2.media.createReadStream('photo.png').pipe(process.stdout)
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

```

outputs

```
{ type: 'node', lat: 12.0, lon: 53.0, tags: { foo: 'bar' } }
media data!
```

## API

```js
var Syncfile = require('osm-p2p-syncfile')
```

### var syncfile = new Syncfile(filepath, tmpdir, [, opts])

Use whatever extension you'd like; underneath it's a [TAR][tar] archive. The file at `filepath` will be created if it doesn't already exist.

`tmpdir` is a directory that is safe to create temporary files in. This is where the osm-p2p database (not the media though!) will be temporarily extracted to for replication, before being written back to the syncfile.

`opts` is an optional object. Valid properties for `opts` include:

- `multifile`: Allow the syncfile to span multiple archives once a 4 gigabyte limit is reached. The below API works exactly the same, but will be multifile-aware.

### syncfile.ready(cb)

Call `cb` once the syncfile is ready to perform replication. If the syncfile is already ready, `cb` is called immediately.

If setting up the syncfile was not successful, `cb` will be called as `cb(err)`.

### syncfile.osm

Reference to an [osm-p2p-db][osm-p2p-db] database. Not set until `ready` fires.

With this you can do things like replication, like `osm.log.replicate({live:false})`.

### syncfile.media

Reference to an [abstract-blob-store](https://github.com/maxogden/abstract-blob-store). Not set until `ready` fires.

With this you can do things like replication, using [blob-store-replication-stream](https://github.com/noffle/blob-store-replication-stream).

### syncfile.close(cb)

Closes the syncfile. This is critical for cleanup, such as writing the changes to the p2p database extracted to `tmpdir` back to the syncfile.

`cb` is called on completion.

## License

MIT

[tar]: https://en.wikipedia.org/wiki/Tar_%28computing%29
