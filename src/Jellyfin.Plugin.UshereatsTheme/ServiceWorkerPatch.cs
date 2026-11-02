namespace Jellyfin.Plugin.UshereatsTheme;

/// <summary>
/// Adds the theme's quick start to the end of Jellyfin's own service worker (serviceworker.js): the requests Jellyfin
/// makes one after another before it draws anything are answered from the copy from last time (see sw-cache.js).
/// Setting "Quick start" off: the kept copies are emptied instead.
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
