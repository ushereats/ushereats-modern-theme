using System.Globalization;
using System.IO.Compression;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Jellyfin.Plugin.UshereatsTheme.Look;
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
        // the base look's font (Inter, SIL OFL)
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
        // with the base look built in, the accent is set from the page head instead (no script needed)
        ("js_21_hero.js", c => c.Hero),
        ("js_20_cards.js", c => c.HomeRows || c.Search),
        ("js_22_home_rows.js", c => c.HomeRows),
        ("js_23_search.js", c => c.Search),
        ("js_25_prefetch.js", c => true),
        ("js_26_tv_remote.js", c => true),
        ("js_27_page_transitions.js", c => c.PageTransitions),
        ("js_28_error_reporter.js", c => true),
        ("js_29_search_index.js", c => c.InstantSearch != Configuration.FeatureLevel.Off),
        ("js_31_title_popup.js", c => c.TitlePopup != Configuration.FeatureLevel.Off),
        ("js_32_title_sound.js", c => c.TitleSound),
        ("js_33_player_episodes.js", c => c.PlayerEpisodes),
        ("js_35_hover_preview.js", c => c.HoverPreview),
        ("js_36_play_launch.js", c => c.HoverPreview || c.TitlePopup != Configuration.FeatureLevel.Off),
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

            current = Build(config, key, ReadBytes);
            s_current = current;
            return current;
        }
    }

    /// <summary>
    /// Dev build: same as the normal build but reads each asset file from <paramref name="devUrl"/> instead of
    /// the embedded copy. Never cached. Falls back to embedded if a file is not found at the URL.
    /// </summary>
    public static ThemeBuild BuildDev(PluginConfiguration config, string devUrl)
    {
        string baseUrl = devUrl.TrimEnd('/');
        using System.Net.Http.HttpClient http = new System.Net.Http.HttpClient { Timeout = TimeSpan.FromSeconds(5) };

        byte[] FetchOrFallback(string name)
        {
            try
            {
                using var resp = http.GetAsync($"{baseUrl}/{name}").GetAwaiter().GetResult();
                if (resp.IsSuccessStatusCode)
                {
                    return resp.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult();
                }
            }
            catch { }

            return ReadBytes(name);
        }

        return Build(config, "dev", FetchOrFallback);
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

    private static ThemeBuild Build(PluginConfiguration config, string key, Func<string, byte[]> read)
    {
        string ReadText(string name) => Encoding.UTF8.GetString(read(name));
        byte[] mp3 = read("splash.mp3");
        string mp3Version = Short(SHA256.HashData(mp3));

        string fontVersion;
        using (IncrementalHash fh = IncrementalHash.CreateHash(HashAlgorithmName.SHA256))
        {
            foreach (string file in Fonts.Values)
            {
                fh.AppendData(read(file));
            }

            fontVersion = Short(fh.GetHashAndReset());
        }

        // ── CSS ──
        StringBuilder css = new StringBuilder();
        // The base look: its styles first, then the theme, in one file (nothing loads later and restyles the page)
        {
            css.Append(ReadText("look.css")
                .Replace("__TB_FONT_V__", fontVersion, StringComparison.Ordinal)
                .Replace("__TB_ACCENT__", Accent(config), StringComparison.Ordinal)
                .Replace("__TB_CARD_BUTTON_RADIUS__", IndexPatch.ShapeRadius(LookOf(config).CardButtonShape, 4, 12), StringComparison.Ordinal)
                .Replace("__TB_PLAY_RADIUS__", IndexPatch.ShapeRadius(LookOf(config).PlayButtonShape, 6, 18), StringComparison.Ordinal)
                .Replace("__TB_COMPACT_RADIUS__", IndexPatch.ShapeRadius(LookOf(config).MediaCardShape, 4, 16), StringComparison.Ordinal)
                .Replace("__TB_PERSON_RADIUS__", IndexPatch.ShapeRadius(LookOf(config).CastCrewShape, 4, 10), StringComparison.Ordinal)
                .Replace("__TB_PERSON_INNER_RADIUS__", IndexPatch.ShapeRadius(LookOf(config).CastCrewShape, 3, 9), StringComparison.Ordinal)
                .Replace("__TB_AMB_DIM__", Math.Clamp(config.AmbientDim, 0, 1).ToString("0.###", CultureInfo.InvariantCulture), StringComparison.Ordinal)
                .Replace("__TB_AMB_FADE__", config.AmbientFade ? "1200" : "0", StringComparison.Ordinal)
                ).Append('\n');
        }

        css.Append(".tb-look-end{--tb-look-end:1}\n");   // marks where the base look's styles end (used by the visual test)
        css.Append(ReadText("theme.css")).Append('\n');
        // the logo everywhere Jellyfin draws its own: the top bar, the loading screen, the sign-in page, and the
        // dashboard's and side menu's Jellyfin pictures (the stylesheet is at /UshereatsTheme/theme.css)
        string? logo = LogoUrl(config, "../");
        if (logo != null)
        {
            string url = CssString(logo);
            css.Append(".splashLogo,.pageTitleWithDefaultLogo,.pageTitleWithLogo,.adminDrawerLogo,.drawerLogo{background-image:url(\"").Append(url)
               .Append("\")!important;background-size:contain!important;background-repeat:no-repeat!important}")
               .Append(".splashLogo{background-position:center!important}")
               .Append(".pageTitleWithDefaultLogo,.pageTitleWithLogo{background-position:left center!important}")
               .Append("img:is([src*=\"icon-transparent\"],[src*=\"banner-light\"],[src*=\"banner-dark\"],[src*=\"touchicon\"],[src*=\"/assets/img/icon\"],[src*=\"favicon\"]){content:url(\"").Append(url).Append("\")!important;object-fit:contain!important}\n");
        }

        // Posters appear the moment they're ready (Jellyfin fades each one in over 0.5 s).
        // Kept at 1 ms instead of "none" so Jellyfin still gets its animation-end event and clears the blur placeholder.
        css.Append(".lazy-image-fadein,.lazy-image-fadein-fast{animation-duration:1ms!important}\n");


        // ── JS ──
        // settings for the scripts (each file carries them, so they work in any load order)
        JsonObject tbConfig = JsonSerializer.SerializeToNode(config)!.AsObject();
        tbConfig.Remove("Look");   // the base look's settings go separately (below), in the shape its scripts expect
        string prefix = "window.TB_CONFIG=" + tbConfig.ToJsonString() + ";\n"
            + "window.__tbLook=window.__tbLook||" + LookJson(config, ThemeAssets.LookOf(config)) + ";\n"
            // shared helpers every feature script uses (web-src/core.js)
            + ThemeAssets.Text("core.js") + "\n";

        Payload splash = Payload.Empty;
        if (config.WelcomeSplash)
        {
            StringBuilder sj = new StringBuilder(prefix);
            AppendFeature(sj, SplashFile, mp3Version, read);
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
                AppendFeature(dj, DashboardFile, mp3Version, read);
            }

            if (config.NowPlaying)
            {
                AppendFeature(dj, NowPlayingFile, mp3Version, read);
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
            js.Append("(function(){if(!document.body)return;var u=window.__tbDevMode?\"../UshereatsTheme/dev/dashboard.js\":\"../UshereatsTheme/dashboard.js?v=")
              .Append(dashboard.Hash)
              .Append("\",done=false,mo,seen=false;try{seen=!!localStorage.getItem(\"tb-dash\")}catch(e){}");
            if (config.NowPlaying)
            {
                js.Append("try{var nh=parseInt(localStorage.getItem(\"tb-np-h\"),10);if(nh>0)document.documentElement.style.setProperty(\"--tb-np-h\",nh+\"px\")}catch(e){}"
                    + "var ph=document.createElement(\"style\");ph.textContent=\"body.dashboardDocument #dashboardPage:not(.hide) .content-primary:not(:has(> #tb-np))::before{content:'';display:block;height:var(--tb-np-h,0px)}\";document.head.appendChild(ph);");
            }

            if (config.DashboardSkin)
            {
                // the dashboard home stays hidden until the skin has drawn it (at most 1.5 s), so it appears once
                // instead of Jellyfin's boxes showing and then moving
                js.Append("var hd=document.createElement(\"style\");hd.textContent=\"body.dashboardDocument:not(.tb-dash-ready) #dashboardPage .content-primary{visibility:hidden}\";document.head.appendChild(hd);");
            }

            js.Append("function c(){if(done||!document.body.classList.contains(\"dashboardDocument\"))return;done=true;setTimeout(function(){document.body.classList.add(\"tb-dash-ready\")},1500);mo.disconnect();try{localStorage.setItem(\"tb-dash\",\"1\")}catch(e){}var s=document.createElement(\"script\");s.src=u;document.head.appendChild(s)}mo=new MutationObserver(c);mo.observe(document.body,{attributes:true,attributeFilter:[\"class\"]});c();"
                + "})();\n");
        }

        // Parts that aren't needed to draw the first page: downloaded when the browser is idle after the page
        // shows, or straight away when you open the screen that needs them
        var partFiles = new Dictionary<string, List<string>>(StringComparer.Ordinal)
        {
            ["details"] = new List<string>(),
            ["player"] = new List<string>(),
            ["search"] = new List<string>(),
        };
        if (ThemeAssets.LookOf(config).DetailsEnabled)
        {
            partFiles["details"].Add("look_details.js");
        }

        foreach ((string file, Func<PluginConfiguration, bool> on) in Features)
        {
            if (!on(config))
            {
                continue;
            }

            string? part = file switch
            {
                "js_12_player_skin.js" or "js_14_pause_screen.js" or "js_33_player_episodes.js" => "player",
                "js_09_search_restyle.js" or "js_23_search.js" => "search",
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
                AppendFeature(pj, file, mp3Version, read);
            }

            Payload payload = new Payload(Encoding.UTF8.GetBytes(pj.ToString()));
            parts[name] = payload;
            partList.Append(partList.Length > 0 ? "," : string.Empty).Append('"').Append(name).Append("\":\"").Append(payload.Hash).Append('"');
        }

        js.Append("(function(){var P={").Append(partList).Append("},done={};")
          .Append("function load(n){if(!P[n]||done[n])return;done[n]=1;var s=document.createElement(\"script\");s.src=window.__tbDevMode?\"../UshereatsTheme/dev/part/\"+n+\".js\":\"../UshereatsTheme/part/\"+n+\".js?v=\"+P[n];document.head.appendChild(s)}")
          .Append("window.tbLoadPart=load;")
          .Append("function route(){var h=location.hash||\"\";if(/^#!?\\/(details|item)/i.test(h))load(\"details\");if(/^#!?\\/search/i.test(h))load(\"search\");if(/^#!?\\/video/i.test(h)||document.getElementById(\"videoOsdPage\"))load(\"player\")}")
          // search: also the moment the pointer or focus reaches the search button
          .Append("function near(e){var t=e.target;if(!t||!t.closest)return;if(t.closest(\".headerSearchButton,[data-ue-header-item-id='jellyfin:search'],a[href*='#/search']\"))load(\"search\")}")
          .Append("document.addEventListener(\"pointerover\",near,{capture:true,passive:true});document.addEventListener(\"focusin\",near,true);")
          .Append("route();window.addEventListener(\"hashchange\",route);window.addEventListener(\"popstate\",route);")
          .Append("var idle=window.requestIdleCallback||function(f){return setTimeout(f,1200)};")
          // "details" loads straight at page load (not idle) so the title-page script is ready by the first hover;
          // with the pop-up on for everyone the full title page is rare: it waits for idle time (or the page itself)
          .Append(config.TitlePopup == Configuration.FeatureLevel.Everyone
              ? "window.addEventListener(\"load\",function(){idle(function(){load(\"search\");load(\"player\");setTimeout(function(){load(\"details\")},4000)},{timeout:3000})})})();\n"
              : "window.addEventListener(\"load\",function(){load(\"details\");idle(function(){load(\"search\");load(\"player\")},{timeout:2500})})})();\n");

        // the base look's scripts (built in; its own hero is left out: the plugin's hero replaces it)
        foreach (string file in LookScripts)
        {
            if (file != "look_details.js")
            {
                AppendFeature(js, file, mp3Version, read);
            }
        }

        foreach ((string file, Func<PluginConfiguration, bool> on) in Features)
        {
            if (on(config) && file is not ("js_12_player_skin.js" or "js_14_pause_screen.js" or "js_33_player_episodes.js" or "js_09_search_restyle.js" or "js_23_search.js"))
            {
                AppendFeature(js, file, mp3Version, read);
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

    private static readonly string[] LookScripts = { "look_runtime.js", "look_theme.js", "look_header.js", "look_media.js", "look_details.js" };

    private static readonly LookConfiguration DefaultLook = new LookConfiguration();

    /// <summary>The one accent colour for the whole UI (main settings page).</summary>
    internal static string Accent(PluginConfiguration config) =>
        Plugin.IsHex(config.AccentColor) ? config.AccentColor.ToLowerInvariant() : LookOf(config).AccentColor;

    /// <summary>the base look's settings (defaults if none are saved yet).</summary>
    internal static LookConfiguration LookOf(PluginConfiguration config) => config.Look ?? DefaultLook;

    /// <summary>the base look's settings in the shape its scripts expect (header, details, hero look).</summary>
    internal static string LookJson(PluginConfiguration config, LookConfiguration s) => JsonSerializer.Serialize(new
    {
        icon = LogoUrl(config, "../") ?? string.Empty,
        header = LookSettings.Header(s),
        details = LookSettings.Details(s),
        hero = LookSettings.Hero(s),
    });

    /// <summary>A file the base look settings page loads on its own (details builder script + styles).</summary>
    internal static Payload? LookFile(string name)
    {
        string? file = name switch
        {
            "ue-details-builder.js" => "look_details_builder.js",
            _ when name.StartsWith("ue-", StringComparison.Ordinal) && name.EndsWith(".css", StringComparison.Ordinal)
                && name.IndexOfAny(new[] { '/', '\\', '.' }, 0, name.Length - 4) < 0 => "lookcss_" + name.Substring(3).Replace('-', '_'),
            "ue-runtime.js" => "look_runtime.js",
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
    private static void AppendFeature(StringBuilder sb, string file, string mp3Version, Func<string, byte[]> read)
    {
        string code = Encoding.UTF8.GetString(read(file)).Replace("__TB_MP3__", "../UshereatsTheme/splash.mp3?v=" + mp3Version, StringComparison.Ordinal);
        sb.Append("try{").Append(code).Append("\n}catch(e){console.error(\"[Ushereats Theme] ").Append(file).Append("\",e)}\n");
    }

    private static string Short(byte[] hash) => Convert.ToHexString(hash).Substring(0, 12).ToLowerInvariant();

    /// <summary>
    /// The server's logo: the uploaded one (served by the plugin, kept by browsers and Cloudflare for a year, its
    /// link changes with each upload), else the Icon URL setting, else none (Jellyfin's own).
    /// </summary>
    /// <param name="config">The settings.</param>
    /// <param name="prefix">What goes before "UshereatsTheme/" from where it's used ("../" from the web app's pages).</param>
    internal static string? LogoUrl(PluginConfiguration config, string prefix) =>
        config.LogoVersion > 0 ? prefix + "UshereatsTheme/logo?v=" + config.LogoVersion.ToString(System.Globalization.CultureInfo.InvariantCulture)
        : IsHttpUrl(config.IconUrl) ? config.IconUrl : null;

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
