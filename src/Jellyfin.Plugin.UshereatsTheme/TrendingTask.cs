using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Tasks;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.UshereatsTheme;

/// <summary>
/// Daily: reads TMDB's "Trending - All - This Week" and keeps the titles you own, in TMDB's order.
/// Shown under Dashboard > Scheduled Tasks, where it can also be run by hand.
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

    public string Description => "Updates the Trending row from TMDB's weekly trending chart (titles in your library only).";

    public string Category => "Ushereats Theme";

    public async Task ExecuteAsync(IProgress<double> progress, CancellationToken cancellationToken)
    {
        await Trending.RefreshAsync(_library, _logger, cancellationToken).ConfigureAwait(false);
        progress.Report(100);
    }

    public IEnumerable<TaskTriggerInfo> GetDefaultTriggers()
    {
        yield return new TaskTriggerInfo { Type = TaskTriggerInfoType.StartupTrigger };
        yield return new TaskTriggerInfo { Type = TaskTriggerInfoType.IntervalTrigger, IntervalTicks = TimeSpan.FromHours(12).Ticks };
    }
}
