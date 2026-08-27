/**
 * Shared HTTPS request helpers for the affiliate scraper.
 *
 * Uses Node's `https` module with the system trust store. Supports an
 * `--insecure` mode that skips TLS certificate verification — needed only on
 * corporately-inspected networks where a MITM proxy serves an expired leaf
 * cert. Do NOT use `--insecure` when handling sensitive data.
 */
import https from 'node:https';

/**
 * POST a JSON body and resolve the parsed JSON response.
 *
 * @param {string} url
 * @param {object} body
 * @param {{ insecure?: boolean, headers?: object }} [opts]
 * @returns {Promise<any>}
 */
export function postJson(url, body, opts = {}) {
  const { insecure = false, headers = {} } = opts;
  const payload = JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          ...headers
        },
        ...(insecure ? { rejectUnauthorized: false } : {})
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`Request failed (${res.statusCode})`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(new Error(`Invalid JSON response: ${err.message}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(60000, () => req.destroy(new Error('Request timed out')));
    req.write(payload);
    req.end();
  });
}

/**
 * GET a URL and resolve the full body buffer.
 *
 * @param {string} url
 * @param {{ insecure?: boolean, headers?: object }} [opts]
 * @returns {Promise<Buffer>}
 */
export function getBuffer(url, opts = {}) {
  const { insecure = false, headers = {} } = opts;

  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers,
        ...(insecure ? { rejectUnauthorized: false } : {})
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          res.resume();
          reject(new Error(`Request failed (${res.statusCode})`));
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      }
    );
    req.on('error', reject);
    req.setTimeout(60000, () => req.destroy(new Error('Request timed out')));
  });
}