#!/usr/bin/env bash
# Real Jellyfin for visual tests (GitHub Actions, Ubuntu 24.04): Jellyfin + File Transformation + this plugin,
# a fake library, a user with some watch progress, and the plugin's home rows pointed at that library.
set -eo pipefail
PLUGIN_ZIP="$1"             # the packaged plugin zip (dll + meta.json)
J=http://localhost:8096
AUTH='MediaBrowser Client="ci", Device="ci", DeviceId="ci-visual", Version="1.0"'

echo "== install Jellyfin"
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://repo.jellyfin.org/jellyfin_team.gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/jellyfin.gpg
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/jellyfin.gpg] https://repo.jellyfin.org/ubuntu $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/jellyfin.list >/dev/null
sudo apt-get update -qq
sudo apt-get install -y -qq jellyfin fonts-dejavu-core >/dev/null
sudo systemctl stop jellyfin || true
dpkg -l | grep -i jellyfin | awk '{print $2, $3}' | tee jellyfin-version.txt

echo "== plugins"
PLUG=/var/lib/jellyfin/plugins
sudo mkdir -p "$PLUG/UshereatsTheme_ci" && sudo unzip -o -q "$PLUGIN_ZIP" -d "$PLUG/UshereatsTheme_ci"
# File Transformation: newest release
FT_URL=$(curl -fsSL -H "Authorization: Bearer $GITHUB_TOKEN" https://api.github.com/repos/IAmParadox27/jellyfin-plugin-file-transformation/releases \
  | python3 -c "import json,sys; r=json.load(sys.stdin); print([a['browser_download_url'] for x in r for a in x['assets'] if a['name'].endswith('.zip')][0])")
echo "FT: $FT_URL" | tee -a jellyfin-version.txt
curl -fsSL "$FT_URL" -o /tmp/ft.zip
sudo mkdir -p "$PLUG/FileTransformation_ci" && sudo unzip -o -q /tmp/ft.zip -d "$PLUG/FileTransformation_ci"
sudo chown -R jellyfin:jellyfin "$PLUG"

echo "== library"
sudo mkdir -p /srv/media && sudo chown "$USER" /srv/media
python3 ci/visual/make_library.py /srv/media /usr/lib/jellyfin-ffmpeg/ffmpeg
sudo chmod -R a+rX /srv/media

start() {
  sudo systemctl start jellyfin
  for i in $(seq 1 120); do curl -fs $J/System/Info/Public >/dev/null 2>&1 && return 0; sleep 1; done
  sudo journalctl -u jellyfin --no-pager | tail -50; exit 1
}
start

api() { # method path [json]   (retries while Jellyfin is (re)starting)
  local m=$1 p=$2 d=${3:-} i rc out
  for i in $(seq 1 90); do
    if [ -n "$d" ]; then out=$(curl -sS -f -X "$m" "$J$p" -H "Authorization: $AUTH${TOKEN:+, Token=\"$TOKEN\"}" -H 'Content-Type: application/json' -d "$d" 2>&1) && rc=0 || rc=$?
    else out=$(curl -sS -f -X "$m" "$J$p" -H "Authorization: $AUTH${TOKEN:+, Token=\"$TOKEN\"}" 2>&1) && rc=0 || rc=$?; fi
    if [ $rc -eq 0 ]; then printf '%s' "$out"; return 0; fi
    if [ $rc -ne 7 ] && [ $rc -ne 52 ] && [ $rc -ne 56 ] && ! echo "$out" | grep -q " 503"; then echo "API $m $p failed: $out" >&2; return $rc; fi
    sleep 1
  done
  echo "API $m $p: server not reachable" >&2; return 7
}

echo "== wizard"
TOKEN=""
api POST /Startup/Configuration '{"UICulture":"en-US","MetadataCountryCode":"US","PreferredMetadataLanguage":"en"}' >/dev/null
api GET /Startup/User >/dev/null || true
api POST /Startup/User '{"Name":"ci","Password":"ci"}' >/dev/null
api POST /Startup/RemoteAccess '{"EnableRemoteAccess":true,"EnableAutomaticPortMapping":false}' >/dev/null || true
api POST /Startup/Complete >/dev/null
LOGIN=$(api POST /Users/AuthenticateByName '{"Username":"ci","Pw":"ci"}')
TOKEN=$(echo "$LOGIN" | python3 -c "import json,sys; print(json.load(sys.stdin)['AccessToken'])")
USERID=$(echo "$LOGIN" | python3 -c "import json,sys; print(json.load(sys.stdin)['User']['Id'])")
SERVERID=$(echo "$LOGIN" | python3 -c "import json,sys; print(json.load(sys.stdin)['ServerId'])")

echo "== libraries"
api POST "/Library/VirtualFolders?name=Movies&collectionType=movies&paths=%2Fsrv%2Fmedia%2Fmovies&refreshLibrary=false" '{"LibraryOptions":{"EnableRealtimeMonitor":false}}' >/dev/null
api POST "/Library/VirtualFolders?name=Shows&collectionType=tvshows&paths=%2Fsrv%2Fmedia%2Fshows&refreshLibrary=false" '{"LibraryOptions":{"EnableRealtimeMonitor":false}}' >/dev/null
api POST /Library/Refresh >/dev/null
for i in $(seq 1 180); do
  N=$(api GET "/Items?userId=$USERID&Recursive=true&IncludeItemTypes=Movie,Episode&Limit=0" | python3 -c "import json,sys; print(json.load(sys.stdin)['TotalRecordCount'])")
  RUNNING=$(api GET "/ScheduledTasks?isHidden=false" | python3 -c "import json,sys; print(sum(1 for t in json.load(sys.stdin) if t.get('State')=='Running'))")
  echo "items=$N running=$RUNNING"; [ "$N" -ge 36 ] && [ "$RUNNING" = 0 ] && break; sleep 2
done

echo "== watch progress"
ids() { api GET "/Items?userId=$USERID&Recursive=true&$1" | python3 -c "import json,sys; print(' '.join(x['Id'] for x in json.load(sys.stdin)['Items']))"; }
MOVIES=($(ids "IncludeItemTypes=Movie&SortBy=SortName"))
NOW=$(date -u +%Y-%m-%dT%H:%M:%S.0000000Z)
for k in 0 3; do
  api POST "/UserItems/${MOVIES[$k]}/UserData?userId=$USERID" "{\"PlaybackPositionTicks\":12000000,\"LastPlayedDate\":\"$NOW\"}" >/dev/null || true
done
SERIES=($(ids "IncludeItemTypes=Series&SortBy=SortName"))
for SID in "${SERIES[0]}" "${SERIES[2]}"; do
  EPS=($(ids "IncludeItemTypes=Episode&ParentId=$SID&SortBy=ParentIndexNumber,IndexNumber"))
  api POST "/UserPlayedItems/${EPS[0]}?userId=$USERID" >/dev/null || true
  api POST "/UserPlayedItems/${EPS[1]}?userId=$USERID" >/dev/null || true
  api POST "/UserItems/${EPS[2]}/UserData?userId=$USERID" "{\"PlaybackPositionTicks\":10000000,\"LastPlayedDate\":\"$NOW\"}" >/dev/null || true
done

echo "== plugin settings"
LIBS=$(api GET "/Library/VirtualFolders")
MOVIELIB=$(echo "$LIBS" | python3 -c "import json,sys; print([x['ItemId'] for x in json.load(sys.stdin) if x['Name']=='Movies'][0])")
SHOWLIB=$(echo "$LIBS" | python3 -c "import json,sys; print([x['ItemId'] for x in json.load(sys.stdin) if x['Name']=='Shows'][0])")
PID=01c723cc-57de-4e19-b13c-514b644491a5
CFG=$(api GET "/Plugins/$PID/Configuration")
NEWCFG=$(echo "$CFG" | MOVIELIB=$MOVIELIB SHOWLIB=$SHOWLIB python3 -c "
import json,os,sys
c=json.load(sys.stdin)
rows=json.loads(c['HomeRowsJson'])
for r in rows:
    if r['id']=='recent-movies': r['parentId']=os.environ['MOVIELIB']; r['more']='#/movies.html?topParentId='+os.environ['MOVIELIB']
    if r['id']=='recent-shows': r['parentId']=os.environ['SHOWLIB']; r['more']='#/tv.html?topParentId='+os.environ['SHOWLIB']
c['HomeRowsJson']=json.dumps(rows)
c['AccentColor']='#46dcff'
c['WelcomeSplash']=False
print(json.dumps(c))")
api POST "/Plugins/$PID/Configuration" "$NEWCFG" >/dev/null
sudo systemctl restart jellyfin; sleep 2; start

cat > ci-session.json <<JSON
{"server":"$J","token":"$TOKEN","userId":"$USERID","serverId":"$SERVERID","movieLib":"$MOVIELIB","showLib":"$SHOWLIB"}
JSON
echo "== ready"; cat ci-session.json
