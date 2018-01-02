const { Registry, Gauge, Histogram } = require('prom-client')
const fetch = require('node-fetch')


// Utility functino to deep-merge Histogram datatypes.
const mergeHistograms = histograms => histograms.reduce(
  (newHistogram, oldHistogram) => {
    Object.keys(oldHistogram).forEach(histogramKey => {

      if (!newHistogram[histogramKey]) {
        newHistogram[histogramKey] = 0
      }
      newHistogram[histogramKey] += oldHistogram[histogramKey]

    })
    return newHistogram
  }, new Object()
)


// Reduce a response from Fastly's realtime API.
const reduceFastlyRealtimeResponse = res => ({

  // Use the metrics key for our flattened response data.
  metrics: res.Data.reduce((carry, item) => {
    Object.keys(item.aggregated).forEach(key => {

      if (!carry[key]) {
        carry[key] = (item.aggregated[key] instanceof Object) ? {} : 0
      }

      // Use a switch to differentiate between different datatypes in Fastly's API
      switch (true) {

        // Histograms are a special case and need to be aggregated.
        case (key.includes('_histogram')): {
          carry[key] = mergeHistograms([carry[key], item.aggregated[key]])
          break
        }

        default: {
          carry[key] += item.aggregated[key]
          break
        }
      }
    })
    return carry
  }, {}),

  // Account for a delay in aggregate metrics.
  timestamp: ("AggregateDelay" in res) ? (res.Timestamp - res.AggregateArray) : res.Timestamp
})


// Convert a flattened Fastly API response to a Prometheus Registry with Metrics.
const toPrometheusMetrics = data => {

  const {metrics, timestamp} = data
  const registry = new Registry()

  Object.keys(metrics).map(statisticName => {

    // Use a switch to differentiate between different datatypes in the flattened response.
    switch (true) {

      // Histograms can be mapped directly to the Histogram datatype.
      case (statisticName.includes('_histogram')): {
        const histogramBuckets = Object.keys(metrics[statisticName]).map(i => parseInt(i))
        const histogram = new Histogram({
          name: statisticName,
          help: statisticName,
          registers: [registry],
          buckets: histogramBuckets
        })
        histogramBuckets.forEach(histogramBucket => {
          histogram.observe(histogramBucket, histogramBuckets[histogramBucket])
        })
        registry.registerMetric(histogram)
        break
      }

      // All other metrics vary over time and so are expressed as Gauges.
      default: {
        const gauge = new Gauge({
          name: statisticName,
          help: statisticName,
          registers: [registry]
        })
        gauge.set(metrics[statisticName], timestamp)
        registry.registerMetric(gauge)
        break
      }
    }
  })
  return registry
}

// Serverless endpoint for handling Metrics calls.
module.exports.metrics = (event, context, callback) => {
  fetch(`https://rt.fastly.com/v1/channel/${process.env.FASTLY_SERVICE}/ts/h`, {
      headers: {
        'Fastly-Key': process.env.FASTLY_TOKEN,
        accept: 'application/json'
      }
    })
    .then(res => res.json())
    .then(reduceFastlyRealtimeResponse)
    .then(toPrometheusMetrics)
    .then(metrics => {
      callback(null, { statusCode: 200, body: metrics.metrics() } )
    })
   .catch(err => callback(null, { statusCode: 500, body: JSON.stringify(err) } ))
}
