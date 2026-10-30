"""Zips the built plugin and writes manifest.json (so Jellyfin can install/update it from a repository URL)."""
import datetime, hashlib, json, os, sys, zipfile

version, repo = sys.argv[1], sys.argv[2]
GUID = "01c723cc-57de-4e19-b13c-514b644491a5"
NAME = "Ushereats Theme"
DLL = "Jellyfin.Plugin.UshereatsTheme.dll"
ABI = "12.0.0.0"
OVERVIEW = "Custom look for Jellyfin + SleekFin, loaded instantly."
DESCRIPTION = "Serves the theme CSS and scripts from the page head (no flash of the default look). Needs SleekFin and File Transformation."
now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

os.makedirs("dist", exist_ok=True)
meta = {
    "category": "General", "changelog": "Build " + version, "description": DESCRIPTION, "guid": GUID,
    "name": NAME, "overview": OVERVIEW, "owner": repo.split("/")[0], "targetAbi": ABI, "timestamp": now,
    "version": version, "status": "Active", "autoUpdate": True, "imagePath": "", "assemblies": [DLL],
}
zip_name = "ushereats-theme_%s.zip" % version
zip_path = os.path.join("dist", zip_name)
with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
    z.write(os.path.join("out", DLL), DLL)
    z.writestr("meta.json", json.dumps(meta, indent=2))

md5 = hashlib.md5(open(zip_path, "rb").read()).hexdigest()
manifest = [{
    "guid": GUID, "name": NAME, "overview": OVERVIEW, "description": DESCRIPTION,
    "owner": repo.split("/")[0], "category": "General", "imageUrl": "",
    "versions": [{
        "version": version, "changelog": "Build " + version, "targetAbi": ABI,
        "sourceUrl": "https://github.com/%s/releases/download/v%s/%s" % (repo, version, zip_name),
        "checksum": md5, "timestamp": now,
    }],
}]
json.dump(manifest, open(os.path.join("dist", "manifest.json"), "w"), indent=2)
print("packaged", zip_name, md5)
