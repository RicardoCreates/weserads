const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const customerIndexKey = 'customers:index';

function isAdmin(request) {
  return Boolean(process.env.ADMIN_TOKEN) &&
    request.headers.authorization === `Bearer ${process.env.ADMIN_TOKEN}`;
}

function isValidGoogleUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

async function redis(command, ...args) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error('Upstash ist nicht konfiguriert.');
  }

  const result = await fetch(`${url}/${[command, ...args].map(encodeURIComponent).join('/')}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!result.ok) throw new Error(`Upstash returned ${result.status}.`);
  return result.json();
}

function validateInput(body) {
  const slug = String(body.slug || '').trim().toLowerCase();
  const googleUrl = String(body.googleUrl || '').trim();
  const firma = String(body.firma || '').trim();
  if (!slugPattern.test(slug)) {
    return { error: 'Der Slug darf nur Kleinbuchstaben, Zahlen und Bindestriche enthalten.' };
  }
  if (!isValidGoogleUrl(googleUrl) || !firma) {
    return { error: 'Firma und ein gültiger Google-Link sind erforderlich.' };
  }
  return { slug, googleUrl, firma };
}

async function getCustomer(slug) {
  const result = await redis('get', `customer:${slug}`);
  return result.result ? JSON.parse(result.result) : null;
}

module.exports = async function handler(request, response) {
  try {
    if (request.method === 'POST') {
      const input = validateInput(request.body || {});
      if (input.error) return response.status(400).json({ error: input.error });
      if (await getCustomer(input.slug)) {
        return response.status(409).json({ error: 'Dieser Kunden-Slug ist bereits vergeben.' });
      }

      const customer = {
        ...input,
        active: false,
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await redis('set', `customer:${input.slug}`, JSON.stringify(customer));
      await redis('sadd', customerIndexKey, input.slug);
      return response.status(201).json({ success: true, slug: input.slug, status: customer.status });
    }

    if (!isAdmin(request)) {
      response.setHeader('WWW-Authenticate', 'Bearer');
      return response.status(401).json({ error: 'Nicht autorisiert.' });
    }

    if (request.method === 'GET') {
      const index = await redis('smembers', customerIndexKey);
      const customers = [];
      for (const slug of index.result || []) {
        const customer = await getCustomer(slug);
        if (customer) customers.push({ slug, ...customer });
      }
      customers.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      return response.status(200).json({ customers });
    }

    if (request.method !== 'PUT' && request.method !== 'DELETE') {
      response.setHeader('Allow', 'GET, POST, PUT, DELETE');
      return response.status(405).json({ error: 'Methode nicht erlaubt.' });
    }

    const body = request.body || {};
    const slug = String(body.slug || '').trim().toLowerCase();
    if (!slugPattern.test(slug)) {
      return response.status(400).json({ error: 'Ungültiger Kunden-Slug.' });
    }
    const customer = await getCustomer(slug);
    if (!customer) return response.status(404).json({ error: 'Kunde nicht gefunden.' });

    if (request.method === 'DELETE') {
      customer.active = false;
      customer.status = 'inactive';
    } else {
      customer.active = body.active === true;
      customer.status = customer.active ? 'active' : 'inactive';
      if (body.googleUrl !== undefined) {
        if (!isValidGoogleUrl(String(body.googleUrl))) {
          return response.status(400).json({ error: 'Ungültiger Google-Link.' });
        }
        customer.googleUrl = String(body.googleUrl).trim();
      }
      if (body.firma !== undefined) customer.firma = String(body.firma).trim();
    }
    customer.updatedAt = new Date().toISOString();
    await redis('set', `customer:${slug}`, JSON.stringify(customer));
    return response.status(200).json({ success: true, customer: { slug, ...customer } });
  } catch (error) {
    console.error('Customer API failed:', error);
    return response.status(503).json({ error: 'Kundenspeicher ist derzeit nicht verfügbar.' });
  }
};
