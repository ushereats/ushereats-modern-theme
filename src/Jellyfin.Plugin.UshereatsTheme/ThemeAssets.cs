using System.IO.Compression;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Jellyfin.Plugin.UshereatsTheme.Sleek;
using Jellyfin.Plugin.UshereatsTheme.Configuration;

namespace Jellyfin.Plugin.UshereatsTheme;

/// <summary>
/// One ready-to-send copy of the theme (plain, gzip and brotli), rebuilt only when the settings change.
/// </summary>
public sealed class ThemeBuild
{
    public string Key { get; init; } = string.Empty;

    /// <summary>Version of theme.css + theme.js (changes whenever either changes).</summary>
    public string Version { get; init; } = string.Empty;

    public string SplashVersion { get; init; } = string.Empty;

    public string FontVersion { get; init; } = string.Empty;

    public PluginConfiguration Config { get; init; } = new PluginConfiguration();

    public Payload Css { get; init; } = Payload.Empty;

    /// <summary>Everything except the splash and the dashboard skin.</summary>
    public Payload Js { get; init; } = Payload.Empty;

    /// <summary>Only downloaded on a new session (when the welcome splash can show).</summary>
    public Payload SplashJs { get; init; } = Payload.Empty;

    /// <summary>Only downloaded when you open the admin dashboard.</summary>
    public Payload DashboardJs { get; init; } = Payload.Empty;

    /// <summary>Parts loaded only when needed (details pages, the player, the sign-in page), by name.</summary>
    public IReadOnlyDictionary<string, Payload> Parts { get; init; } = new Dictionary<string, Payload>();

    public byte[] Mp3 { get; init; } = Array.Empty<byte>();
}

public sealed class Payload
{
    public static readonly Payload Empty = new Payload(Array.Empty<byte>());

    public Payload(byte[] raw)
    {
        Raw = raw;
        Gzip = Compress(raw, false);
        Brotli = Compress(raw, true);
        Hash = Convert.ToHexString(SHA256.HashData(raw)).Substring(0, 12).ToLowerInvariant();
        ETag = "\"" + Hash + "\"";
    }

    public byte[] Raw { get; }

    public byte[] Gzip { get; }

    public byte[] Brotli { get; }

    public string Hash { get; }

    public string ETag { get; }

    private static byte[] Compress(byte[] data, bool brotli)
    {
        if (data.Length == 0)
        {
            return data;
        }

        using MemoryStream ms = new MemoryStream();
        using (Stream z = brotli
            ? new BrotliStream(ms, CompressionLevel.SmallestSize, true)
            : new GZipStream(ms, CompressionLevel.SmallestSize, true))
        {
            z.Write(data, 0, data.Length);
        }

        return ms.ToArray();
    }
}

public static class ThemeAssets
{
    /// <summary>Self-hosted fonts: URL name -> embedded file.</summary>
    public static readonly IReadOnlyDictionary<string, string> Fonts = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
    {
        ["funnel-latin.woff2"] = "font_funnel_latin.woff2",
        ["funnel-latin-ext.woff2"] = "font_funnel_latin_ext.woff2",
        ["bebas-latin.woff2"] = "font_bebas_latin.woff2",
        ["bebas-latin-ext.woff2"] = "font_bebas_latin_ext.woff2",
        // SleekFin's font (Inter, SIL OFL)
        ["inter-latin.woff2"] = "font_inter_latin.woff2",
        ["inter-latin-ext.woff2"] = "font_inter_latin_ext.woff2",
        ["inter-cyrillic.woff2"] = "font_inter_cyrillic.woff2",
        ["inter-cyrillic-ext.woff2"] = "font_inter_cyrillic_ext.woff2",
        ["inter-greek.woff2"] = "font_inter_greek.woff2",
        ["inter-greek-ext.woff2"] = "font_inter_greek_ext.woff2",
        ["inter-vietnamese.woff2"] = "font_inter_vietnamese.woff2",
    };

    private const string SplashFile = "js_02_welcome_splash.js";
    private const string DashboardFile = "js_19_dashboard_skin.js";
    private const string NowPlayingFile = "js_24_now_playing.js";

    // file name in Assets -> setting that switches it on (in load order)
    private static readonly (string File, Func<PluginConfiguration, bool> On)[] Features =
    {
        ("js_00_no_device_feed.js", c => c.NowPlaying),
        ("js_01_library_stats.js", c => c.LibraryStats),
        ("js_03_time_remaining.js", c => c.TimeRemaining),
        ("js_05_mark_sections.js", c => c.MarkSections),
        ("js_06_release_dates.js", c => c.ReleaseDates),
        ("js_07_quality_badges.js", c => c.QualityBadges),
        ("js_08_new_episode_tags.js", c => c.NewEpisodeTags),
        ("js_09_search_restyle.js", c => c.SearchRestyle),
        ("js_10_ambient_background.js", c => c.AmbientBackground),
        ("js_11_hover_cards.js", c => c.HoverCards),
        ("js_12_player_skin.js", c => c.PlayerSkin),
        ("js_13_login_extras.js", c => c.LoginExtras),
        ("js_14_pause_screen.js", c => c.PauseScreen),
        // with SleekFin built in, the accent is set from the page head instead (no script needed)
        ("js_17_episode_list.js", c => c.EpisodeList),
        ("js_21_hero.js", c => c.Hero),
        ("js_20_cards.js", c => c.HomeRows || c.Search),
        ("js_22_home_rows.js", c => c.HomeRows),
        ("js_23_search.js", c => c.Search),
        ("js_25_prefetch.js", c => true),
        ("js_26_tv_remote.js", c => true),
        ("js_27_page_transitions.js", c => c.PageTransitions),
        ("js_28_instant_details.js", c => SleekOf(c).DetailsEnabled),
    };

    private static readonly Dictionary<string, Payload?> StudioCache = new Dictionary<string, Payload?>(StringComparer.OrdinalIgnoreCase);

    private static readonly object Gate = new object();
    private static readonly Dictionary<string, string> TextCache = new Dictionary<string, string>();
    private static readonly Dictionary<string, byte[]> ByteCache = new Dictionary<string, byte[]>();
    private static ThemeBuild? s_current;

    public static ThemeBuild Get()
    {
        PluginConfiguration config = Plugin.Instance?.Configuration ?? new PluginConfiguration();
        string key = JsonSerializer.Serialize(config);

        ThemeBuild? current = s_current;
        if (current != null && current.Key == key)
        {
            return current;
        }

        lock (Gate)
        {
            current = s_current;
            if (current != null && current.Key == key)
            {
                return current;
            }

            current = Build(config, key);
            s_current = current;
            return current;
        }
    }

    /// <summary>Embedded font bytes, or null for an unknown name.</summary>
    public static byte[]? GetFont(string name)
    {
        return Fonts.TryGetValue(name, out string? file) ? ReadBytes(file) : null;
    }

    /// <summary>A bundled studio logo (SVG from KefinTweaks, MIT), by name e.g. "Disney+" or "Marvel_Studios".</summary>
    public static Payload? GetStudio(string name)
    {
        if (string.IsNullOrEmpty(name) || name.Length > 64)
        {
            return null;
        }

        if (name.EndsWith(".svg", StringComparison.OrdinalIgnoreCase))
        {
            name = name.Substring(0, name.Length - 4);
        }

        foreach (char ch in name)
        {
            if (!char.IsAsciiLetterOrDigit(ch) && ch != '_' && ch != '+' && ch != '-')
            {
                return null;
            }
        }

        lock (StudioCache)
        {
            if (StudioCache.TryGetValue(name, out Payload? hit))
            {
                return hit;
            }

            byte[] bytes = ReadBytes("studio_" + name.Replace("+", "_plus", StringComparison.Ordinal) + ".svg");
            Payload? p = bytes.Length == 0 ? null : new Payload(bytes);
            StudioCache[name] = p;
            return p;
        }
    }

    private static ThemeBuild Build(PluginConfiguration config, string key)
    {
        byte[] mp3 = ReadBytes("splash.mp3");
        string mp3Version = Short(SHA256.HashData(mp3));

        string fontVersion;
        using (IncrementalHash fh = IncrementalHash.CreateHash(HashAlgorithmName.SHA256))
        {
            foreach (string file in Fonts.Values)
            {
                fh.AppendData(ReadBytes(file));
            }

            fontVersion = Short(fh.GetHashAndReset());
        }

        // ── CSS ──
        StringBuilder css = new StringBuilder();
        // SleekFin (built in): its styles first, then the theme, in one file (nothing loads later and restyles the page)
        {
            css.Append(ReadText("sleek.css")
                .Replace("__TB_FONT_V__", fontVersion, StringComparison.Ordinal)
                .Replace("__TB_ACCENT__", Accent(config), StringComparison.Ordinal)
                .Replace("__TB_CARD_BUTTON_RADIUS__", IndexPatch.ShapeRadius(SleekOf(config).CardButtonShape, 4, 12), StringComparison.Ordinal)
                .Replace("__TB_PLAY_RADIUS__", IndexPatch.ShapeRadius(SleekOf(config).PlayButtonShape, 6, 18), StringComparison.Ordinal)
                .Replace("__TB_COMPACT_RADIUS__", IndexPatch.ShapeRadius(SleekOf(config).MediaCardShape, 4, 16), StringComparison.Ordinal)
                .Replace("__TB_PERSON_RADIUS__", IndexPatch.ShapeRadius(SleekOf(config).CastCrewShape, 4, 10), StringComparison.Ordinal)
                .Replace("__TB_PERSON_INNER_RADIUS__", IndexPatch.ShapeRadius(SleekOf(config).CastCrewShape, 3, 9), StringComparison.Ordinal)
                ).Append('\n');
        }

        css.Append(".tb-sleek-end{--tb-sleek-end:1}\n");   // marks where the built-in SleekFin's styles end (used by the visual test)
        css.Append(ReadText("theme.css")).Append('\n');
        if (IsHttpUrl(config.IconUrl))
        {
            string url = CssString(config.IconUrl);
            css.Append(".splashLogo,.pageTitleWithDefaultLogo,.pageTitleWithLogo{background-image:url(\"").Append(url)
               .Append("\")!important;background-size:contain!important;background-repeat:no-repeat!important}")
               .Append(".splashLogo{background-position:center!important}")
               .Append(".pageTitleWithDefaultLogo,.pageTitleWithLogo{background-position:left center!important}\n");
        }

        // Posters appear the moment they're ready (Jellyfin fades each one in over 0.5 s).
        // Kept at 1 ms instead of "none" so Jellyfin still gets its animation-end event and clears the blur placeholder.
        css.Append(".lazy-image-fadein,.lazy-image-fadein-fast{animation-duration:1ms!important}\n");


        // ── JS ──
        // settings for the scripts (each file carries them, so they work in any load order)
        JsonObject tbConfig = JsonSerializer.SerializeToNode(config)!.AsObject();
        tbConfig.Remove("Sleek");   // SleekFin's settings go separately (below), in the shape its scripts expect
        string prefix = "window.TB_CONFIG=" + tbConfig.ToJsonString() + ";\n"
            + "window.__tbSleek=window.__tbSleek||" + SleekJson(config, ThemeAssets.SleekOf(config)) + ";\n"
            + "window.tbCfg=function(k,d){var c=window.TB_CONFIG||{},v=c[k];return v===undefined||v===null||v===\"\"?d:v};\n"
            // one shared page watcher that hands each script only what was just added (scripts look at those
            // parts instead of re-checking the whole page), once per frame, before it's drawn
            + "window.tbAdded=window.tbAdded||(function(){var subs=[],mo=null,pending=[],queued=false;function flush(){queued=false;var r=pending;pending=[];for(var i=0;i<subs.length;i++){try{subs[i](r)}catch(e){}}}"
            + "return function(fn){subs.push(fn);if(!mo){mo=new MutationObserver(function(l){for(var i=0;i<l.length;i++){var a=l[i].addedNodes;for(var j=0;j<a.length;j++){if(a[j].nodeType===1)pending.push(a[j])}}if(pending.length&&!queued){queued=true;requestAnimationFrame(flush)}});mo.observe(document.documentElement,{childList:true,subtree:true})}}})();\n"
            // the scripts' own styles all go into one style block (one style recalculation, not one per script)
            + "window.tbCss=window.tbCss||(function(){var el=null;return function(s){if(!el){el=document.getElementById(\"tb-js-css\");if(!el){el=document.createElement(\"style\");el.id=\"tb-js-css\";document.head.appendChild(el)}}el.appendChild(document.createTextNode(\"\\n\"+s.textContent))}})();\n"
            + "window.tbIn=function(roots,sel){var out=[],seen=new Set();for(var i=0;i<roots.length;i++){var r=roots[i];if(!r.isConnected)continue;if(r.matches&&r.matches(sel)&&!seen.has(r)){seen.add(r);out.push(r)}var l=r.querySelectorAll?r.querySelectorAll(sel):[];for(var j=0;j<l.length;j++){if(!seen.has(l[j])){seen.add(l[j]);out.push(l[j])}}}return out};\n"
            + "window.tbUp=function(roots,sel){var out=[],seen=new Set();for(var i=0;i<roots.length;i++){var r=roots[i];if(!r.isConnected||!r.closest)continue;var c=r.closest(sel);if(c&&!seen.has(c)){seen.add(c);out.push(c)}var l=r.querySelectorAll(sel);for(var j=0;j<l.length;j++){if(!seen.has(l[j])){seen.add(l[j]);out.push(l[j])}}}return out};\n"
            // one request for the posters on screen instead of one per badge script (time left, release dates,
            // quality): asks made within 30 ms are merged (ids and fields together), each gets its own items back
            + "window.tbItems=window.tbItems||(function(){var q=null;function flush(){var b=q;if(!b)return;q=null;clearTimeout(b.t);var p=Promise.resolve(ApiClient.getItems(ApiClient.getCurrentUserId(),{Ids:Object.keys(b.ids).join(\",\"),Fields:Object.keys(b.f).join(\",\"),EnableImages:false}));for(var i=0;i<b.w.length;i++)b.w[i](p)}"
            + "return function(ids,fields){return new Promise(function(res,rej){if(!q)q={ids:{},f:{},w:[],n:0,t:setTimeout(flush,30)};for(var i=0;i<ids.length;i++){if(!q.ids[ids[i]]){q.ids[ids[i]]=1;q.n++}}String(fields||\"\").split(\",\").forEach(function(x){if(x)q.f[x]=1});"
            + "q.w.push(function(p){p.then(function(r){var want={};for(var i=0;i<ids.length;i++)want[ids[i]]=1;res({Items:((r&&r.Items)||[]).filter(function(it){return want[it.Id]})})},rej)});if(q.n>=120)flush()})}})();\n"
            // one shared page watcher that hands each script only what was just added (scripts look at those
            // parts instead of re-checking the whole page), once per frame, before it's drawn
            + "window.tbAdded=window.tbAdded||(function(){var subs=[],mo=null,pending=[],queued=false;function flush(){queued=false;var r=pending;pending=[];for(var i=0;i<subs.length;i++){try{subs[i](r)}catch(e){}}}"
            + "return function(fn){subs.push(fn);if(!mo){mo=new MutationObserver(function(l){for(var i=0;i<l.length;i++){var a=l[i].addedNodes;for(var j=0;j<a.length;j++){if(a[j].nodeType===1)pending.push(a[j])}}if(pending.length&&!queued){queued=true;requestAnimationFrame(flush)}});mo.observe(document.documentElement,{childList:true,subtree:true})}}})();\n"
            // the scripts' own styles all go into one style block (one style recalculation, not one per script)
            + "window.tbCss=window.tbCss||(function(){var el=null;return function(s){if(!el){el=document.getElementById(\"tb-js-css\");if(!el){el=document.createElement(\"style\");el.id=\"tb-js-css\";document.head.appendChild(el)}}el.appendChild(document.createTextNode(\"\\n\"+s.textContent))}})();\n"
            + "window.tbIn=function(roots,sel){var out=[],seen=new Set();for(var i=0;i<roots.length;i++){var r=roots[i];if(!r.isConnected)continue;if(r.matches&&r.matches(sel)&&!seen.has(r)){seen.add(r);out.push(r)}var l=r.querySelectorAll?r.querySelectorAll(sel):[];for(var j=0;j<l.length;j++){if(!seen.has(l[j])){seen.add(l[j]);out.push(l[j])}}}return out};\n"
            + "window.tbUp=function(roots,sel){var out=[],seen=new Set();for(var i=0;i<roots.length;i++){var r=roots[i];if(!r.isConnected||!r.closest)continue;var c=r.closest(sel);if(c&&!seen.has(c)){seen.add(c);out.push(c)}var l=r.querySelectorAll(sel);for(var j=0;j<l.length;j++){if(!seen.has(l[j])){seen.add(l[j]);out.push(l[j])}}}return out};\n"
            // one request for the posters on screen instead of one per badge script (time left, release dates,
            // quality): asks made within 30 ms are merged (ids and fields together), each gets its own items back
            + "window.tbItems=window.tbItems||(function(){var q=null;function flush(){var b=q;q=null;var p=Promise.resolve(ApiClient.getItems(ApiClient.getCurrentUserId(),{Ids:Object.keys(b.ids).join(\",\"),Fields:Object.keys(b.f).join(\",\"),EnableImages:false}));for(var i=0;i<b.w.length;i++)b.w[i](p)}"
            + "return function(ids,fields){return new Promise(function(res,rej){if(!q){q={ids:{},f:{},w:[],n:0};setTimeout(flush,30)}for(var i=0;i<ids.length;i++){if(!q.ids[ids[i]]){q.ids[ids[i]]=1;q.n++}}String(fields||\"\").split(\",\").forEach(function(x){if(x)q.f[x]=1});"
            + "q.w.push(function(p){p.then(function(r){var want={};for(var i=0;i<ids.length;i++)want[ids[i]]=1;res({Items:((r&&r.Items)||[]).filter(function(it){return want[it.Id]})})},rej)});if(q.n>=120){var b=q;q=null;b.w.length&&(function(){q=b;flush()})()}})}})();\n"
            // one shared page watcher for the scripts that look at the whole page: runs once per frame (before it's
            // drawn), and only every 1.5 s while a video plays or the tab is hidden
            + "window.tbWatch=window.tbWatch||(function(){var subs=[],mo=null,last=0,queued=false;function busy(){if(document.hidden)return true;var o=document.getElementById(\"videoOsdPage\");return!!(o&&!o.classList.contains(\"hide\")&&document.querySelector(\".videoPlayerContainer\"))}window.tbBusy=busy;"
            + "function run(){queued=false;if(busy()){var n=Date.now();if(n-last<1500)return;last=n}for(var i=0;i<subs.length;i++){try{subs[i]()}catch(e){}}}function fire(){if(queued)return;queued=true;if(document.hidden)setTimeout(run,0);else requestAnimationFrame(run)}"
            + "document.addEventListener(\"visibilitychange\",function(){if(!document.hidden)fire()});return function(fn){subs.push(fn);if(!mo){mo=new MutationObserver(fire);mo.observe(document.documentElement,{childList:true,subtree:true})}}})();\n"
            // one shared answer for requests several scripts make at the same time (your user, sessions)
            + "window.tbShared=window.tbShared||(function(){var m={};function c(k,t,f){var e=m[k],n=Date.now();if(e&&n-e.t<t)return e.p;var p=Promise.resolve().then(f);m[k]={t:n,p:p};p.catch(function(){if(m[k]&&m[k].p===p)delete m[k]});return p}"
            + "return{user:function(){var id=ApiClient.getCurrentUserId();return c(\"u:\"+id,10000,function(){return ApiClient.getUser(id)})},"
            + "sessions:function(q){return c(\"s:\"+JSON.stringify(q||{}),4000,function(){return ApiClient.getSessions(q)})}}})();\n";

        Payload splash = Payload.Empty;
        if (config.WelcomeSplash)
        {
            StringBuilder sj = new StringBuilder(prefix);
            AppendFeature(sj, SplashFile, mp3Version);
            splash = new Payload(Encoding.UTF8.GetBytes(sj.ToString()));
        }

        // admin dashboard extras: downloaded only when the dashboard is opened
        bool dashboardOn = config.DashboardSkin || config.NowPlaying;
        Payload dashboard = Payload.Empty;
        if (dashboardOn)
        {
            StringBuilder dj = new StringBuilder(prefix);
            if (config.DashboardSkin)
            {
                AppendFeature(dj, DashboardFile, mp3Version);
            }

            if (config.NowPlaying)
            {
                AppendFeature(dj, NowPlayingFile, mp3Version);
            }

            dashboard = new Payload(Encoding.UTF8.GetBytes(dj.ToString()));
        }

        StringBuilder js = new StringBuilder(prefix);
        // Jellyfin never used Custom CSS on admin pages: keep the theme stylesheet off there too
        js.Append("(function(){var l=document.getElementById(\"tb-theme-css\");if(!l||!document.body)return;function s(){var m=document.body.classList.contains(\"dashboardDocument\")?\"not all\":\"all\";if(l.media!==m)l.media=m}s();new MutationObserver(s).observe(document.body,{attributes:true,attributeFilter:[\"class\"]})})();\n");
        if (dashboardOn)
        {
            // dashboard skin / Now Playing are only downloaded the first time you open the admin dashboard
            // Admins who have opened it before get it downloaded (not run) while the browser is idle, so it opens
            // at once; the Now Playing panel's space is kept from the first frame (its last height), so the
            // dashboard's own boxes don't get pushed down when it appears.
            js.Append("(function(){if(!document.body)return;var u=\"../UshereatsTheme/dashboard.js?v=")
              .Append(dashboard.Hash)
              .Append("\",done=false,mo,seen=false;try{seen=!!localStorage.getItem(\"tb-dash\")}catch(e){}");
            if (config.NowPlaying)
            {
                js.Append("try{var nh=parseInt(localStorage.getItem(\"tb-np-h\"),10);if(nh>0)document.documentElement.style.setProperty(\"--tb-np-h\",nh+\"px\")}catch(e){}"
                    + "var ph=document.createElement(\"style\");ph.textContent=\"body.dashboardDocument #dashboardPage:not(.hide) .content-primary:not(:has(> #tb-np))::before{content:'';display:block;height:var(--tb-np-h,0px)}\";document.head.appendChild(ph);");
            }

            js.Append("function c(){if(done||!document.body.classList.contains(\"dashboardDocument\"))return;done=true;mo.disconnect();try{localStorage.setItem(\"tb-dash\",\"1\")}catch(e){}var s=document.createElement(\"script\");s.src=u;document.head.appendChild(s)}mo=new MutationObserver(c);mo.observe(document.body,{attributes:true,attributeFilter:[\"class\"]});c();"
                + "if(seen&&!done){var pf=function(){if(done)return;var l=document.createElement(\"link\");l.rel=\"prefetch\";l.as=\"script\";l.href=u;document.head.appendChild(l)};var go=function(){setTimeout(function(){(window.requestIdleCallback||setTimeout)(pf,{timeout:4000})},2500)};if(document.readyState===\"complete\")go();else window.addEventListener(\"load\",go)}"
                + "})();\n");
        }

        // Parts that aren't needed to draw the first page: downloaded when the browser is idle after the page
        // shows, or straight away when you open the screen that needs them
        var partFiles = new Dictionary<string, List<string>>(StringComparer.Ordinal)
        {
            ["details"] = new List<string>(),
            ["player"] = new List<string>(),
            ["search"] = new List<string>(),
            ["hover"] = new List<string>(),
        };
        if (ThemeAssets.SleekOf(config).DetailsEnabled)
        {
            partFiles["details"].Add("sleek_details.js");
        }

        foreach ((string file, Func<PluginConfiguration, bool> on) in Features)
        {
            if (!on(config))
            {
                continue;
            }

            string? part = file switch
            {
                "js_12_player_skin.js" or "js_14_pause_screen.js" => "player",
                "js_17_episode_list.js" => "details",
                "js_09_search_restyle.js" or "js_23_search.js" => "search",
                "js_11_hover_cards.js" => "hover",
                _ => null,
            };
            if (part != null)
            {
                partFiles[part].Add(file);
            }
        }

        var parts = new Dictionary<string, Payload>(StringComparer.Ordinal);
        StringBuilder partList = new StringBuilder();
        foreach ((string name, List<string> files) in partFiles)
        {
            if (files.Count == 0)
            {
                continue;
            }

            StringBuilder pj = new StringBuilder();
            foreach (string file in files)
            {
                AppendFeature(pj, file, mp3Version);
            }

            Payload payload = new Payload(Encoding.UTF8.GetBytes(pj.ToString()));
            parts[name] = payload;
            partList.Append(partList.Length > 0 ? "," : string.Empty).Append('"').Append(name).Append("\":\"").Append(payload.Hash).Append('"');
        }

        js.Append("(function(){var P={").Append(partList).Append("},done={};")
          .Append("function load(n){if(!P[n]||done[n])return;done[n]=1;var s=document.createElement(\"script\");s.src=\"../UshereatsTheme/part/\"+n+\".js?v=\"+P[n];document.head.appendChild(s)}")
          .Append("window.tbLoadPart=load;")
          .Append("function route(){var h=location.hash||\"\";if(/^#!?\\/(details|item)/i.test(h))load(\"details\");if(/^#!?\\/search/i.test(h))load(\"search\");if(/^#!?\\/video/i.test(h)||document.getElementById(\"videoOsdPage\"))load(\"player\")}")
          // search: also the moment the pointer or focus reaches the search button; hover look: the first time the pointer is over a poster
          .Append("function near(e){var t=e.target;if(!t||!t.closest)return;if(t.closest(\".headerSearchButton,[data-sleekfin-header-item-id='jellyfin:search'],a[href*='#/search']\"))load(\"search\");if(e.type===\"pointerover\"&&e.pointerType===\"mouse\"&&t.closest(\".card\"))load(\"hover\")}")
          .Append("document.addEventListener(\"pointerover\",near,{capture:true,passive:true});document.addEventListener(\"focusin\",near,true);")
          .Append("route();window.addEventListener(\"hashchange\",route);window.addEventListener(\"popstate\",route);")
          .Append("var idle=window.requestIdleCallback||function(f){return setTimeout(f,1200)};")
          .Append("window.addEventListener(\"load\",function(){idle(function(){load(\"hover\");load(\"details\");load(\"search\");load(\"player\")},{timeout:2500})})})();\n");

        // SleekFin's scripts (built in; its own hero is left out: the plugin's hero replaces it)
        foreach (string file in SleekScripts)
        {
            if (file != "sleek_details.js")
            {
                AppendFeature(js, file, mp3Version);
            }
        }

        foreach ((string file, Func<PluginConfiguration, bool> on) in Features)
        {
            if (on(config) && file is not ("js_12_player_skin.js" or "js_14_pause_screen.js" or "js_17_episode_list.js" or "js_09_search_restyle.js" or "js_23_search.js" or "js_11_hover_cards.js"))
            {
                AppendFeature(js, file, mp3Version);
            }
        }

        byte[] cssBytes = Encoding.UTF8.GetBytes(css.ToString());
        byte[] jsBytes = Encoding.UTF8.GetBytes(js.ToString());

        using (IncrementalHash h = IncrementalHash.CreateHash(HashAlgorithmName.SHA256))
        {
            h.AppendData(cssBytes);
            h.AppendData(jsBytes);
            return new ThemeBuild
            {
                Key = key,
                Version = Short(h.GetHashAndReset()),
                SplashVersion = splash.Hash,
                FontVersion = fontVersion,
                Config = config,
                Css = new Payload(cssBytes),
                Js = new Payload(jsBytes),
                SplashJs = splash,
                DashboardJs = dashboard,
                Parts = parts,
                Mp3 = mp3,
            };
        }
    }

    private static readonly string[] SleekScripts = { "sleek_runtime.js", "sleek_theme.js", "sleek_header.js", "sleek_media.js", "sleek_details.js" };

    private static readonly SleekConfiguration DefaultSleek = new SleekConfiguration();

    /// <summary>The one accent colour for the whole UI (main settings page).</summary>
    internal static string Accent(PluginConfiguration config) =>
        Plugin.IsHex(config.AccentColor) ? config.AccentColor.ToLowerInvariant() : SleekOf(config).AccentColor;

    /// <summary>SleekFin's settings (defaults if none are saved yet).</summary>
    internal static SleekConfiguration SleekOf(PluginConfiguration config) => config.Sleek ?? DefaultSleek;

    /// <summary>SleekFin's settings in the shape its scripts expect (header, details, hero look).</summary>
    internal static string SleekJson(PluginConfiguration config, SleekConfiguration s) => JsonSerializer.Serialize(new
    {
        icon = IsHttpUrl(config.IconUrl) ? config.IconUrl : string.Empty,
        header = SleekSettings.Header(s),
        details = SleekSettings.Details(s),
        hero = SleekSettings.Hero(s),
    });

    /// <summary>A file the SleekFin settings page loads on its own (details builder script + styles).</summary>
    internal static Payload? SleekFile(string name)
    {
        string? file = name switch
        {
            "sleekfin-details-builder.js" => "sleek_details_builder.js",
            _ when name.StartsWith("sleekfin-", StringComparison.Ordinal) && name.EndsWith(".css", StringComparison.Ordinal)
                && name.IndexOfAny(new[] { '/', '\\', '.' }, 0, name.Length - 4) < 0 => "sleekcss_" + name.Substring(9).Replace('-', '_'),
            "sleekfin-runtime.js" => "sleek_runtime.js",
            _ => null,
        };
        if (file == null)
        {
            return null;
        }

        lock (StudioCache)
        {
            if (StudioCache.TryGetValue("sf:" + file, out Payload? hit))
            {
                return hit;
            }

            byte[] bytes = ReadBytes(file);
            Payload? p = bytes.Length == 0 ? null : new Payload(bytes);
            StudioCache["sf:" + file] = p;
            return p;
        }
    }

    // each feature isolated: one failing never stops the others
    private static void AppendFeature(StringBuilder sb, string file, string mp3Version)
    {
        string code = ReadText(file).Replace("__TB_MP3__", "../UshereatsTheme/splash.mp3?v=" + mp3Version, StringComparison.Ordinal);
        sb.Append("try{").Append(code).Append("\n}catch(e){console.error(\"[Ushereats Theme] ").Append(file).Append("\",e)}\n");
    }

    private static string Short(byte[] hash) => Convert.ToHexString(hash).Substring(0, 12).ToLowerInvariant();

    internal static bool IsHttpUrl(string? s) =>
        !string.IsNullOrWhiteSpace(s)
        && (s.StartsWith("https://", StringComparison.OrdinalIgnoreCase) || s.StartsWith("http://", StringComparison.OrdinalIgnoreCase));

    private static string CssString(string s) => s.Replace("\\", "\\\\", StringComparison.Ordinal).Replace("\"", "\\\"", StringComparison.Ordinal);

    /// <summary>An embedded text file (used for the inline hero boot script).</summary>
    internal static string Text(string name) => ReadText(name);

    private static string ReadText(string name)
    {
        lock (TextCache)
        {
            if (TextCache.TryGetValue(name, out string? text))
            {
                return text;
            }

            text = Encoding.UTF8.GetString(ReadBytes(name));
            TextCache[name] = text;
            return text;
        }
    }

    private static byte[] ReadBytes(string name)
    {
        lock (ByteCache)
        {
            if (ByteCache.TryGetValue(name, out byte[]? cached))
            {
                return cached;
            }

            using Stream? stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(name);
            if (stream == null)
            {
                return Array.Empty<byte>();
            }

            using MemoryStream ms = new MemoryStream();
            stream.CopyTo(ms);
            byte[] bytes = ms.ToArray();
            ByteCache[name] = bytes;
            return bytes;
        }
    }
}
