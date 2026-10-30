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

        // Fonts: connect early, load in parallel with the theme
        sb.Append("<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">");
        sb.Append("<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>");
        if (ThemeAssets.IsHttpUrl(build.FontsUrl))
        {
            sb.Append("<link rel=\"stylesheet\" href=\"").Append(WebUtility.HtmlEncode(build.FontsUrl)).Append("\">");
        }

        // Welcome splash: instant black cover on a new session, so the site never shows before it
        if (build.Config.WelcomeSplash)
        {
            sb.Append("<style>html.tb-cover::after{content:\"\";position:fixed;top:0;right:0;bottom:0;left:0;z-index:999998;background:#040405;pointer-events:none;transition:opacity 250ms ease}html.tb-cover.tb-cover-out::after{opacity:0}</style>");
            sb.Append("<script>try{if(!sessionStorage.getItem(\"jf-welcomed\")){var d=document.documentElement;d.classList.add(\"tb-cover\");setTimeout(function(){d.classList.remove(\"tb-cover\",\"tb-cover-out\")},4500)}}catch(e){}</script>");
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
}
