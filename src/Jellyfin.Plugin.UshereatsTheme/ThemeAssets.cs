using System.IO.Compression;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Jellyfin.Plugin.UshereatsTheme.Configuration;

namespace Jellyfin.Plugin.UshereatsTheme;

/// <summary>
/// One ready-to-send copy of the theme (plain, gzip and brotli), rebuilt only when the settings change.
/// </summary>
public sealed class ThemeBuild
{
    public string Key { get; init; } = string.Empty;
    public string Version { get; init; } = string.Empty;
    public string Mp3Version { get; init; } = string.Empty;
    public string FontsUrl { get; init; } = string.Empty;
    public PluginConfiguration Config { get; init; } = new PluginConfiguration();
    public Payload Css { get; init; } = Payload.Empty;
    public Payload Js { get; init; } = Payload.Empty;
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
        ETag = "\"" + Convert.ToHexString(SHA256.HashData(raw)).Substring(0, 16).ToLowerInvariant() + "\"";
    }

    public byte[] Raw { get; }
    public byte[] Gzip { get; }
    public byte[] Brotli { get; }
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
    // file name in Assets -> setting that switches it on (in load order)
    private static readonly (string File, Func<PluginConfiguration, bool> On)[] Features =
    {
        ("js_01_library_stats.js", c => c.LibraryStats),
        ("js_02_welcome_splash.js", c => c.WelcomeSplash),
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
        ("js_16_accent_colour.js", c => c.AccentColour),
        ("js_17_episode_list.js", c => c.EpisodeList),
        ("js_18_user_menu.js", c => c.UserMenu),
        ("js_19_dashboard_skin.js", c => c.DashboardSkin),
    };

    private static readonly object Gate = new object();
    private static readonly Dictionary<string, string> TextCache = new Dictionary<string, string>();
    private static byte[]? s_mp3;
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

    private static ThemeBuild Build(PluginConfiguration config, string key)
    {
        byte[] mp3 = s_mp3 ??= ReadBytes("splash.mp3");
        string mp3Version = Short(SHA256.HashData(mp3));

        // ── CSS ──
        StringBuilder css = new StringBuilder();
        css.Append(ReadText("theme.css")).Append('\n');
        if (config.CustomIcon && IsHttpUrl(config.IconUrl))
        {
            string url = CssString(config.IconUrl);
            css.Append(".splashLogo,.pageTitleWithDefaultLogo,.pageTitleWithLogo{background-image:url(\"").Append(url)
               .Append("\")!important;background-size:contain!important;background-repeat:no-repeat!important}")
               .Append(".splashLogo{background-position:center!important}")
               .Append(".pageTitleWithDefaultLogo,.pageTitleWithLogo{background-position:left center!important}\n");
        }

        if (!string.IsNullOrWhiteSpace(config.ExtraCss))
        {
            css.Append("/* Extra CSS (plugin settings) */\n").Append(config.ExtraCss).Append('\n');
        }

        // ── JS ──
        StringBuilder js = new StringBuilder();
        js.Append("window.TB_CONFIG=").Append(JsonSerializer.Serialize(config)).Append(";\n");
        js.Append("window.tbCfg=function(k,d){var c=window.TB_CONFIG||{},v=c[k];return v===undefined||v===null||v===\"\"?d:v};\n");
        // Jellyfin never used Custom CSS on admin pages: keep the theme stylesheet off there too
        js.Append("(function(){var l=document.getElementById(\"tb-theme-css\");if(!l||!document.body)return;function s(){var m=document.body.classList.contains(\"dashboardDocument\")?\"not all\":\"all\";if(l.media!==m)l.media=m}s();new MutationObserver(s).observe(document.body,{attributes:true,attributeFilter:[\"class\"]})})();\n");

        foreach ((string file, Func<PluginConfiguration, bool> on) in Features)
        {
            if (!on(config))
            {
                continue;
            }

            string code = ReadText(file).Replace("__TB_MP3__", "../UshereatsTheme/splash.mp3?v=" + mp3Version, StringComparison.Ordinal);
            // each feature isolated: one failing never stops the others
            js.Append("try{").Append(code).Append("\n}catch(e){console.error(\"[Ushereats Theme] ").Append(file).Append("\",e)}\n");
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
                Mp3Version = mp3Version,
                FontsUrl = ReadText("fonts.txt").Trim(),
                Config = config,
                Css = new Payload(cssBytes),
                Js = new Payload(jsBytes),
                Mp3 = mp3,
            };
        }
    }

    private static string Short(byte[] hash) => Convert.ToHexString(hash).Substring(0, 12).ToLowerInvariant();

    internal static bool IsHttpUrl(string? s) =>
        !string.IsNullOrWhiteSpace(s)
        && (s.StartsWith("https://", StringComparison.OrdinalIgnoreCase) || s.StartsWith("http://", StringComparison.OrdinalIgnoreCase));

    private static string CssString(string s) => s.Replace("\\", "\\\\", StringComparison.Ordinal).Replace("\"", "\\\"", StringComparison.Ordinal);

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
        using Stream? stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(name);
        if (stream == null)
        {
            return Array.Empty<byte>();
        }

        using MemoryStream ms = new MemoryStream();
        stream.CopyTo(ms);
        return ms.ToArray();
    }
}
