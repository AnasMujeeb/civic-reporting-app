/**
 * test-upload-flow.js — End-to-end upload test
 *
 * Tests:  Login → POST /api/v1/reports with a real image → verify fallback works
 * Run:    node scripts/test-upload-flow.js
 */

const http = require('http');
const crypto = require('crypto');

const BASE = 'http://localhost:5000';

// ── Helper: HTTP request returning a promise ────────────────────────────────
const request = (method, path, body, headers = {}) => {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const isJson = typeof body === 'string';

    const opts = {
      hostname: url.hostname,
      port:     url.port,
      path:     url.pathname + url.search,
      method,
      headers:  { ...headers },
    };

    if (isJson) {
      opts.headers['Content-Type'] = 'application/json';
    }

    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      if (Buffer.isBuffer(body)) {
        req.write(body);
      } else {
        req.write(body);
      }
    }
    req.end();
  });
};

// ── Helper: Build multipart/form-data ───────────────────────────────────────
const buildMultipart = (fields, file) => {
  const boundary = '----FormBoundary' + crypto.randomBytes(8).toString('hex');
  const parts = [];

  for (const [key, value] of Object.entries(fields)) {
    parts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${key}"\r\n\r\n` +
      `${value}\r\n`
    );
  }

  if (file) {
    parts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${file.fieldName}"; filename="${file.filename}"\r\n` +
      `Content-Type: ${file.contentType}\r\n\r\n`
    );
    // We'll need to handle the buffer separately
  }

  const headerBuffer = Buffer.from(parts.join(''));
  const footerBuffer = Buffer.from(`\r\n--${boundary}--\r\n`);

  return {
    boundary,
    body: file
      ? Buffer.concat([headerBuffer, file.buffer, footerBuffer])
      : Buffer.concat([headerBuffer, footerBuffer]),
  };
};

// ── Minimal valid JPEG (1x1 red pixel) ──────────────────────────────────────
const TINY_JPEG = Buffer.from(
  'ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707' +
  '07090908080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c23' +
  '1c1c2837292c30313434341f27393d38323c2e333432ffc0000b08000100010101' +
  '1100ffc4001f0000010501010101010100000000000000000102030405060708090a' +
  '0bffc400b5100002010303020403050504040000017d0102030004110512213141' +
  '0613516107227114328191a1082342b1c11552d1f02433627282090a161718191a25' +
  '2627282930313233343536373839ffda000801010000003f00fbd5e8a00fffd9',
  'hex'
);

(async () => {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║       Upload Flow Integration Test                ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  const testPhone = `test${Date.now()}`;

  // ── Step 1: Register ──────────────────────────────────────────────────
  console.log('── Step 1: Register ────────────────────────────────');
  const reg = await request('POST', '/api/v1/auth/register', JSON.stringify({
    name: 'Test User',
    phone: testPhone,
    password: 'Test1234!',
  }));
  console.log(`  Status: ${reg.status}`);
  if (reg.status !== 201) {
    console.log('  Body:', JSON.stringify(reg.body));
  }

  const token = reg.body?.data?.token;
  if (!token) {
    console.error('  ❌ No token received. Cannot continue.');
    process.exit(1);
  }
  console.log(`  ✅ Token: ${token.slice(0, 20)}...`);

  // ── Step 2: POST /api/v1/reports with image ───────────────────────────
  console.log('\n── Step 2: Create Report with Image ────────────────');

  const { boundary, body } = buildMultipart(
    {
      title:       'Test Pothole Report',
      description: 'Large pothole on main road — integration test',
      category:    'ROAD_REPAIR',
      latitude:    '24.8607',
      longitude:   '67.0011',
    },
    {
      fieldName:   'image',
      filename:    'test-pothole.jpg',
      contentType: 'image/jpeg',
      buffer:      TINY_JPEG,
    }
  );

  const report = await new Promise((resolve, reject) => {
    const url = new URL('/api/v1/reports', BASE);
    const req = http.request(
      {
        hostname: url.hostname,
        port:     url.port,
        path:     url.pathname,
        method:   'POST',
        headers:  {
          'Content-Type':  `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
          'Authorization': `Bearer ${token}`,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode, body: data }); }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });

  console.log(`  Status  : ${report.status}`);
  console.log(`  Success : ${report.body?.success}`);
  console.log(`  Message : ${report.body?.message || 'N/A'}`);

  if (report.body?.data?.imageUrl) {
    console.log(`  Image URL: ${report.body.data.imageUrl}`);
    const isLocal = report.body.data.imageUrl.startsWith('/uploads/');
    console.log(`  Storage  : ${isLocal ? 'LOCAL FALLBACK ✅' : 'CLOUDINARY ✅'}`);
  }

  if (report.status === 201) {
    console.log('\n══════════════════════════════════════════════════');
    console.log('  🎉 Report created successfully! Upload flow works.');
    console.log('══════════════════════════════════════════════════\n');
  } else {
    console.log('\n  ⚠️ Report creation returned non-201. Check server logs.');
    console.log('  Response:', JSON.stringify(report.body, null, 2));
  }

  process.exit(0);
})();
