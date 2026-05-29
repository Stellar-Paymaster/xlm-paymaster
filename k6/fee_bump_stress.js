import http from 'k6/http';
import { check, sleep } from 'k6';

// k6 execution configuration simulating 100 to 1000 Virtual Users (VUs)
export const options = {
  stages: [
    { duration: '30s', target: 100 },  // Ramp-up to 100 VUs
    { duration: '1m', target: 500 },   // Stress ramp-up to 500 VUs
    { duration: '2m', target: 1000 },  // High-stress peak at 1000 VUs
    { duration: '1m', target: 1000 },  // Sustain 1000 VUs at peak load
    { duration: '30s', target: 0 },    // Ramp-down to 0 VUs
  ],
  thresholds: {
    // Quality of service thresholds
    http_req_duration: ['p(95)<300', 'p(99)<1000'], // 95% of requests under 300ms, 99% under 1s
    http_req_failed: ['rate<0.01'],                  // Request failure rate below 1%
  },
};

export default function () {
  // Use environment variables for flexibility in staging environments
  const baseUrl = __ENV.API_URL || 'http://localhost:3000';
  const url = `${baseUrl}/fee-bump`;
  
  // Dummy XDR payload representing a Stellar transaction envelope needing a fee bump
  const payload = JSON.stringify({
    xdr: 'AAAAAgAAAAApL2j6Nn4Z8z...[DUMMY_TX_XDR_DATA]...',
    submit: false,
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': __ENV.API_KEY || 'default_staging_api_key_here',
    },
  };

  // Perform the POST request to the fee-bump endpoint
  const res = http.post(url, payload, params);

  // Validate the response
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response has xdr or hash': (r) => {
      try {
        const json = JSON.parse(r.body);
        return !!(json.xdr || json.hash);
      } catch (e) {
        return false;
      }
    },
  });

  // Small pacing delay to simulate client behavior and regulate throughput
  sleep(0.1);
}
