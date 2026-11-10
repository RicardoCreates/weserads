function inactivePage(message) {
  return `<!doctype html>
<html lang="de">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Kunden-Magnet nicht aktiv</title></head>
<body style="font-family:Arial,sans-serif;text-align:center;padding:60px 20px;color:#0A1931">
  <h1>Dieser Kunden-Magnet ist nicht aktiv.</h1>
  <p>${message}</p>
  <p>Infos unter <a href="https://weserads.de">weserads.de</a></p>
</body>
</html>`;
}

async function getCustomer(slug) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error('UPSTASH_REDIS_REST_URL und UPSTASH_REDIS_REST_TOKEN sind nicht konfiguriert.');
  }

  const result = await fetch(`${url}/get/${encodeURIComponent(`customer:${slug}`)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!result.ok) {
    throw new Error(`Upstash returned ${result.status}.`);
  }

  const payload = await result.json();
  return payload.result ? JSON.parse(payload.result) : null;
}

module.exports = async function handler(request, response) {
  const slug = String(request.query.slug || '').trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return response.status(404).send('Nicht gefunden.');
  }

  try {
    const customer = await getCustomer(slug);
    if (!customer || !customer.active) {
      response.statusCode = 410;
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      return response.send(inactivePage('Der Link ist nicht mehr verfügbar.'));
    }

    return response.redirect(302, customer.googleUrl);
  } catch (error) {
    console.error('Customer redirect failed:', error);
    return response.status(503).send('Der Kunden-Magnet ist momentan nicht verfügbar.');
  }
};
