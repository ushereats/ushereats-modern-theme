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

    [HttpGet("theme.css")]
    public IActionResult GetCss() => Serve(ThemeAssets.Get().Css, "text/css; charset=utf-8");

    [HttpGet("theme.js")]
    public IActionResult GetJs() => Serve(ThemeAssets.Get().Js, "application/javascript; charset=utf-8");

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
