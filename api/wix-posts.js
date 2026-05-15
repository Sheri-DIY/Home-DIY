export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.WIX_API_KEY;
  const siteId = process.env.WIX_SITE_ID;

  if (!apiKey || !siteId) {
    return res.status(500).json({
      error: 'Missing environment variables',
      missing: { WIX_API_KEY: !apiKey, WIX_SITE_ID: !siteId },
    });
  }

  const limit = Math.min(parseInt(req.query.limit) || 100, 100);
  const offset = parseInt(req.query.offset) || 0;

  try {
    const url = `https://www.wixapis.com/blog/v3/posts?sort=publishedDate:desc&limit=${limit}&offset=${offset}`;
    const wixRes = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'wix-site-id': siteId,
        'Content-Type': 'application/json',
      },
    });

    const text = await wixRes.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (!wixRes.ok) {
      return res.status(wixRes.status).json({
        error: 'Wix API request failed',
        status: wixRes.status,
        data,
      });
    }

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to fetch Wix posts',
      details: error.message,
    });
  }
}
