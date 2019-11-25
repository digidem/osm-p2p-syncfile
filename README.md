# osm-p2p-syncfile

## Design

osm-p2p-syncfile was made to overcome specific constraints:

1. All data (files, subdirectories, etc) must fit into a single file.
2. Space may be limited on some devices (e.g. phones), so the archive should be readable without needing to be fully extracted somewhere.
3. New files can be added without needing to rewrite the archive.
4. Many USB drives are formatted with FAT32, which has a file size limit of 4 gigabytes. The archive should automatically overflow to secondary and tertiary files seamlessly.

Technically, the [ZIP archive format](https://en.wikipedia.org/wiki/ZIP_(file_format)) supports all of these features, but there aren't any Javascript libraries that implement them. I decided it would be easier to build on the much simpler [tar archive format][tar], which has great robust streaming support via the [tar-stream](https://github.com/mafintosh/tar-stream) module.

To support constant time random-access reads, appends, and deletions, an index file is maintained at the end of the tar archive. See [indexed-tarball](https://github.com/noffle/indexed-tarball) for more details. This also supports archives that span multiple files.

## Example

Let's create two osm-p2p databases and sync a node and photo between them using an intermediary syncfile. Normally this syncfile would be on a USB key, and each osm-p2p database would be on a separate device.

```js
var Osm = require('osm-p2p')
var Blob = require('safe-fs-blob-store')
var BlobSync = require('blob-store-replication-stream')
var Syncfile = require('..')
var tmp = require('tmp')
var os = require('os')
var path = require('path')

function createDb (n) {
  var dir = tmp.dirSync().name
  var osm = Osm(dir)
  var media = Blob(path.join(dir, 'media'))
  return { osm: osm, media: media }
}

var db1 = createDb(1)
var db2 = createDb(2)
var syncfilePath = path.join(tmp.dirSync().name, 'sync.tar')
var syncfile = new Syncfile(syncfilePath, os.tmpdir())

var id

var node = { type: 'node', lat: 12.0, lon: 53.0, tags: { foo: 'bar' }, changeset: '123' }

db1.osm.create(node, function (err, node) {
  if (err) throw err

  id = node.id

  db1.osm.ready(function () {
    db1.media.createWriteStream('photo.png', function () {
      syncfile.ready(onSync)
    })
      .end('media data!')
  })
})

function onSync () {
  // 1. sync db1 to the syncfile
  sync(db1, syncfile, function () {
    syncfile.close(function () {
      syncfile = new Syncfile(syncfilePath, os.tmpdir())
      syncfile.ready(function () {
        // 2. sync the syncfile to db2
        sync(db2, syncfile, check)
      })
    })
  })
}

function check () {
  syncfile.close(function () {
    db2.osm.ready(function () {
      db2.osm.get(id, function (err, elm) {
        if (err) throw err
        console.log(elm)
        db2.media.createReadStream('photo.png').pipe(process.stdout)
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
  replicate(db.osm.replicate(), syncfile.replicateData(), function (err) {
    if (err) throw err
    if (!--pending) cb()
  })
  replicate(BlobSync(db.media), syncfile.replicateMedia(), function (err) {
    if (err) throw err
    if (!--pending) cb()
  })
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

- `encryptionKey`: If you are syncing with a multifeed instance that is using a custom encryptionKey, then you also need to pass this as an opt to Syncfile

### syncfile.ready(cb)

Call `cb` once the syncfile is ready to perform replication. If the syncfile is already ready, `cb` is called immediately.

If setting up the syncfile was not successful, `cb` will be called as `cb(err)`.

### var stream = syncfile.replicateData(opts)

Returns a replication duplex stream that you can hook up to another kappa-osm (or multifeed) database replication stream to sync the two together.

### var stream = syncfile.replicateMedia(opts)

Returns a replication duplex stream that you can hook up to another media store (via [blob-store-replication-stream](https://github.com/noffle/blob-store-replication-stream)).

### syncfile.userdata([data, ]cb)

Mechanism to store an arbitrary JS object (encoded to JSON) inside the syncfile. This can be used for storing things like database versioning info, or an identifier that limits what datasets should sync with the syncfile.

If `data` is given, the object is JSON encoded and stored in the tarball as well. If only `cb` is given, the current userdata will be retrieved.

### syncfile.close(cb)

Closes the syncfile. This is critical for cleanup, such as writing the changes to the p2p database extracted to `tmpdir` back to the syncfile.

`cb` is called on completion.

## CLI

You can use this as a command line application as well:

```
npm install --global osm-p2p-syncfile
```

Usage:

```
USAGE: osm-p2p-syncfile COMMAND SYNCFILE [ARGS]

Commands:
  init [OSMDIR]     Create a new syncfile, optionally from an existing OSM
                    directory.

  add [FILE]        Add a file to the blob/media store.

  list|ls           Print all blobs/media and all OSM data in the syncfile.

  get [FILENAME]    Dump a blob/media file from the syncfile to stdout.

  sync [SYNCFILE]   Sync this syncfile with another syncfile, exchanging all
                    blobs/media and OSM data.
```

## License

MIT

[tar]: https://en.wikipedia.org/wiki/Tar_%28computing%29
