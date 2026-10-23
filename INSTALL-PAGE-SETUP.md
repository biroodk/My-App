# Folder Locker install page and community setup

The install page is a static site in `install-page/`. `netlify.toml` publishes that folder and deploys the functions in `netlify/functions/`. The routes `/api/community` and `/api/stats` are redirected to those functions.

## Community storage

The community now uses two site-wide Netlify Blobs stores created by the functions at runtime:

- `folder-locker-community-v2` stores user records, username indexes, sessions, posts, likes, comments, replies, and announcements.
- `folder-locker-community-avatars-v2` stores profile-picture bytes.

No external database URL, service key, or SQL migration is required for normal community use. Do not add database secrets to the HTML or JavaScript. Data is stored in Netlify and persists across deployments. Netlify Blobs is a simple key-value store, not a relational SQL database; this implementation is intended for a small starter community and should be migrated to a transactional database if it grows significantly or needs advanced moderation/recovery features.

Community features supported by the page are account creation, login/logout, username/password changes, profile picture upload, posts, owner-only post editing/deletion, likes, comments, replies, pagination (20 posts per page), announcements, and the optional administrator panel. Profile pictures must be JPG, PNG, WEBP, or GIF and no larger than 3 MB. User passwords are hashed on the server rather than stored in plain text.

### Optional administrator setup

Regular registration and community use do not require environment variables. The optional first-time administrator form requires a private `SYSTEM_SETUP_SECRET` environment variable in the Netlify site settings. Generate a value from Termux with:

```sh
openssl rand -hex 32
```

Copy it directly into Netlify's environment-variable settings; never commit it to the repository or send it in public messages. Redeploy after changing environment variables. Then use the community's “First-time System administrator setup” panel before an administrator has been created. The administrator password must contain at least 16 characters, including uppercase, lowercase, a number, and a symbol. Once setup succeeds, the one-time setup marker prevents a second setup.

If you do not need announcements or an administrator dashboard, you can simply use the registration and community forms. Do not expose the setup secret to users.

## APK download counter

The counter labelled **Completed APK downloads** increments only when the install page is allowed to fetch and receive the entire release APK response. On browsers that block cross-origin access to the GitHub release file, the page falls back to the official direct download and reports that completion tracking could not be confirmed; that fallback is deliberately not counted. The counter tracks the full response reaching the webpage, not proof that Android saved the file or completed installation. Web pages cannot reliably verify native Android installation.

The release APK remains hosted on GitHub Releases. It is not proxied through Netlify Functions, because the current APK is around 45 MB and Netlify Functions have payload limits. Visitors should use the browser or Android Downloads interface to open the APK and approve installation/update.

## Offline behavior

The Android vault pages and their JavaScript assets are packaged locally inside the APK. File browsing, categories, selection, moving, copying, renaming, and other local vault operations do not depend on the community database or internet access. Online actions such as the website community and opening WhatsApp naturally require their respective services/network.

## Deployment and verification

1. Make sure the Netlify site is connected to the intended GitHub repository and its publish directory is `install-page` (already declared in `netlify.toml`).
2. Deploy the source. If Netlify has temporarily blocked or paused deployments for the account, this source change cannot become live until Netlify accepts a deploy; updating the files alone does not modify the hosted site.
3. After deployment, open the public site and test a new username, login/logout, avatar upload, creating/editing/deleting a post, likes, comments, replies, and loading older posts.
4. Download the APK using the install button. Confirm that the count only changes after the entire APK response is received, or confirm that the page explicitly identifies the direct-download fallback when the browser blocks tracking.
5. Review Netlify Function logs if `/api/community` or `/api/stats` returns an error. Netlify Blobs storage is provided by the hosting platform; no Supabase setup is used by these functions.
