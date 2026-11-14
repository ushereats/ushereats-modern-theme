using System.Globalization;
using System.Net;
using Jellyfin.Plugin.UshereatsTheme.Sleek;
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
        bool devEnabled = !string.IsNullOrWhiteSpace(build.Config.DevAssetsUrl);
        StringBuilder sb = new StringBuilder();
        sb.Append(Marker);

        // Set __tbDevMode early so every subsequent inline script can read it (splash, parts, dashboard).
        if (devEnabled)
        {
            sb.Append("<script>try{window.__tbDevMode=localStorage.getItem('ue-dev')==='1'}catch(e){}</script>");
        }

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

        // The accent colour as plain numbers (see-through glows, dashboard skin): defined once, here, for every page
        sb.Append("<style>:root{--tb-accent-rgb:").Append(HexToRgb(ThemeAssets.Accent(build.Config))).Append("}</style>");

        // SleekFin (built in): its page flags, colours and shapes, set before anything is drawn
        {
            SleekConfiguration s = ThemeAssets.SleekOf(build.Config);
            // (card shapes and the accent are written into the stylesheet itself, from these settings)
            sb.Append(SleekBoot(s));
            if (s.DetailsEnabled)
            {
                // hides a details page until it's built (with a 4s safety), so the plain Jellyfin page never shows
                sb.Append("<script>").Append(ThemeAssets.Text("sleek_details_boot.js")).Append("</script>");
            }
        }

        // Ambient background from the first frame: pages are see-through and SleekFin's pieces take their ambient look
        // straight away (the script only picks the picture later)
        if (build.Config.AmbientBackground)
        {
            sb.Append("<script>if(!/^#!?\\/?(login|selectserver|addserver|forgotpassword|wizard|dashboard|configurationpage|metadata|video|search)/i.test(location.hash))document.documentElement.classList.add(\"tb-ambient\")</script>");
        }

        // Poster hover look from the first frame (the script only adds titles and ratings)
        if (build.Config.HoverCards)
        {
            sb.Append("<script>document.documentElement.classList.add(\"tb-hover\")</script>");
        }

        // SleekFin header: Jellyfin's own header (logo, server name, plain tab links) never shows before SleekFin's
        // header is ready, and SleekFin's header appears at once instead of fading in. Safety: shown anyway after 4s,
        // and straight away on pages where SleekFin doesn't draw a header (sign-in, dashboard, player).
        sb.Append("<style>html[data-sleekfin-header-enabled=\"true\"]:not(.sleekfin-header-mounted):not(.tb-hdr-ok) :is(header.MuiAppBar-root,.skinHeader){opacity:0!important}html.sleekfin-header-mounted [data-sleekfin-header]{animation:none!important}</style>");
        sb.Append("<script>(function(){var r=document.documentElement;function ok(){r.className+=\" tb-hdr-ok\"}if(/^#\\/?(login|selectserver|addserver|forgotpassword|wizard|dashboard|configurationpage|metadata|video)/i.test(location.hash))ok();else setTimeout(ok,4000)})();</script>");

        // Welcome splash: instant black cover on a new session, so the site never shows before it
        if (build.Config.WelcomeSplash)
        {
            sb.Append("<style>html.tb-cover::after{content:\"\";position:fixed;top:0;right:0;bottom:0;left:0;z-index:999998;background:#040405;pointer-events:none;transition:opacity 250ms ease}html.tb-cover.tb-cover-out::after{opacity:0}</style>");
            // ...and the splash code is only downloaded on a new session
            sb.Append("<script>try{if(!sessionStorage.getItem(\"jf-welcomed\")){var d=document.documentElement;d.classList.add(\"tb-cover\");setTimeout(function(){d.classList.remove(\"tb-cover\",\"tb-cover-out\")},4500);var s=document.createElement(\"script\");");
            if (devEnabled)
            {
                sb.Append("s.src=window.__tbDevMode?\"../UshereatsTheme/dev/splash.js\":\"../UshereatsTheme/splash.js?v=").Append(build.SplashVersion).Append("\";");
            }
            else
            {
                sb.Append("s.src=\"../UshereatsTheme/splash.js?v=").Append(build.SplashVersion).Append("\";");
            }

            sb.Append("document.head.appendChild(s)}}catch(e){}</script>");
        }

        // Page cross-fade: back / forward are listened to before Jellyfin's own listeners exist, so going back can
        // hold the old screen before Jellyfin swaps the page (the theme script fills in __tbHold)
        if (build.Config.PageTransitions)
        {
            sb.Append("<script>window.__tbEarlyHold=1;window.addEventListener(\"popstate\",function(e){if(window.__tbHold)window.__tbHold(e)},true);window.addEventListener(\"hashchange\",function(e){if(window.__tbHold)window.__tbHold(e)},true);</script>");
        }

        // WebP images where the browser shows them (smaller than JPEG at the same quality). Asked for by name
        // ("&format=webp") rather than left to the browser's Accept header, so a cache in front of the server
        // (Cloudflare) keeps the WebP and JPEG copies apart and never hands one browser the other's.
        // The answer is checked once by decoding a tiny WebP and remembered; until then the canvas test decides.
        sb.Append("<script>(function(){var s=null;try{s=localStorage.getItem(\"tb-webp\")}catch(e){}var ok=s===\"1\";if(s===null){try{ok=document.createElement(\"canvas\").toDataURL(\"image/webp\").indexOf(\"data:image/webp\")===0}catch(e){}}window.__tbImgFmt=ok?\"&format=webp\":\"&format=jpg\";if(s===null){var i=new Image();i.onload=function(){try{localStorage.setItem(\"tb-webp\",i.width>0?\"1\":\"0\")}catch(e){}};i.onerror=function(){try{localStorage.setItem(\"tb-webp\",\"0\")}catch(e){}};i.src=\"data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA\"}})();</script>");

        // Instant hero: paints the hero we're about to show and asks for its data before Jellyfin even starts
        if (build.Config.Hero)
        {
            sb.Append("<style>html.tb-hs::before{content:\"\";position:absolute;z-index:10;pointer-events:none;left:var(--tb-hs-l,0);top:var(--tb-hs-t,0);width:var(--tb-hs-w,100%);height:var(--tb-hs-h,70vh);background:linear-gradient(90deg,rgba(0,0,0,.72) 0%,rgba(0,0,0,.52) 16%,rgba(0,0,0,.34) 32%,rgba(0,0,0,.19) 46%,rgba(0,0,0,.09) 57%,rgba(0,0,0,.03) 64%,transparent 70%),linear-gradient(transparent 50%,rgba(0,0,0,.12) 64%,rgba(0,0,0,.28) 76%,rgba(0,0,0,.46) 86%,rgba(0,0,0,.64) 94%,rgba(0,0,0,.78) 100%),var(--tb-hs-img,none) 50% 28%/cover no-repeat #0b0b0e;-webkit-mask-image:linear-gradient(180deg,#000 0%,#000 45%,rgba(0,0,0,.75) 62%,rgba(0,0,0,.35) 80%,transparent 100%);mask-image:linear-gradient(180deg,#000 0%,#000 45%,rgba(0,0,0,.75) 62%,rgba(0,0,0,.35) 80%,transparent 100%);transition:opacity .3s ease}html.tb-hs.tb-hs-out::before{opacity:0}html.tb-hs .splashLogo{visibility:hidden!important}</style>");
            {
                // the hero's look settings, so the hero never waits for a request
                sb.Append("<script>window.__tbSleekHero=").Append(System.Text.Json.JsonSerializer.Serialize(SleekSettings.Hero(ThemeAssets.SleekOf(build.Config)))).Append("</script>");
            }

            sb.Append("<script>").Append(ThemeAssets.Text("hero_boot.js")).Append("</script>");
        }

        // Home rows: Jellyfin's own rows hidden from the first frame, and ours requested before Jellyfin starts
        if (build.Config.HomeRows)
        {
            sb.Append("<style>html.tb-rows #homeTab>.sections:not(.tb-rows-c){display:none!important}</style>");
            sb.Append("<script>").Append(ThemeAssets.Text("rows_boot.js")).Append("</script>");
        }

        // Your logo in the browser tab, on phone home screens (iPhone and Android) and in link previews, from the first
        // frame. Jellyfin's own icon links and app manifest are taken out (below), so browsers can't pick Jellyfin's.
        string? logoUrl = ThemeAssets.LogoUrl(build.Config, "../");
        if (logoUrl != null)
        {
            string icon = WebUtility.HtmlEncode(logoUrl);
            sb.Append("<link rel=\"icon\" href=\"").Append(icon).Append("\" data-tb-icon>");
            sb.Append("<link rel=\"shortcut icon\" href=\"").Append(icon).Append("\" data-tb-icon>");
            sb.Append("<link rel=\"apple-touch-icon\" sizes=\"180x180\" href=\"").Append(icon).Append("\" data-tb-icon>");
            sb.Append("<link rel=\"manifest\" href=\"../UshereatsTheme/manifest.json?v=").Append(build.Version).Append("\" data-tb-icon>");
            sb.Append("<meta property=\"og:image\" content=\"").Append(icon).Append("\">");
            html = StripJellyfinIcons(html);
            head = html.IndexOf("</head>", StringComparison.OrdinalIgnoreCase);
        }

        // The theme itself: stylesheet (applied before first paint) + scripts (run once the page is parsed).
        // document.write is used in the dev branch so the browser sees parser-inserted tags — the stylesheet
        // blocks rendering (no flash) and the script gets true defer semantics, exactly like the normal branch.
        if (devEnabled)
        {
            sb.Append("<script>(function(){");
            sb.Append("var d=window.__tbDevMode;");
            sb.Append("var b=d?'../UshereatsTheme/dev':'../UshereatsTheme';");
            sb.Append("var v=d?'':'?v=").Append(build.Version).Append("';");
            sb.Append("document.write('<link id=\"tb-theme-css\" rel=\"stylesheet\" href=\"'+b+'/theme.css'+v+'\">');");
            sb.Append("document.write('<scr'+'ipt src=\"'+b+'/theme.js'+v+'\" defer><\\/scr'+'ipt>');");
            sb.Append("})();</script>");
        }
        else
        {
            sb.Append("<link id=\"tb-theme-css\" rel=\"stylesheet\" href=\"../UshereatsTheme/theme.css?v=").Append(build.Version).Append("\">");
            sb.Append("<script src=\"../UshereatsTheme/theme.js?v=").Append(build.Version).Append("\" defer></script>");
        }

        return html.Insert(head, sb.ToString());
    }

    // Jellyfin's own <link rel="icon" / "apple-touch-icon" / "manifest"> tags (ours are added instead)
    private static string StripJellyfinIcons(string html) =>
        System.Text.RegularExpressions.Regex.Replace(
            html,
            "<link\\b(?![^>]*data-tb-icon)[^>]*\\brel=[\"']?(?:shortcut icon|icon|apple-touch-icon(?:-precomposed)?|manifest|mask-icon)[\"']?[^>]*>",
            string.Empty,
            System.Text.RegularExpressions.RegexOptions.IgnoreCase);

    // SleekFin's boot flags (same as SleekFin's own): header/hero switches, card shapes, sizes, and the
    // "header loading" state that keeps Jellyfin's plain header invisible until the real one is built
    private static string SleekBoot(SleekConfiguration c)
    {
        string headerEnabled = c.HeaderEnabled ? "true" : "false";
        string headerHeight = c.HeaderHeight.ToString(CultureInfo.InvariantCulture);
        string heroMobileHeight = c.HeroMobileHeight.ToString(CultureInfo.InvariantCulture);
        string heroDesktopHeight = c.HeroDesktopHeight.ToString(CultureInfo.InvariantCulture);
        string cardShape = WebUtility.HtmlEncode(c.MediaCardShape);
        string castShape = WebUtility.HtmlEncode(c.CastCrewShape);
        return "<script>(function(){var r=document.documentElement,t=(location.hash.slice(1)||location.pathname+location.search).replace(/^!+/,''),i=t.search(/[?&]/),p=(i<0?t:t.slice(0,i)).replace(/^[!\\/]+/,'/').replace(/\\/+$/,'')||'/',d=p==='/dashboard'||p.indexOf('/dashboard/')===0||p==='/configurationpage'||p==='/metadata'||p==='/video';"
            + "r.dataset.sleekfinHeaderEnabled='" + headerEnabled + "';r.dataset.sleekfinMediaCardShape='" + cardShape + "';r.dataset.sleekfinCastCrewShape='" + castShape + "';"
            + "r.style.setProperty('--sleekfin-header-height','" + headerHeight + "px');r.style.setProperty('--sleekfin-hero-mobile-height','" + heroMobileHeight + "vh');r.style.setProperty('--sleekfin-hero-desktop-height','" + heroDesktopHeight + "vh');"
            + "if(" + headerEnabled + "&&!d)r.classList.add('sleekfin-header-boot-loading');"
            + "if(" + headerEnabled + ")setTimeout(function(){r.classList.remove('sleekfin-header-boot-loading')},4000)})();</script>";
    }

    // "#e8c050" -> "232, 192, 80" (the theme's see-through glows use the accent as plain numbers)
    internal static string HexToRgb(string hex)
    {
        if (hex.Length == 7 && hex[0] == '#'
            && int.TryParse(hex.AsSpan(1), NumberStyles.HexNumber, CultureInfo.InvariantCulture, out int v))
        {
            return ((v >> 16) & 255).ToString(CultureInfo.InvariantCulture) + ", " + ((v >> 8) & 255).ToString(CultureInfo.InvariantCulture) + ", " + (v & 255).ToString(CultureInfo.InvariantCulture);
        }

        return "232, 192, 80";
    }

    // Browsers scale oversized radii down to half the shortest side, so Circle stays round on square artwork.
    internal static string ShapeRadius(string shape, int square, int squircle) => shape switch
    {
        "Square" => square.ToString(CultureInfo.InvariantCulture) + "px",
        "Circle" => "9999px",
        _ => squircle.ToString(CultureInfo.InvariantCulture) + "px",
    };

    // font-display: block = text waits (briefly, the files are preloaded) instead of flashing a fallback font
    private static void AppendFont(StringBuilder sb, string family, string weight, string file, string version, string range)
    {
        sb.Append("@font-face{font-family:\"").Append(family).Append("\";font-style:normal;font-weight:").Append(weight)
          .Append(";font-display:block;src:url(\"../UshereatsTheme/font/").Append(file).Append("?v=").Append(version)
          .Append("\") format(\"woff2\");unicode-range:").Append(range).Append('}');
    }
}
