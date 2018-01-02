const { Registry, Gauge } = require('prom-client')
const fetch = require('node-fetch')

const reduceFastlyRealtimeResponse = res => res.Data.reduce((carry, item) => {
  Object.keys(item.aggregated).forEach(key => {
    if (!carry[key]) {
      carry[key] = (item.aggregated[key] instanceof Object) ? {} : 0
    }
    if (typeof item.aggregated[key] != 'object' && !carry[key]) carry[key] = 0
    carry[key] += item.aggregated[key]
  })
  return carry
}, {})

// const reduceFastlyResponse = res => {
// }

const toPrometheusMetrics = metrics => {

  const registry = new Registry()

  Object.keys(metrics).map(key => {
    switch (true) {
      case (key.includes('_histogram')): {
        break
      }

      default: {
        const gauge = new Gauge({ name: key, help: key })
        gauge.set(metrics[key])
        registry.registerMetric(gauge)
        break
      }
    }
  })
  return registry
}

module.exports.metrics = (event, context, callback) => {
  fetch(`https://rt.fastly.com/v1/channel/${process.env.FASTLY_SERVICE}/ts/h`, {
      headers: {
        'Fastly-Key': process.env.FASTLY_TOKEN,
        accept: 'application/json'
      }
    })
    .then(res => res.json())
    .then(res => { console.log(JSON.stringify(res)) ; return res })
    .then(reduceFastlyRealtimeResponse)
    .then(toPrometheusMetrics)
    .then(metrics => {
      callback(null, { statusCode: 200, body: metrics.metrics() } )
    })
   .catch(err => callback(null, { statusCode: 500, body: JSON.stringify(err) } ))
}
