using Jellyfin.Plugin.UshereatsTheme.Configuration;
using Jellyfin.Plugin.UshereatsTheme.Sleek;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.UshereatsTheme.Api;

/// <summary>
/// Serves the theme files. Public (the sign-in page needs them) and cached by browsers for a year:
/// every change gets a new ?v= link, so updates still show up straight away.
/// </summary>
[ApiController]
[AllowAnonymous]
[Route("UshereatsTheme")]
public class ThemeController : ControllerBase
{
    private const string CacheForever = "public, max-age=31536000, immutable";

    private readonly ILibraryManager _library;
    private readonly ILogger<ThemeController> _logger;

    public ThemeController(ILibraryManager library, ILogger<ThemeController> logger)
    {
        _library = library;
        _logger = logger;
    }

    /// <summary>Trending This Week: library item ids in TMDB's order (ids only; each viewer's own access applies when the items are loaded).</summary>
    [HttpGet("trending")]
    public IActionResult GetTrending()
    {
        if (Trending.IsStale())
        {
            // first use / over a day old / new key: refresh in the background, answer with what we have now
            _ = Task.Run(() => Trending.RefreshAsync(_library, _logger, CancellationToken.None));
        }

        TrendingList list = Trending.Current;
        Response.Headers["Cache-Control"] = "no-cache";
        string json = System.Text.Json.JsonSerializer.Serialize(new { at = list.At, items = list.Items.Select(i => new { id = i.Id, @out = i.Out }) });
        return Content(json, "application/json; charset=utf-8");
    }

    // ── The server's logo (uploaded in the settings) ──

    /// <summary>The uploaded logo. Public (the sign-in page and the browser tab need it); its link changes with each upload.</summary>
    [HttpGet("logo")]
    public IActionResult GetLogo()
    {
        Plugin? plugin = Plugin.Instance;
        if (plugin == null || plugin.Configuration.LogoVersion == 0 || !System.IO.File.Exists(LogoPath(plugin)))
        {
            return NotFound();
        }

        Response.Headers["Cache-Control"] = CacheForever;
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        return PhysicalFile(LogoPath(plugin), string.IsNullOrEmpty(plugin.Configuration.LogoType) ? "image/png" : plugin.Configuration.LogoType);
    }

    /// <summary>The web app's manifest (phone home-screen icon, name, colours) with the server's logo in place of Jellyfin's.</summary>
    [HttpGet("manifest.json")]
    public IActionResult GetManifest()
    {
        PluginConfiguration config = Plugin.Instance?.Configuration ?? new PluginConfiguration();
        string? logo = ThemeAssets.LogoUrl(config, "../");
        string type = config.LogoVersion > 0 && !string.IsNullOrEmpty(config.LogoType) ? config.LogoType : "image/png";
        object[] icons = logo == null ? Array.Empty<object>() : new object[]
        {
            new { src = logo, sizes = "192x192", type, purpose = "any" },
            new { src = logo, sizes = "512x512", type, purpose = "any" },
        };
        var manifest = new
        {
            name = "Jellyfin",
            short_name = "Jellyfin",
            start_url = "../web/index.html",
            scope = "../web/",
            display = "standalone",
            background_color = "#000000",
            theme_color = "#000000",
            icons,
        };
        Response.Headers["Cache-Control"] = "public, max-age=3600";
        return Content(System.Text.Json.JsonSerializer.Serialize(manifest), "application/manifest+json; charset=utf-8");
    }

    internal static string LogoPath(Plugin plugin) => Path.Combine(plugin.DataFolderPath, "logo.img");

    internal static string? ImageType(byte[] b)
    {
        if (b.Length > 8 && b[0] == 0x89 && b[1] == 0x50 && b[2] == 0x4E && b[3] == 0x47)
        {
            return "image/png";
        }

        if (b.Length > 3 && b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF)
        {
            return "image/jpeg";
        }

        if (b.Length > 12 && b[0] == (byte)'R' && b[1] == (byte)'I' && b[2] == (byte)'F' && b[3] == (byte)'F' && b[8] == (byte)'W' && b[9] == (byte)'E' && b[10] == (byte)'B' && b[11] == (byte)'P')
        {
            return "image/webp";
        }

        if (b.Length > 6 && b[0] == (byte)'G' && b[1] == (byte)'I' && b[2] == (byte)'F')
        {
            return "image/gif";
        }

        return null;
    }

    [HttpGet("theme.css")]
    public IActionResult GetCss() => Serve(ThemeAssets.Get().Css, "text/css; charset=utf-8");

    [HttpGet("theme.js")]
    public IActionResult GetJs() => Serve(ThemeAssets.Get().Js, "application/javascript; charset=utf-8");

    /// <summary>
    /// Dev routes: same build logic as production but reads assets from DevAssetsUrl (the PC's npm run dev server).
    /// Falls back to the embedded build if DevAssetsUrl is not set or the dev server can't be reached.
    /// No caching — always fresh.
    /// </summary>
    [HttpGet("dev/theme.css")]
    public IActionResult GetDevCss()
    {
        ThemeBuild build = DevBuild();
        Response.Headers["Cache-Control"] = "no-store";
        Response.Headers["Access-Control-Allow-Origin"] = "*";
        return File(build.Css.Raw, "text/css; charset=utf-8");
    }

    [HttpGet("dev/theme.js")]
    public IActionResult GetDevJs()
    {
        ThemeBuild build = DevBuild();
        Response.Headers["Cache-Control"] = "no-store";
        Response.Headers["Access-Control-Allow-Origin"] = "*";
        return File(build.Js.Raw, "application/javascript; charset=utf-8");
    }

    [HttpGet("dev/splash.js")]
    public IActionResult GetDevSplashJs()
    {
        ThemeBuild build = DevBuild();
        Response.Headers["Cache-Control"] = "no-store";
        Response.Headers["Access-Control-Allow-Origin"] = "*";
        return File(build.SplashJs.Raw, "application/javascript; charset=utf-8");
    }

    [HttpGet("dev/dashboard.js")]
    public IActionResult GetDevDashboardJs()
    {
        ThemeBuild build = DevBuild();
        Response.Headers["Cache-Control"] = "no-store";
        Response.Headers["Access-Control-Allow-Origin"] = "*";
        return File(build.DashboardJs.Raw, "application/javascript; charset=utf-8");
    }

    [HttpGet("dev/part/{name}.js")]
    public IActionResult GetDevPart([FromRoute] string name)
    {
        ThemeBuild build = DevBuild();
        if (!build.Parts.TryGetValue(name, out Payload? part)) return NotFound();
        Response.Headers["Cache-Control"] = "no-store";
        Response.Headers["Access-Control-Allow-Origin"] = "*";
        return File(part.Raw, "application/javascript; charset=utf-8");
    }

    private static ThemeBuild DevBuild()
    {
        PluginConfiguration config = Plugin.Instance?.Configuration ?? new PluginConfiguration();
        string? url = config.DevAssetsUrl;
        return string.IsNullOrWhiteSpace(url) ? ThemeAssets.Get() : ThemeAssets.BuildDev(config, url);
    }

    [HttpGet("splash.js")]
    public IActionResult GetSplashJs() => Serve(ThemeAssets.Get().SplashJs, "application/javascript; charset=utf-8");

    [HttpGet("part/{name}.js")]
    public IActionResult GetPart([FromRoute] string name) =>
        ThemeAssets.Get().Parts.TryGetValue(name, out Payload? part) ? Serve(part, "application/javascript; charset=utf-8") : NotFound();

    [HttpGet("dashboard.js")]
    public IActionResult GetDashboardJs() => Serve(ThemeAssets.Get().DashboardJs, "application/javascript; charset=utf-8");

    [HttpGet("font/{name}")]
    public IActionResult GetFont([FromRoute] string name)
    {
        byte[]? font = ThemeAssets.GetFont(name);
        if (font == null || font.Length == 0)
        {
            return NotFound();
        }

        Response.Headers["Cache-Control"] = CacheForever;
        Response.Headers["Access-Control-Allow-Origin"] = "*";
        return File(font, "font/woff2");
    }

    // ── Built-in SleekFin: its settings (the page already has them; these are for after you change them) ──
    [HttpGet("Sleek/Header")]
    public IActionResult GetSleekHeader() => SleekAnswer(SleekSettings.Header);

    [HttpGet("Sleek/Hero/Settings")]
    public IActionResult GetSleekHero() => SleekAnswer(SleekSettings.Hero);

    [HttpGet("Sleek/Details/Settings")]
    public IActionResult GetSleekDetails() => SleekAnswer(SleekSettings.Details);

    /// <summary>Files the SleekFin settings page loads by name (details builder script + styles).</summary>
    [HttpGet("Sleek/{file}")]
    public IActionResult GetSleekFile([FromRoute] string file)
    {
        Payload? p = ThemeAssets.SleekFile(file);
        if (p == null)
        {
            return NotFound();
        }

        return Serve(p, file.EndsWith(".css", StringComparison.Ordinal) ? "text/css; charset=utf-8" : "application/javascript; charset=utf-8");
    }

    private IActionResult SleekAnswer(Func<SleekConfiguration, object> pick)
    {
        SleekConfiguration s = Plugin.Instance?.Configuration.Sleek ?? new SleekConfiguration();
        Response.Headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
        return Content(System.Text.Json.JsonSerializer.Serialize(pick(s)), "application/json; charset=utf-8");
    }

    [HttpGet("studio/{name}")]
    public IActionResult GetStudio([FromRoute] string name)
    {
        Payload? svg = ThemeAssets.GetStudio(name);
        if (svg == null)
        {
            return NotFound();
        }

        Response.Headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'";
        Response.Headers["Access-Control-Allow-Origin"] = "*";
        return Serve(svg, "image/svg+xml");
    }

    [HttpGet("splash.mp3")]
    public IActionResult GetSplash()
    {
        byte[] mp3 = ThemeAssets.Get().Mp3;
        if (mp3.Length == 0)
        {
            return NotFound();
        }

        Response.Headers["Cache-Control"] = CacheForever;
        return File(mp3, "audio/mpeg", true);
    }

    private IActionResult Serve(Payload payload, string contentType)
    {
        Response.Headers["Cache-Control"] = CacheForever;
        Response.Headers["Vary"] = "Accept-Encoding";
        Response.Headers["ETag"] = payload.ETag;
        Response.Headers["X-Content-Type-Options"] = "nosniff";

        if (Request.Headers["If-None-Match"].ToString() == payload.ETag)
        {
            return StatusCode(StatusCodes.Status304NotModified);
        }

        string accept = Request.Headers["Accept-Encoding"].ToString();
        if (payload.Brotli.Length > 0 && accept.Contains("br", StringComparison.OrdinalIgnoreCase))
        {
            Response.Headers["Content-Encoding"] = "br";
            return File(payload.Brotli, contentType);
        }

        if (payload.Gzip.Length > 0 && accept.Contains("gzip", StringComparison.OrdinalIgnoreCase))
        {
            Response.Headers["Content-Encoding"] = "gzip";
            return File(payload.Gzip, contentType);
        }

        return File(payload.Raw, contentType);
    }
}
