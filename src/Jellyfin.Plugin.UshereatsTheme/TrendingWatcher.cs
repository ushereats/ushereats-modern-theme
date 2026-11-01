using System.Collections.Concurrent;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.Movies;
using MediaBrowser.Controller.Entities.TV;
using MediaBrowser.Controller.Library;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.UshereatsTheme;

/// <summary>
/// Keeps "Trending This Week" current without waiting for the next chart read:
/// - a movie or show you add that's on TMDB's chart joins the row as soon as Jellyfin has its TMDB id
///   (matched to the chart already read, so TMDB isn't asked again);
/// - a title you remove leaves the row;
/// - TMDB's chart itself is read again as often as the "Trending updates" setting says (1-24 hours).
/// </summary>
public sealed class TrendingWatcher : IHostedService, IDisposable
{
    private static readonly TimeSpan Settle = TimeSpan.FromSeconds(3);   // a scan adding many titles becomes one re-match

    private readonly ILibraryManager _library;
    private readonly ILogger<TrendingWatcher> _logger;
    private readonly SemaphoreSlim _signal = new SemaphoreSlim(0);
    private readonly ConcurrentDictionary<Guid, byte> _pending = new ConcurrentDictionary<Guid, byte>();
    private CancellationTokenSource? _stop;
    private Task? _loop;
    private DateTime _due = DateTime.MaxValue;

    public TrendingWatcher(ILibraryManager library, ILogger<TrendingWatcher> logger)
    {
        _library = library;
        _logger = logger;
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        _stop = new CancellationTokenSource();
        _library.ItemAdded += OnChanged;
        _library.ItemUpdated += OnChanged;
        _library.ItemRemoved += OnRemoved;
        _loop = Task.Run(() => RunAsync(_stop.Token), CancellationToken.None);
        return Task.CompletedTask;
    }

    public async Task StopAsync(CancellationToken cancellationToken)
    {
        _library.ItemAdded -= OnChanged;
        _library.ItemUpdated -= OnChanged;
        _library.ItemRemoved -= OnRemoved;
        if (_stop != null)
        {
            await _stop.CancelAsync().ConfigureAwait(false);
        }

        if (_loop != null)
        {
            try
            {
                await _loop.ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
            }
        }
    }

    public void Dispose()
    {
        _stop?.Dispose();
        _signal.Dispose();
    }

    private void OnChanged(object? sender, ItemChangeEventArgs e)
    {
        // a new title often has no TMDB id at first: it's checked again on each update until Jellyfin has it
        if (e.Item is Movie or Series && Trending.OnChartButMissing(e.Item))
        {
            Soon();
        }
    }

    private void OnRemoved(object? sender, ItemChangeEventArgs e)
    {
        if (e.Item is Movie or Series && Trending.Contains(e.Item))
        {
            Soon();
        }
    }

    private void Soon()
    {
        _due = DateTime.UtcNow + Settle;
        _signal.Release();
    }

    private async Task RunAsync(CancellationToken token)
    {
        while (!token.IsCancellationRequested)
        {
            try
            {
                // wake up for a re-match, or at the latest every minute to see if the chart is due a re-read
                TimeSpan wait = _due == DateTime.MaxValue ? TimeSpan.FromMinutes(1) : _due - DateTime.UtcNow;
                if (wait > TimeSpan.Zero)
                {
                    await _signal.WaitAsync(wait > TimeSpan.FromMinutes(1) ? TimeSpan.FromMinutes(1) : wait, token).ConfigureAwait(false);
                    if (_due > DateTime.UtcNow && !Trending.IsStale())
                    {
                        continue;
                    }
                }

                if (Trending.IsStale())
                {
                    _due = DateTime.MaxValue;
                    await Trending.RefreshAsync(_library, _logger, token).ConfigureAwait(false);
                }
                else if (_due <= DateTime.UtcNow)
                {
                    _due = DateTime.MaxValue;
                    await Trending.RematchAsync(_library, _logger, token).ConfigureAwait(false);
                }
            }
            catch (OperationCanceledException) when (token.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "[Ushereats Theme] Trending watcher");
                await Task.Delay(TimeSpan.FromMinutes(1), token).ConfigureAwait(false);
            }
        }
    }
}
