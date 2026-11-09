using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.UshereatsTheme.Api;

/// <summary>
/// Uploading / removing the server's logo: admins only (the theme's file routes are public, so these live here,
/// where that never applies). The logo itself is served by <see cref="ThemeController"/>.
/// </summary>
[ApiController]
[Authorize(Policy = "RequiresElevation")]
[Route("UshereatsTheme")]
public class LogoController : ControllerBase
{
    private readonly ILogger<LogoController> _logger;

    public LogoController(ILogger<LogoController> logger)
    {
        _logger = logger;
    }

    /// <summary>Upload the server's logo (PNG, JPEG, WebP or GIF, up to 3 MB). Admins only. Sent as the request body.</summary>
    [HttpPost("logo")]
    [RequestSizeLimit(4 * 1024 * 1024)]
    public async Task<IActionResult> UploadLogo()
    {
        Plugin? plugin = Plugin.Instance;
        if (plugin == null)
        {
            return StatusCode(500);
        }

        using var ms = new MemoryStream();
        await Request.Body.CopyToAsync(ms).ConfigureAwait(false);
        byte[] bytes = ms.ToArray();
        if (bytes.Length == 0 || bytes.Length > 3 * 1024 * 1024)
        {
            return BadRequest("An image up to 3 MB.");
        }

        // the file's own first bytes decide what it is (not its name): only pictures are kept
        string? type = ThemeController.ImageType(bytes);
        if (type == null)
        {
            return BadRequest("PNG, JPEG, WebP or GIF only.");
        }

        Directory.CreateDirectory(plugin.DataFolderPath);
        await System.IO.File.WriteAllBytesAsync(ThemeController.LogoPath(plugin), bytes).ConfigureAwait(false);
        plugin.Configuration.LogoType = type;
        plugin.Configuration.LogoVersion = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        plugin.SaveConfiguration();
        _logger.LogInformation("Ushereats Theme: new server logo ({Type}, {Kb} KB)", type, bytes.Length / 1024);
        return Ok(new { version = plugin.Configuration.LogoVersion });
    }

    /// <summary>Remove the uploaded logo (the Icon URL setting, or Jellyfin's own, is used again).</summary>
    [HttpDelete("logo")]
    public IActionResult DeleteLogo()
    {
        Plugin? plugin = Plugin.Instance;
        if (plugin == null)
        {
            return StatusCode(500);
        }

        if (System.IO.File.Exists(ThemeController.LogoPath(plugin)))
        {
            System.IO.File.Delete(ThemeController.LogoPath(plugin));
        }

        plugin.Configuration.LogoVersion = 0;
        plugin.Configuration.LogoType = string.Empty;
        plugin.SaveConfiguration();
        return Ok(new { version = 0 });
    }
}
