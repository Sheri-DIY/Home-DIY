export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.WIX_API_KEY;
  const siteId = process.env.WIX_SITE_ID;

  if (!apiKey || !siteId) {
    return res.status(500).json({ error: 'Missing environment variables' });
  }

  const { slug, id } = req.query;
  if (!slug && !id) {
    return res.status(400).json({ error: 'slug or id query param required' });
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'wix-site-id': siteId,
    'Content-Type': 'application/json',
  };

  try {
    let post = null;

    if (slug) {
      // Try slug-based endpoint first
      const slugRes = await fetch(
        `https://www.wixapis.com/blog/v3/posts/slugs/${encodeURIComponent(slug)}?fieldsets=RICH_CONTENT`,
        { headers }
      );
      if (slugRes.ok) {
        const data = await slugRes.json();
        post = data.post || data;
      } else {
        // Fallback: list posts filtered by slug
        const listRes = await fetch(
          `https://www.wixapis.com/blog/v3/posts?slug=${encodeURIComponent(slug)}&fieldsets=RICH_CONTENT&limit=1`,
          { headers }
        );
        if (listRes.ok) {
          const data = await listRes.json();
          post = data.posts?.[0] || null;
        }
      }
    } else {
      const idRes = await fetch(
        `https://www.wixapis.com/blog/v3/posts/${encodeURIComponent(id)}?fieldsets=RICH_CONTENT`,
        { headers }
      );
      if (idRes.ok) {
        const data = await idRes.json();
        post = data.post || data;
      }
    }

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Extract image URL from various possible coverMedia structures
    const coverMedia = post.coverMedia || {};
    const imageUrl =
      coverMedia.image?.url ||
      coverMedia.image?.src?.url ||
      coverMedia.url ||
      coverMedia.src?.url ||
      null;

    // Convert Ricos rich content to HTML
    const richContent = post.richContent;
    const contentHtml = richContent ? ricosToHtml(richContent) : (post.content || '');

    // Determine category label
    const category =
      (post.categories?.[0]?.label) ||
      (post.tagIds?.length ? 'DIY Tips' : 'DIY Tips');

    const result = {
      id: post.id,
      title: post.title || '',
      slug: post.slug || slug || '',
      excerpt: post.excerpt || post.plainContent || '',
      imageUrl,
      contentHtml,
      publishedDate: post.publishedDate || post.firstPublishedDate || null,
      minutesToRead: post.minutesToRead || null,
      category,
    };

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch post', details: error.message });
  }
}

// ─── Ricos-to-HTML converter ──────────────────────────────────────────────────

function ricosToHtml(richContent) {
  if (!richContent || !Array.isArray(richContent.nodes)) return '';
  return richContent.nodes.map(renderNode).join('');
}

function renderNode(node) {
  if (!node) return '';
  const children = () => (node.nodes || []).map(renderNode).join('');

  switch (node.type) {
    case 'PARAGRAPH': {
      const inner = children();
      return inner.trim() ? `<p>${inner}</p>` : '';
    }
    case 'HEADING': {
      const level = node.headingData?.level || 2;
      const tag = `h${Math.min(Math.max(level, 1), 6)}`;
      return `<${tag}>${children()}</${tag}>`;
    }
    case 'UNORDERED_LIST':
    case 'BULLET_LIST':
      return `<ul>${children()}</ul>`;
    case 'ORDERED_LIST':
      return `<ol>${children()}</ol>`;
    case 'LIST_ITEM':
      return `<li>${children()}</li>`;
    case 'BLOCKQUOTE':
    case 'QUOTE':
      return `<blockquote><p>${children()}</p></blockquote>`;
    case 'CODE_BLOCK':
      return `<pre><code>${children()}</code></pre>`;
    case 'DIVIDER':
    case 'HORIZONTAL_LINE':
      return '<hr />';
    case 'IMAGE': {
      const d = node.imageData || {};
      const src =
        d.image?.src?.url ||
        d.image?.url ||
        d.src?.url ||
        d.url ||
        '';
      if (!src) return '';
      const alt = esc(d.altText || d.alt || '');
      const caption = d.caption || d.link?.description || '';
      return caption
        ? `<figure><img src="${esc(src)}" alt="${alt}" /><figcaption>${esc(caption)}</figcaption></figure>`
        : `<figure><img src="${esc(src)}" alt="${alt}" /></figure>`;
    }
    case 'HTML': {
      const html = node.htmlData?.html || node.html || '';
      return html;
    }
    case 'TEXT': {
      return renderText(node);
    }
    default:
      return children();
  }
}

function renderText(node) {
  const { text = '', decorations = [] } = node.textData || {};
  if (!text) return '';
  let result = esc(text);

  const bold = decorations.some(d => d.type === 'BOLD');
  const italic = decorations.some(d => d.type === 'ITALIC');
  const underline = decorations.some(d => d.type === 'UNDERLINE');
  const link = decorations.find(d => d.type === 'LINK');
  const color = decorations.find(d => d.type === 'COLOR');

  if (color?.colorData?.foreground) {
    result = `<span style="color:${esc(color.colorData.foreground)}">${result}</span>`;
  }
  if (link) {
    const href = link.linkData?.link?.url || link.linkData?.url || '#';
    const target = link.linkData?.link?.target === '_BLANK' ? ' target="_blank" rel="noopener"' : '';
    result = `<a href="${esc(href)}"${target}>${result}</a>`;
  }
  if (underline) result = `<u>${result}</u>`;
  if (italic) result = `<em>${result}</em>`;
  if (bold) result = `<strong>${result}</strong>`;

  return result;
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
