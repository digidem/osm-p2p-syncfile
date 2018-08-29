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

## API

var Syncfile = require('osm-p2p-syncfile')

### var syncfile = new Syncfile(filepath, tmpdir, [, opts])

Use whatever extension you'd like; underneath it's a [TAR][tar] archive. The file at `filepath` will be created if it doesn't already exist.

`tmpdir` is a directory that is safe to create temporary files in. This is where the osm-p2p database (not the media though!) will be temporarily extracted to for replication, before being written back to the syncfile.

`opts` is an optional object. Valid properties for `opts` include:

- `multifile`: Allow the syncfile to span multiple archives once a 4 gigabyte limit is reached. The below API works exactly the same, but will be multifile-aware.

### syncfile.on('ready', fn)

Event fired once the syncfile has been found, and the p2p database extracted to `tmpdir`. At this point the following APIs can be safely used.

### var ms = syncfile.replicateMedia()

Returns a duplex replication stream for media.

### var ps = syncfile.replicateDatabase()

Returns a duplex replication stream for the database.

### syncfile.close(cb)

Closes the syncfile. This is critical for cleanup, such as writing the changes to the p2p database extracted to `tmpdir` back to the syncfile.

`cb` is called on completion.

## License

MIT

[tar]: https://en.wikipedia.org/wiki/Tar_%28computing%29
