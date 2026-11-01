using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Tasks;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.UshereatsTheme;

/// <summary>
/// Reads TMDB's "Trending - All - This Week" now and keeps the titles you own, in TMDB's order (run by hand under
/// Dashboard > Scheduled Tasks). It also happens on its own, as often as the "Trending updates" setting says, and
/// new titles join the row as soon as they're added (see <see cref="TrendingWatcher"/>).
/// </summary>
public class TrendingTask : IScheduledTask
{
    private readonly ILibraryManager _library;
    private readonly ILogger<TrendingTask> _logger;

    public TrendingTask(ILibraryManager library, ILogger<TrendingTask> logger)
    {
        _library = library;
        _logger = logger;
    }

    public string Name => "Ushereats Theme: Trending This Week";

    public string Key => "Jellyfin.Plugin.UshereatsTheme.Trending";

    public string Description => "Updates the Trending row from TMDB's weekly trending chart now (titles in your library only). Also runs on its own, as often as the theme's \"Trending updates\" setting says, and new titles join the row as soon as they're added.";

    public string Category => "Ushereats Theme";

    public async Task ExecuteAsync(IProgress<double> progress, CancellationToken cancellationToken)
    {
        await Trending.RefreshAsync(_library, _logger, cancellationToken).ConfigureAwait(false);
        progress.Report(100);
    }

    public IEnumerable<TaskTriggerInfo> GetDefaultTriggers()
    {
        // the schedule is the theme's own setting (Trending updates), so nothing here by default
        yield break;
    }
}
