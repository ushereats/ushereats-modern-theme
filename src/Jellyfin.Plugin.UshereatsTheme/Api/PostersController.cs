using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.Providers;
using MediaBrowser.Model.IO;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.UshereatsTheme.Api;

/// <summary>The plugin page's "Refresh posters" button (admins only).</summary>
[ApiController]
[Authorize(Policy = "RequiresElevation")]
[Route("UshereatsTheme/Posters")]
public class PostersController : ControllerBase
{
    private readonly ILibraryManager _library;
    private readonly IProviderManager _providers;
    private readonly IFileSystem _fileSystem;
    private readonly ILogger<PostersController> _logger;

    public PostersController(ILibraryManager library, IProviderManager providers, IFileSystem fileSystem, ILogger<PostersController> logger)
    {
        _library = library;
        _providers = providers;
        _fileSystem = fileSystem;
        _logger = logger;
    }

    /// <summary>Starts getting every title in these libraries a new poster from the libraries' poster sources.</summary>
    [HttpPost("Refresh")]
    public IActionResult Refresh([FromBody] RefreshRequest request)
    {
        Guid[] ids = (request?.LibraryIds ?? Array.Empty<Guid>()).Distinct().ToArray();
        if (ids.Length == 0)
        {
            return BadRequest("No libraries chosen");
        }

        if (!PosterRefresh.Start(_library, _providers, _fileSystem, _logger, ids))
        {
            return Conflict(PosterRefresh.Status());
        }

        return Ok(PosterRefresh.Status());
    }

    /// <summary>How far the refresh is.</summary>
    [HttpGet("Status")]
    public IActionResult Status() => Ok(PosterRefresh.Status());

    /// <summary>Stops the refresh (posters already done stay).</summary>
    [HttpPost("Cancel")]
    public IActionResult Cancel()
    {
        PosterRefresh.Cancel();
        return Ok(PosterRefresh.Status());
    }

    /// <summary>The libraries to refresh.</summary>
    public class RefreshRequest
    {
        public Guid[] LibraryIds { get; set; } = Array.Empty<Guid>();
    }
}
