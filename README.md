# p2p-syncfile

A general purpose "syncfile" suitable for [sneakernet](https://en.wikipedia.org/wiki/Sneakernet)-style synchronization of data over USB drives or other mediums.

p2p-syncfile was made to overcome specific constraints:

1. All data (files, subdirectories, etc) must fit into a single file.
2. Space may be limited on some devices (e.g. phones), so the archive should be readable without needing to be fully extracted somewhere.
3. New files can be added without needing to rewrite the archive.
4. Many USB drives are formatted with FAT32, which has a file size limit of 4 gigabytes. The archive should automatically overflow to secondary and tertiary files seamlessly.

## Design

Technically, the [ZIP archive format](https://en.wikipedia.org/wiki/ZIP_(file_format)) supports all of these features, but there aren't any Javascript libraries that implement them. I decided it would be easier to build on the much simpler [tar archive format](https://en.wikipedia.org/wiki/Tar_%28computing%29), which has great robust streaming support via the [tar-stream](https://github.com/mafintosh/tar-stream) module.

To support constant time random-access reads, appends, and deletions, an index file is maintained at the end of the tar archive. See [indexed-tarball](https://github.com/noffle/indexed-tarball) for more details. This also supports archives that span multiple files.

## STATUS

> proposal

## API

var Syncfile = require('p2p-syncfile')

### var syncfile = new Syncfile('/path/to/file.sync'[, opts])

Use whatever extension you'd like; underneath it's a ZIP archive.

`opts` is an optional object. Valid properties for `opts` include:

- `multifile`: Allow the syncfile to span multiple archives once a 4 gigabyte limit is reached. The below API works exactly the same, but will be multifile-aware.

### syncfile.pop('/tmp/some_directory', cb)

Extract the last entry of the sync file to a directory of your choosing. It will be created if it doesn't already exist.

`cb` called with an error if this failed, or `null` on success.

This operation is destructive: the last entry of the syncfile archive will be removed, and the central directory record regenerated.

### syncfile.push('/tmp/some_file_or_folder', cb)

Appends the file/folder (recursively) to the sync file. This happens without needing to rewrite the entire archive.

`cb` called with an error if this failed, or `null` on success.

### syncfile.media

An [abstract-blob-store](https://github.com/.../abstract-blob-store)-compatible blob store. In [osm-p2p](https://github.com/digidem/osm-p2p) we use this for media. Blobs can be added or removed, but removals won't necessarily free up disk space. Works best when treated like an append-only blob store.

You don't have to use this: it's just a handy abstraction over the sync file archive.

## License

MIT
