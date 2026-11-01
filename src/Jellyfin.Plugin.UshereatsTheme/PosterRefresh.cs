using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.Movies;
using MediaBrowser.Controller.Entities.TV;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.Providers;
using MediaBrowser.Model.Entities;
using MediaBrowser.Model.IO;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.UshereatsTheme;

/// <summary>
/// "Refresh posters" on the plugin page: gets every movie, show, season and collection in the chosen libraries a
/// new poster, using the library's own poster sources in its own order (the first source that has one wins,
/// the next ones are the fallback). Only the poster is replaced - other artwork and metadata are left alone,
/// and a title keeps its current poster when no source has one. Runs in the background, a few at a time.
/// </summary>
public static class PosterRefresh
{
    private static readonly object s_lock = new();
    private static CancellationTokenSource? s_cancel;

    public static bool Running { get; private set; }

    public static int Total { get; private set; }

    private static int s_done;
    private static int s_failed;
    private static int s_changed;

    public static int Done => s_done;

    public static int Failed => s_failed;

    /// <summary>Titles that got a different poster.</summary>
    public static int Changed => s_changed;

    public static DateTime? StartedUtc { get; private set; }

    public static DateTime? FinishedUtc { get; private set; }

    public static bool Cancelled { get; private set; }

    public static object Status() => new { running = Running, total = Total, done = Done, failed = Failed, changed = Changed, startedUtc = StartedUtc, finishedUtc = FinishedUtc, cancelled = Cancelled };

    public static void Cancel()
    {
        lock (s_lock)
        {
            s_cancel?.Cancel();
        }
    }

    /// <summary>Starts a refresh of the given libraries. False if one is already running.</summary>
    public static bool Start(ILibraryManager library, IProviderManager providers, IFileSystem fileSystem, ILogger logger, IReadOnlyCollection<Guid> libraryIds)
    {
        CancellationTokenSource cancel;
        lock (s_lock)
        {
            if (Running)
            {
                return false;
            }

            Running = true;
            Cancelled = false;
            Total = 0;
            s_done = 0;
            s_failed = 0;
            s_changed = 0;
            StartedUtc = DateTime.UtcNow;
            FinishedUtc = null;
            s_cancel?.Dispose();
            s_cancel = cancel = new CancellationTokenSource();
        }

        _ = Task.Run(async () =>
        {
            try
            {
                await RunAsync(library, providers, fileSystem, logger, libraryIds, cancel.Token).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                Cancelled = true;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Ushereats Theme: poster refresh stopped");
            }
            finally
            {
                FinishedUtc = DateTime.UtcNow;
                Running = false;
            }
        });
        return true;
    }

    private static string? Poster(BaseItem item)
    {
        ItemImageInfo? p = item.GetImageInfo(ImageType.Primary, 0);
        return p is null ? null : p.Path + "|" + p.DateModified.Ticks;
    }

    private static bool HasPoster(BaseItem i) => !i.IsVirtualItem && i is Movie or Series or Season or BoxSet;

    private static async Task RunAsync(ILibraryManager library, IProviderManager providers, IFileSystem fileSystem, ILogger logger, IReadOnlyCollection<Guid> libraryIds, CancellationToken token)
    {
        var items = new Dictionary<Guid, BaseItem>();
        foreach (Guid id in libraryIds)
        {
            if (library.GetItemById(id) is Folder folder)
            {
                foreach (BaseItem item in folder.GetRecursiveChildren(HasPoster))
                {
                    items[item.Id] = item;
                }
            }
        }

        // shows before their seasons, so a season can fall back to its show's fresh poster
        List<BaseItem> list = items.Values.OrderBy(i => i is Season ? 1 : 0).ToList();
        Total = list.Count;
        logger.LogInformation("Ushereats Theme: refreshing {Count} posters in {Libraries} libraries", list.Count, libraryIds.Count);

        await Parallel.ForEachAsync(list, new ParallelOptions { MaxDegreeOfParallelism = 3, CancellationToken = token }, async (item, ct) =>
        {
            try
            {
                var options = new MetadataRefreshOptions(new DirectoryService(fileSystem))
                {
                    // posters only: no metadata lookups, and only the poster is replaced (when a source has one)
                    MetadataRefreshMode = MetadataRefreshMode.None,
                    ImageRefreshMode = MetadataRefreshMode.FullRefresh,
                    ReplaceAllImages = false,
                    ReplaceImages = new[] { ImageType.Primary },
                    ReplaceAllMetadata = false,
                    ForceSave = false
                };
                string? before = Poster(item);
                if (Done == 0 && Failed == 0)
                {
                    logger.LogInformation(
                        "Ushereats Theme: poster sources for {Name}: {Sources}",
                        item.Name,
                        string.Join(", ", providers.GetImageProviders(item, options).Select(p => p.Name)));
                }

                await providers.RefreshSingleItem(item, options, ct).ConfigureAwait(false);
                if (Poster(item) != before)
                {
                    Interlocked.Increment(ref s_changed);
                }
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex)
            {
                Interlocked.Increment(ref s_failed);
                logger.LogWarning(ex, "Ushereats Theme: couldn't refresh the poster of {Name}", item.Name);
            }
            finally
            {
                Interlocked.Increment(ref s_done);
            }
        }).ConfigureAwait(false);

        logger.LogInformation("Ushereats Theme: poster refresh finished ({Done} titles, {Changed} new posters, {Failed} failed)", Done, Changed, Failed);
    }
}
