# pics.collage

A free photo collage maker that installs on an iPhone (or anything) as a PWA.
Made because the App Store collage apps went subscription.

**Use it:** https://pics.collage.pit.world (or `https://pics.collage` on Moshpit).
On iPhone, open it in Safari, tap **Share → Add to Home Screen**, and it runs
full screen and offline like an app.

## What it does

- 25 grid layouts plus **Freestyle** (loose photos with white frames you can toss around)
- Photos from the camera roll: drag to reposition in a cell, pinch to zoom, swap, replace, fit
- Pinch / twist / drag any photo, sticker or text; corner handle for one-finger scale and rotate, × to delete
- 160 emoji stickers, text in 10 fonts with outline / shadow / label styles and quick picks
- Backdrops: colors, any color picker, gradients, patterns (dots, stripes, hearts, stars, confetti…)
- Border spacing and rounded corners; sizes Square, 4:5, Story 9:16, 3:4, 4:3, 16:9
- Filters: B&W, Noir, Sepia, Warm, Cool, Fade, Vivid
- Undo / redo, autosave, a "My collages" gallery
- Save at 2048 px straight to Photos through the share sheet

Nothing is uploaded. Photos and projects live in IndexedDB on the device; there is
no server code, no account and no tracking.

## Develop

```sh
npm run dev      # builds dist/ and serves it on :5173
npm run build    # dist/ only
npm run deploy   # build + rsync to dev2
```

`src/` is plain HTML/CSS/JS with no dependencies. `build.mjs` bakes in the
Profullstack ring footer and the pit.world footer, rasterizes the icons with
headless Chrome (`CHROME=` to point elsewhere) and versions the service worker.

## Hosting

`pics.collage` is a Moshpit name (ending `.collage`, owned by riotcoder) pointing
at dev2, where nginx serves `/var/www/pics.collage` (vhost in
`deploy/pics.collage.conf`, installed as `/etc/moshpit/templates/pics.collage.conf`
so cert renewals keep it). The pit.world relay serves it on the old internet at
`pics.collage.pit.world`.

MIT licensed.
