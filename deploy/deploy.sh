#!/bin/sh
# Ships dist/ to dev2. Static files only: nginx serves /var/www/pics.collage for
# the Moshpit name pics.collage and the pit.world relay carries it to
# https://pics.collage.pit.world for everyone else.
# chmod matters: root's umask on dev2 is 007/027 and nginx then answers 403.
set -eu
cd "$(dirname "$0")/.."
[ -f dist/index.html ] || node build.mjs
HOST="${DEPLOY_HOST:-root@dev2.profullstack.com}"
rsync -rltp --delete --chmod=D755,F644 dist/ "$HOST:/var/www/pics.collage/"
echo "deployed to $HOST:/var/www/pics.collage"
