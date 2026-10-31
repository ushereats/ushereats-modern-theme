using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

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

    [HttpGet("theme.css")]
    public IActionResult GetCss() => Serve(ThemeAssets.Get().Css, "text/css; charset=utf-8");

    [HttpGet("theme.js")]
    public IActionResult GetJs() => Serve(ThemeAssets.Get().Js, "application/javascript; charset=utf-8");

    [HttpGet("splash.js")]
    public IActionResult GetSplashJs() => Serve(ThemeAssets.Get().SplashJs, "application/javascript; charset=utf-8");

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
