using System.Net.Http.Headers;
using System.Text.Json;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.Movies;
using MediaBrowser.Controller.Entities.TV;
using MediaBrowser.Controller.Library;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.UshereatsTheme;

/// <summary>One title from TMDB's weekly trending list that is in this library.</summary>
public sealed class TrendingEntry
{
    public string Id { get; set; } = string.Empty;

    /// <summary>False when it hasn't been released yet (premiere date in the future).</summary>
    public bool Out { get; set; } = true;
}

/// <summary>The saved trending list (refreshed daily, kept on disk so it's ready right after a restart).</summary>
public sealed class TrendingList
{
    /// <summary>When TMDB's chart was last read.</summary>
    public DateTime At { get; set; }

    public List<TrendingEntry> Items { get; set; } = new List<TrendingEntry>();

    /// <summary>TMDB's whole chart as last read ("movie:123", "tv:456"), so new titles can be matched to it without asking TMDB again.</summary>
    public List<string> Chart { get; set; } = new List<string>();
}

/// <summary>
/// "Trending This Week": TMDB's Trending - All - This Week chart (movies + shows), in TMDB's order,
/// keeping only titles you own (matched by TMDB id, never by name).
/// </summary>
public static class Trending
{
    private const int Keep = 40;      // owned titles kept (rows take the first N each viewer can see)
    private const int MaxPages = 25;  // 25 x 20 = reads up to 500 deep

    private static readonly HttpClient Http = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
    private static readonly SemaphoreSlim Gate = new SemaphoreSlim(1, 1);
    private static readonly JsonSerializerOptions Json = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
    private static TrendingList? s_current;
    private static string s_keyUsed = string.Empty;
    private static DateTime s_lastTry = DateTime.MinValue;

    private static string FilePath => Path.Combine(Plugin.Instance?.DataFolderPath ?? Path.GetTempPath(), "trending.json");

    /// <summary>The current list (loaded from disk the first time).</summary>
    public static TrendingList Current
    {
        get
        {
            TrendingList? c = s_current;
            if (c != null)
            {
                return c;
            }

            try
            {
                if (File.Exists(FilePath))
                {
                    c = JsonSerializer.Deserialize<TrendingList>(File.ReadAllText(FilePath), Json);
                }
            }
            catch (Exception)
            {
                c = null;
            }

            s_current = c ?? new TrendingList();
            return s_current;
        }
    }

    /// <summary>How often TMDB's chart is read again (setting "Trending updates", 1-24 hours).</summary>
    public static TimeSpan Interval => TimeSpan.FromHours(Math.Clamp(Plugin.Instance?.Configuration.TrendingRefreshHours ?? 6, 1, 24));

    /// <summary>True when the chart is on TMDB's list but this title isn't in Trending yet.</summary>
    public static bool OnChartButMissing(BaseItem item)
    {
        string? kind = item is Movie ? "movie" : item is Series ? "tv" : null;
        if (kind == null || item.ProviderIds == null || !item.ProviderIds.TryGetValue("Tmdb", out string? tmdb) || string.IsNullOrWhiteSpace(tmdb))
        {
            return false;
        }

        TrendingList c = Current;
        string id = item.Id.ToString("N");
        return c.Chart.Contains(kind + ":" + tmdb.Trim()) && !c.Items.Any(i => i.Id == id);
    }

    /// <summary>True when the title is in Trending (so removing it changes the row).</summary>
    public static bool Contains(BaseItem item)
    {
        string id = item.Id.ToString("N");
        return Current.Items.Any(i => i.Id == id);
    }

    /// <summary>True when there's nothing yet, it's older than the "Trending updates" setting, or the TMDB key changed.</summary>
    public static bool IsStale()
    {
        string key = (Plugin.Instance?.Configuration.TmdbKey ?? string.Empty).Trim();
        if (key.Length == 0)
        {
            return false;
        }

        TrendingList c = Current;
        // a failed read is tried again after 10 minutes, not on every check
        if (DateTime.UtcNow - s_lastTry < TimeSpan.FromMinutes(10) && s_lastTry > c.At)
        {
            return false;
        }

        return c.Chart.Count == 0 || DateTime.UtcNow - c.At > Interval || (s_keyUsed.Length > 0 && s_keyUsed != key);
    }

    /// <summary>Reads TMDB's chart again, then matches it to the library.</summary>
    public static async Task RefreshAsync(ILibraryManager library, ILogger logger, CancellationToken ct)
    {
        string key = (Plugin.Instance?.Configuration.TmdbKey ?? string.Empty).Trim();
        if (key.Length == 0)
        {
            logger.LogInformation("[Ushereats Theme] Trending: no TMDB key in the plugin settings, skipped.");
            return;
        }

        if (!await Gate.WaitAsync(0, ct).ConfigureAwait(false))
        {
            return; // already running
        }

        try
        {
            s_lastTry = DateTime.UtcNow;
            List<string>? chart = await ReadChartAsync(key, logger, ct).ConfigureAwait(false);
            if (chart == null)
            {
                return; // keep the last good list
            }

            s_keyUsed = key;
            await MatchAndSaveAsync(library, chart, DateTime.UtcNow, logger, ct).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "[Ushereats Theme] Trending refresh failed (kept the last list).");
        }
        finally
        {
            Gate.Release();
        }
    }

    /// <summary>Matches the chart already read to the library again (new titles added), without asking TMDB.</summary>
    public static async Task RematchAsync(ILibraryManager library, ILogger logger, CancellationToken ct)
    {
        TrendingList c = Current;
        if (c.Chart.Count == 0)
        {
            await RefreshAsync(library, logger, ct).ConfigureAwait(false);   // nothing read yet (older saved list)
            return;
        }

        await Gate.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            await MatchAndSaveAsync(library, Current.Chart, Current.At, logger, ct).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "[Ushereats Theme] Trending: couldn't match new titles.");
        }
        finally
        {
            Gate.Release();
        }
    }

    // TMDB's whole weekly chart, in order ("movie:123" / "tv:456"); null when TMDB couldn't be read
    private static async Task<List<string>?> ReadChartAsync(string key, ILogger logger, CancellationToken ct)
    {
        List<string> chart = new List<string>();
        bool bearer = key.Length > 40;
        for (int page = 1; page <= MaxPages; page++)
        {
            string url = "https://api.themoviedb.org/3/trending/all/week?language=en-US&page=" + page + (bearer ? string.Empty : "&api_key=" + Uri.EscapeDataString(key));
            using HttpRequestMessage req = new HttpRequestMessage(HttpMethod.Get, url);
            req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
            if (bearer)
            {
                req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", key);
            }

            using HttpResponseMessage res = await Http.SendAsync(req, ct).ConfigureAwait(false);
            if (!res.IsSuccessStatusCode)
            {
                logger.LogWarning("[Ushereats Theme] Trending: TMDB answered {Status} (check the TMDB key).", (int)res.StatusCode);
                if (page == 1)
                {
                    return null;
                }

                break;
            }

            using JsonDocument doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync(ct).ConfigureAwait(false));
            if (!doc.RootElement.TryGetProperty("results", out JsonElement results) || results.GetArrayLength() == 0)
            {
                break;
            }

            foreach (JsonElement r in results.EnumerateArray())
            {
                string type = r.TryGetProperty("media_type", out JsonElement mt) ? mt.GetString() ?? string.Empty : string.Empty;
                if ((type == "movie" || type == "tv") && r.TryGetProperty("id", out JsonElement idEl))
                {
                    chart.Add(type + ":" + idEl.ToString());
                }
            }

            if (doc.RootElement.TryGetProperty("total_pages", out JsonElement tp) && tp.TryGetInt32(out int total) && page >= total)
            {
                break;
            }
        }

        return chart;
    }

    private static async Task MatchAndSaveAsync(ILibraryManager library, List<string> chart, DateTime at, ILogger logger, CancellationToken ct)
    {
        // your movies + shows by TMDB id
        Dictionary<string, BaseItem> owned = new Dictionary<string, BaseItem>(StringComparer.Ordinal);
        IReadOnlyList<BaseItem> all = library.GetItemList(new InternalItemsQuery
        {
            Recursive = true,
            IsVirtualItem = false,
            IncludeItemTypes = new[] { Jellyfin.Data.Enums.BaseItemKind.Movie, Jellyfin.Data.Enums.BaseItemKind.Series },
        });
        foreach (BaseItem item in all)
        {
            string? kind = item is Movie ? "movie" : item is Series ? "tv" : null;
            if (kind != null && item.ProviderIds != null && item.ProviderIds.TryGetValue("Tmdb", out string? tmdb) && !string.IsNullOrWhiteSpace(tmdb))
            {
                owned.TryAdd(kind + ":" + tmdb.Trim(), item);
            }
        }

        List<TrendingEntry> found = new List<TrendingEntry>();
        HashSet<Guid> seen = new HashSet<Guid>();
        foreach (string entry in chart)
        {
            if (found.Count >= Keep)
            {
                break;
            }

            if (owned.TryGetValue(entry, out BaseItem? hit) && seen.Add(hit.Id))
            {
                found.Add(new TrendingEntry
                {
                    Id = hit.Id.ToString("N"),
                    Out = !hit.PremiereDate.HasValue || hit.PremiereDate.Value <= DateTime.UtcNow,
                });
            }
        }

        TrendingList list = new TrendingList { At = at, Items = found, Chart = chart };
        s_current = list;
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(FilePath)!);
            await File.WriteAllTextAsync(FilePath, JsonSerializer.Serialize(list, Json), ct).ConfigureAwait(false);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            logger.LogWarning(ex, "[Ushereats Theme] Trending: couldn't save the list.");
        }

        logger.LogInformation("[Ushereats Theme] Trending: {Count} of this week's trending titles are in your library.", list.Items.Count);
    }
}
