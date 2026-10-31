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

    // file name in Assets -> setting that switches it on (in load order)
    private static readonly (string File, Func<PluginConfiguration, bool> On)[] Features =
    {
        ("js_01_library_stats.js", c => c.LibraryStats),
        ("js_03_time_remaining.js", c => c.TimeRemaining),
        ("js_04_header_avatar.js", c => c.HeaderAvatar),
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
        ("js_15_custom_icon.js", c => c.CustomIcon),
        // with SleekFin built in, the accent is set from the page head instead (no script needed)
        ("js_16_accent_colour.js", c => c.AccentColour && !SleekOn(c)),
        ("js_17_episode_list.js", c => c.EpisodeList),
        ("js_18_user_menu.js", c => c.UserMenu),
        ("js_21_hero.js", c => c.Hero),
        ("js_20_cards.js", c => c.HomeRows || c.Search),
        ("js_22_home_rows.js", c => c.HomeRows),
        ("js_23_search.js", c => c.Search),
    };

    private static readonly Dictionary<string, Payload?> StudioCache = new Dictionary<string, Payload?>(StringComparer.OrdinalIgnoreCase);

    private static readonly object Gate = new object();
    private static readonly Dictionary<string, string> TextCache = new Dictionary<string, string>();
    private static readonly Dictionary<string, byte[]> ByteCache = new Dictionary<string, byte[]>();
    private static ThemeBuild? s_current;

    public static ThemeBuild Get()
    {
        PluginConfiguration config = Plugin.Instance?.Configuration ?? new PluginConfiguration();
        string key = JsonSerializer.Serialize(config) + (Plugin.SleekFinPluginLoaded ? "|sf" : string.Empty);

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
        bool sleek = SleekOn(config);
        if (sleek)
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
        if (config.CustomIcon && IsHttpUrl(config.IconUrl))
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

        if (!string.IsNullOrWhiteSpace(config.ExtraCss))
        {
            css.Append("/* Extra CSS (plugin settings) */\n").Append(config.ExtraCss).Append('\n');
        }

        // ── JS ──
        // settings for the scripts (each file carries them, so they work in any load order)
        JsonObject tbConfig = JsonSerializer.SerializeToNode(config)!.AsObject();
        tbConfig.Remove("Sleek");   // SleekFin's settings go separately (below), in the shape its scripts expect
        string prefix = "window.TB_CONFIG=" + tbConfig.ToJsonString() + ";\n"
            + (sleek ? "window.__tbSleek=window.__tbSleek||" + SleekJson(ThemeAssets.SleekOf(config)) + ";\n" : string.Empty)
            + "window.tbCfg=function(k,d){var c=window.TB_CONFIG||{},v=c[k];return v===undefined||v===null||v===\"\"?d:v};\n"
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

        Payload dashboard = Payload.Empty;
        if (config.DashboardSkin)
        {
            StringBuilder dj = new StringBuilder(prefix);
            AppendFeature(dj, DashboardFile, mp3Version);
            dashboard = new Payload(Encoding.UTF8.GetBytes(dj.ToString()));
        }

        StringBuilder js = new StringBuilder(prefix);
        // Jellyfin never used Custom CSS on admin pages: keep the theme stylesheet off there too
        js.Append("(function(){var l=document.getElementById(\"tb-theme-css\");if(!l||!document.body)return;function s(){var m=document.body.classList.contains(\"dashboardDocument\")?\"not all\":\"all\";if(l.media!==m)l.media=m}s();new MutationObserver(s).observe(document.body,{attributes:true,attributeFilter:[\"class\"]})})();\n");
        if (config.DashboardSkin)
        {
            // dashboard skin is only downloaded the first time you open the admin dashboard
            js.Append("(function(){if(!document.body)return;var done=false,mo;function c(){if(done||!document.body.classList.contains(\"dashboardDocument\"))return;done=true;mo.disconnect();var s=document.createElement(\"script\");s.src=\"../UshereatsTheme/dashboard.js?v=")
              .Append(dashboard.Hash)
              .Append("\";document.head.appendChild(s)}mo=new MutationObserver(c);mo.observe(document.body,{attributes:true,attributeFilter:[\"class\"]});c()})();\n");
        }

        // SleekFin's scripts (built in; its own hero is left out: the plugin's hero replaces it)
        if (sleek)
        {
            foreach (string file in SleekScripts)
            {
                if (file != "sleek_details.js" || ThemeAssets.SleekOf(config).DetailsEnabled)
                {
                    AppendFeature(js, file, mp3Version);
                }
            }
        }

        foreach ((string file, Func<PluginConfiguration, bool> on) in Features)
        {
            if (on(config))
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
                Mp3 = mp3,
            };
        }
    }

    private static readonly string[] SleekScripts = { "sleek_runtime.js", "sleek_theme.js", "sleek_header.js", "sleek_media.js", "sleek_details.js" };

    /// <summary>The built-in SleekFin is used unless the separate SleekFin plugin is still installed.</summary>
    internal static bool SleekOn(PluginConfiguration config) => !Plugin.SleekFinPluginLoaded;

    private static readonly SleekConfiguration DefaultSleek = new SleekConfiguration();

    /// <summary>The one accent colour for the whole UI (main settings page).</summary>
    internal static string Accent(PluginConfiguration config) =>
        Plugin.IsHex(config.AccentColor) ? config.AccentColor.ToLowerInvariant() : SleekOf(config).AccentColor;

    /// <summary>SleekFin's settings (defaults if none are saved yet).</summary>
    internal static SleekConfiguration SleekOf(PluginConfiguration config) => config.Sleek ?? DefaultSleek;

    /// <summary>SleekFin's settings in the shape its scripts expect (header, details, hero look).</summary>
    internal static string SleekJson(SleekConfiguration s) => JsonSerializer.Serialize(new
    {
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
