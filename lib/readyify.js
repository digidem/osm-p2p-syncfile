module.exports = function readyify (work) {
  var fns = []
  var isReady = false
  var error

  // This function will queue up tasks which will run when work is done
  function readyFn (fn) {
    if (!isReady) fns.push(fn)
    else process.nextTick(fn, error)
  }

  // When work is done, call all queued functions
  function done (err) {
    isReady = true
    error = err
    fns.forEach(function (fn) {
      process.nextTick(fn, err)
    })
  }

  process.nextTick(work, done)

  return readyFn
}
