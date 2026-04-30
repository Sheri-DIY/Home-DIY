export default async function handler(req, res) {
  try {
    const response = await fetch('https://www.wixapis.com/v3/posts', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${process.env.WIX_API_KEY}`,
        'wix-site-id': process.env.WIX_SITE_ID,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to fetch Wix posts',
      details: error.message,
    });
  }
}
