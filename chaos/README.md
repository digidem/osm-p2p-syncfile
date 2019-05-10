# Setup

To prepare data for testing:

```
$ node generate-syncfile.js sync.tar
$ node generate-syncfile.js /tmp/tmp.tar
$ node sync-new-syncfile.js /tmp/tmp.tar data
```

Now you should have a syncfile in this dir (sync.tar) and a data folder
(data/), both with 1k map records and 1k media blob data.


# Run

There are three tests you can run through the chaos driver script:

- `sync-both-existing.js`: sync an existing database and existing syncfile (with different data) to each other.
- `sync-existing-syncfile.js`: sync an existing syncfile to a brand new database.
- `sync-new-syncfile.js`: sync an existing database to a brand new syncfile.

To run one, execute

```
$ node driver.js 10 $SCRIPT_OF_YOUR_CHOOSING
```

This would run the script (from the 3 above that you chose from) 10 times,
interrupted at some random point as it runs.

The script will first be run once, to completion, to establish a baseline for
how long it takes to run on your system.

Errors & results are reported to standard out.

