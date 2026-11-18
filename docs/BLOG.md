# OBI-ISM Journal

The journal uses the existing Cloudflare Worker and its OBI_DB D1 binding. The
landing page shows the three latest published articles. All stories are listed
at /blog.html; each published article has a server-rendered URL at
/api/blog/post/<slug>. That route serves initial HTML, a canonical URL,
article-specific Open Graph and X metadata, and BlogPosting structured data.
/api/blog/sitemap.xml lists published stories and is referenced by robots.txt.

## Writing a story

1. Sign in at /admin/, then choose Journal, or open /admin/blog.html.
2. Enter a title, URL slug, summary, author and article. The visual editor
   supports headings, bold, italic, bullet lists, quotations and links. Use
   the summary to describe the story for social and search previews.
3. Upload a JPEG, PNG or WebP cover up to 1 MiB, or provide a public HTTPS image
   URL. Uploads are saved in D1, and their random URLs are public immediately,
   even when a story is a draft. Do not upload private images.
4. Choose Save draft or Publish story. The public URL appears after publishing.
   A published slug cannot be changed, protecting shared links.

The public renderer supports the editor's listed formatting. Ordered lists,
embedded video, arbitrary HTML and images within article text are not
supported. Deleting or unpublishing a story removes it from the public listing
and sitemap. Uploaded image records are not automatically deleted; plan storage
cleanup carefully before removing any shared image.

## Storage and deployment

The Worker creates blog_posts and blog_images with CREATE TABLE IF NOT EXISTS
when needed. Local D1 and production D1 remain separate; local posts do not
sync to production. Images are stored in D1 as base64, so database storage
grows with uploads. Monitor usage and consider R2 when volume grows.

For production, follow DEPLOYMENT.md: deploy the Worker first, confirm the
new API, then build and publish the static pages to gh-pages. Verify a
published article directly and use a WhatsApp/social debugger after deployment.
Search engines and social platforms control crawling, rankings and preview
caches; publishing metadata does not guarantee a ranking or virality.

Local testing should use the OBI local stack at http://127.0.0.1:5514/.
No production posts or migrations are created merely by building the site.