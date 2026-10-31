using System.Net;
using System.Text;

namespace Jellyfin.Plugin.UshereatsTheme;

/// <summary>
/// What File Transformation hands us: the current text of the file.
/// </summary>
public class PatchPayload
{
    public string? Contents { get; set; }
}

/// <summary>
/// Adds the theme to Jellyfin's index.html head, so the browser has it before it draws anything.
/// </summary>
public static class IndexPatch
{
    private const string Marker = "<!-- ushereats-theme -->";

    private const string LatinRange = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";

    private const string LatinExtRange = "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF";

    public static string Apply(PatchPayload payload)
    {
        string html = payload.Contents ?? string.Empty;
        if (html.Length == 0 || html.Contains(Marker, StringComparison.Ordinal))
        {
            return html;
        }

        int head = html.IndexOf("</head>", StringComparison.OrdinalIgnoreCase);
        if (head < 0)
        {
            return html;
        }

        ThemeBuild build = ThemeAssets.Get();
        StringBuilder sb = new StringBuilder();
        sb.Append(Marker);

        // Fonts: self-hosted, preloaded, always on (also on admin pages)
        string fv = build.FontVersion;
        sb.Append("<link rel=\"preload\" href=\"../UshereatsTheme/font/funnel-latin.woff2?v=").Append(fv).Append("\" as=\"font\" type=\"font/woff2\" crossorigin>");
        sb.Append("<link rel=\"preload\" href=\"../UshereatsTheme/font/bebas-latin.woff2?v=").Append(fv).Append("\" as=\"font\" type=\"font/woff2\" crossorigin>");
        sb.Append("<style>");
        AppendFont(sb, "Funnel Sans", "300 900", "funnel-latin.woff2", fv, LatinRange);
        AppendFont(sb, "Funnel Sans", "300 900", "funnel-latin-ext.woff2", fv, LatinExtRange);
        AppendFont(sb, "Bebas Neue", "400", "bebas-latin.woff2", fv, LatinRange);
        AppendFont(sb, "Bebas Neue", "400", "bebas-latin-ext.woff2", fv, LatinExtRange);
        sb.Append("</style>");

        // Welcome splash: instant black cover on a new session, so the site never shows before it
        if (build.Config.WelcomeSplash)
        {
            sb.Append("<style>html.tb-cover::after{content:\"\";position:fixed;top:0;right:0;bottom:0;left:0;z-index:999998;background:#040405;pointer-events:none;transition:opacity 250ms ease}html.tb-cover.tb-cover-out::after{opacity:0}</style>");
            // ...and the splash code is only downloaded on a new session
            sb.Append("<script>try{if(!sessionStorage.getItem(\"jf-welcomed\")){var d=document.documentElement;d.classList.add(\"tb-cover\");setTimeout(function(){d.classList.remove(\"tb-cover\",\"tb-cover-out\")},4500);var s=document.createElement(\"script\");s.src=\"../UshereatsTheme/splash.js?v=")
              .Append(build.SplashVersion)
              .Append("\";document.head.appendChild(s)}}catch(e){}</script>");
        }

        // Instant hero: paints the hero we're about to show and asks for its data before Jellyfin even starts
        if (build.Config.Hero)
        {
            sb.Append("<style>html.tb-hs::before{content:\"\";position:absolute;z-index:0;pointer-events:none;left:var(--tb-hs-l,0);top:var(--tb-hs-t,0);width:var(--tb-hs-w,100%);height:var(--tb-hs-h,70vh);background:linear-gradient(90deg,rgba(0,0,0,.72) 0%,rgba(0,0,0,.52) 16%,rgba(0,0,0,.34) 32%,rgba(0,0,0,.19) 46%,rgba(0,0,0,.09) 57%,rgba(0,0,0,.03) 64%,transparent 70%),linear-gradient(transparent 50%,rgba(0,0,0,.12) 64%,rgba(0,0,0,.28) 76%,rgba(0,0,0,.46) 86%,rgba(0,0,0,.64) 94%,rgba(0,0,0,.78) 100%),var(--tb-hs-img,none) 50% 28%/cover no-repeat #0b0b0e;-webkit-mask-image:linear-gradient(180deg,#000 0%,#000 45%,rgba(0,0,0,.75) 62%,rgba(0,0,0,.35) 80%,transparent 100%);mask-image:linear-gradient(180deg,#000 0%,#000 45%,rgba(0,0,0,.75) 62%,rgba(0,0,0,.35) 80%,transparent 100%);transition:opacity .3s ease}html.tb-hs.tb-hs-out::before{opacity:0}html.tb-hs .splashLogo{visibility:hidden!important}</style>");
            sb.Append("<script>").Append(ThemeAssets.Text("hero_boot.js")).Append("</script>");
        }

        // Your icon in the tab / home screen from the first frame
        if (build.Config.CustomIcon && ThemeAssets.IsHttpUrl(build.Config.IconUrl))
        {
            string icon = WebUtility.HtmlEncode(build.Config.IconUrl);
            sb.Append("<link rel=\"icon\" href=\"").Append(icon).Append("\" data-tb-icon>");
            sb.Append("<link rel=\"apple-touch-icon\" href=\"").Append(icon).Append("\" data-tb-icon>");
        }

        // The theme itself: stylesheet (applied before first paint) + scripts (run once the page is parsed)
        sb.Append("<link id=\"tb-theme-css\" rel=\"stylesheet\" href=\"../UshereatsTheme/theme.css?v=").Append(build.Version).Append("\">");
        sb.Append("<script src=\"../UshereatsTheme/theme.js?v=").Append(build.Version).Append("\" defer></script>");

        return html.Insert(head, sb.ToString());
    }

    // font-display: block = text waits (briefly, the files are preloaded) instead of flashing a fallback font
    private static void AppendFont(StringBuilder sb, string family, string weight, string file, string version, string range)
    {
        sb.Append("@font-face{font-family:\"").Append(family).Append("\";font-style:normal;font-weight:").Append(weight)
          .Append(";font-display:block;src:url(\"../UshereatsTheme/font/").Append(file).Append("?v=").Append(version)
          .Append("\") format(\"woff2\");unicode-range:").Append(range).Append('}');
    }
}
