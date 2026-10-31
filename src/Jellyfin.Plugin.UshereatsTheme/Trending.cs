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
    public DateTime At { get; set; }

    public List<TrendingEntry> Items { get; set; } = new List<TrendingEntry>();
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

    /// <summary>True when there's nothing yet, it's over a day old, or the TMDB key changed.</summary>
    public static bool IsStale()
    {
        string key = (Plugin.Instance?.Configuration.TmdbKey ?? string.Empty).Trim();
        if (key.Length == 0)
        {
            return false;
        }

        TrendingList c = Current;
        return c.Items.Count == 0 || DateTime.UtcNow - c.At > TimeSpan.FromHours(24) || (s_keyUsed.Length > 0 && s_keyUsed != key);
    }

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
            // your movies + shows by TMDB id
            Dictionary<string, BaseItem> movies = new Dictionary<string, BaseItem>(StringComparer.Ordinal);
            Dictionary<string, BaseItem> shows = new Dictionary<string, BaseItem>(StringComparer.Ordinal);
            IReadOnlyList<BaseItem> all = library.GetItemList(new InternalItemsQuery { Recursive = true, IsVirtualItem = false });
            foreach (BaseItem item in all)
            {
                Dictionary<string, BaseItem>? target = null;
                if (item is Movie)
                {
                    target = movies;
                }
                else if (item is Series)
                {
                    target = shows;
                }

                if (target != null && item.ProviderIds != null && item.ProviderIds.TryGetValue("Tmdb", out string? tmdb) && !string.IsNullOrWhiteSpace(tmdb))
                {
                    target.TryAdd(tmdb.Trim(), item);
                }
            }

            List<TrendingEntry> found = new List<TrendingEntry>();
            HashSet<Guid> seen = new HashSet<Guid>();
            bool bearer = key.Length > 40;
            for (int page = 1; page <= MaxPages && found.Count < Keep; page++)
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
                        return; // keep the last good list
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
                    if (!r.TryGetProperty("id", out JsonElement idEl))
                    {
                        continue;
                    }

                    string id = idEl.ToString();
                    BaseItem? hit = null;
                    if (type == "movie")
                    {
                        movies.TryGetValue(id, out hit);
                    }
                    else if (type == "tv")
                    {
                        shows.TryGetValue(id, out hit);
                    }

                    if (hit != null && seen.Add(hit.Id))
                    {
                        found.Add(new TrendingEntry
                        {
                            Id = hit.Id.ToString("N"),
                            Out = !hit.PremiereDate.HasValue || hit.PremiereDate.Value <= DateTime.UtcNow,
                        });
                    }
                }

                if (doc.RootElement.TryGetProperty("total_pages", out JsonElement tp) && tp.TryGetInt32(out int total) && page >= total)
                {
                    break;
                }
            }

            TrendingList list = new TrendingList { At = DateTime.UtcNow, Items = found.Take(Keep).ToList() };
            s_current = list;
            s_keyUsed = key;
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(FilePath)!);
                await File.WriteAllTextAsync(FilePath, JsonSerializer.Serialize(list, Json), ct).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "[Ushereats Theme] Trending: couldn't save the list.");
            }

            logger.LogInformation("[Ushereats Theme] Trending: {Count} of this week's trending titles are in your library.", list.Items.Count);
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
}
