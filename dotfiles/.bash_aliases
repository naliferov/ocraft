alias log='node_modules/.bin/pm2 logs'

branch() {
  git stash &&
  git clean -fd &&
  git fetch &&
  git checkout rel &&
  git branch -D "$1" &&
  git checkout "$1"
}
