namespace Jellyfin.Plugin.UshereatsTheme;

/// <summary>
/// Adds the theme's device cache to the end of Jellyfin's own service worker (serviceworker.js): Jellyfin's app
/// files, the theme's files, fonts and pictures are kept on each device, so opening the site doesn't wait for the
/// network for them. Setting "Keep files on the device" off: the cache is emptied instead.
/// </summary>
public static class ServiceWorkerPatch
{
    private const string Marker = "/* ushereats-theme */";

    // empties the theme's caches (setting off): the browser then just uses the network as before
    private const string Clear = "caches.keys().then(function(k){return Promise.all(k.filter(function(n){return n.indexOf(\"tb-\")===0}).map(function(n){return caches.delete(n)}))});";

    public static string Apply(PatchPayload payload)
    {
        string js = payload.Contents ?? string.Empty;
        if (js.Length == 0 || js.Contains(Marker, System.StringComparison.Ordinal))
        {
            return js;
        }

        bool on = Plugin.Instance?.Configuration.DeviceCache ?? true;
        return js + "\n" + Marker + "\n" + (on ? ThemeAssets.Text("sw_cache.js") : Clear) + "\n";
    }
}
