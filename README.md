# Fastly Exporter

A Prometheus Exporter for grabbing metrics from Fastly.  This runs as a Lambda function.

This relies upon the Fastly real-time API and collects aggregate metrics (not based on any specific POP) for the last 120 seconds. Prometheus should be set up to scrape accordingly.

# Deploying with Serverless

```
$ yarn
$ export FASTLY_TOKEN=<fastly-token-here>
$ export FASTLY_SERVICE=<fastly-service-here>
$ serverless deploy --aws-profile <aws-profile> --stage <stage>
```

## Prometheus Exporter Configuration
```
  - job_name: fastly
    scrape_interval: 120s
    scrape_timeout: 30s
    scheme: https
    metrics_path: /<stage>/metrics
    static_configs:
      - targets: ['<gateway-here>.execute-api.eu-west-1.amazonaws.com:443']
```
