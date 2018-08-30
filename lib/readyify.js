module.exports = function (work) {
  var fns = []

  var res = function (fn) {
    if (!res.ready) fns.push(fn)
    else process.nextTick(fn, res.error)
  }
  res.error = undefined
  res.ready = false

  process.nextTick(function () {
    work(function (err) {
      res.ready = true
      res.error = err
      fns.forEach(function (fn) {
        process.nextTick(fn, err)
      })
    })
  })
  return res
}
