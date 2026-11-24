const MAX_BACKUP_BYTES = 10 * 1024 * 1024; // Matches the app's backup import limit.

function webDavRequest(options) {
  const { url, method, headers, data } = options ?? {};
  const target = typeof url === 'string' && URL.parse(url);
  const authorization = headers?.Authorization;
  if (
    !target || (target.protocol !== 'http:' && target.protocol !== 'https:') ||
    target.username || target.password ||
    target.href.includes('?') || target.href.includes('#') ||
    !target.pathname.endsWith('/french-reading-progress.json') ||
    typeof authorization !== 'string' || !/^Basic [\w+/]+={0,2}$/.test(authorization)
  ) {
    throw new Error('Invalid WebDAV request.');
  }

  const init = { method, headers: { Authorization: authorization } };
  if (method === 'GET') {
    init.headers.Accept = 'application/json';
  } else if (method === 'PUT' && typeof data === 'string' && Buffer.byteLength(data) <= MAX_BACKUP_BYTES) {
    const match = headers['If-Match'];
    const create = headers['If-None-Match'];
    if (typeof match === 'string' && /^"[^"\r\n]*"$/.test(match) && create === undefined) {
      init.headers['If-Match'] = match;
    } else if (create === '*' && match === undefined) {
      init.headers['If-None-Match'] = '*';
    } else {
      throw new Error('WebDAV writes require a version condition.');
    }
    init.headers['Content-Type'] = 'application/json; charset=utf-8';
    init.body = data;
  } else {
    throw new Error('Invalid WebDAV request.');
  }
  return { target, init };
}

async function readBackup(body) {
  if (!body) return '';
  const chunks = [];
  let size = 0;
  for await (const chunk of body) {
    size += chunk.byteLength;
    if (size > MAX_BACKUP_BYTES) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size).toString('utf8');
}

async function requestWebDav(options) {
  const { target, init } = webDavRequest(options);
  try {
    const response = await fetch(target, { ...init, redirect: 'manual', signal: AbortSignal.timeout(30_000) });
    const etag = response.headers.get('etag');
    const headers = etag === null ? {} : { etag };
    if (init.method === 'GET' && response.status === 200) {
      return { status: response.status, headers, data: await readBackup(response.body) };
    }
    await response.body?.cancel();
    return { status: response.status, headers, data: '' };
  } catch {
    // The renderer maps transport failures to its localized error message.
    throw new Error('WebDAV request failed.');
  }
}

module.exports = { requestWebDav };
