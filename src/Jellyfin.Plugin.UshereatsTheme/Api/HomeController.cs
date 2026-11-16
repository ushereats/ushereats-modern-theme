using System.Text.Json;
using System.Text.Json.Serialization;
using Jellyfin.Data.Enums;
using Jellyfin.Database.Implementations.Entities;
using Jellyfin.Database.Implementations.Enums;
using MediaBrowser.Controller.Dto;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.TV;
using MediaBrowser.Model.Dto;
using MediaBrowser.Model.Entities;
using MediaBrowser.Model.Querying;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.UshereatsTheme.Api;

/// <summary>
/// B8: aggregate all home rows in one round-trip.
/// B9: return a real Jellyfin DTO for a single item.
/// All serialization goes through Jellyfin's configured ASP.NET JSON serializer (Ok()) so the JSON
/// is byte-for-byte compatible with what /Items and /Users/{uid}/Items/{id} return.
/// </summary>
[ApiController]
[AllowAnonymous]
[Route("UshereatsTheme")]
public class HomeController : ControllerBase
{
    // Matches the query string rows-boot.js sends to Jellyfin's own /Items endpoint:
    //   &Fields=PrimaryImageAspectRatio&ImageTypeLimit=1&EnableImageTypes=Primary,Backdrop,Thumb
    private static readonly DtoOptions SlimDto = new DtoOptions(false)
    {
        Fields = new[] { ItemFields.PrimaryImageAspectRatio },
        ImageTypes = new[] { ImageType.Primary, ImageType.Backdrop, ImageType.Thumb },
        ImageTypeLimit = 1,
        EnableImages = true,
        EnableUserData = true,
    };

    private readonly ILibraryManager _library;
    private readonly IUserManager _users;
    private readonly IDtoService _dto;
    private readonly ITVSeriesManager _tv;
    private readonly IUserDataManager _userData;

    public HomeController(
        ILibraryManager library,
        IUserManager users,
        IDtoService dto,
        ITVSeriesManager tv,
        IUserDataManager userData)
    {
        _library = library;
        _users = users;
        _dto = dto;
        _tv = tv;
        _userData = userData;
    }

    // ── B8 ───────────────────────────────────────────────────────────────────

    /// <summary>
    /// All home rows in one request. rows-boot.js calls this before falling back to individual /Items? calls.
    /// Returns { rowId: BaseItemDto[] } — the same objects Jellyfin's own /Items endpoint would return.
    /// </summary>
    [HttpGet("home")]
    public async Task<IActionResult> GetHomeRows(
        [FromQuery(Name = "userId")] string? userId,
        [FromQuery(Name = "rows")] string? rows)
    {
        if (string.IsNullOrEmpty(userId) || !Guid.TryParse(userId, out Guid uid))
        {
            return BadRequest();
        }

        User? user = _users.GetUserById(uid);
        if (user is null)
        {
            return Unauthorized();
        }

        List<HomeRowConfig>? rowList;
        try
        {
            rowList = string.IsNullOrEmpty(rows)
                ? new List<HomeRowConfig>()
                : JsonSerializer.Deserialize<List<HomeRowConfig>>(Uri.UnescapeDataString(rows), JsonOpts);
        }
        catch
        {
            return BadRequest();
        }

        if (rowList is null || rowList.Count == 0)
        {
            return Ok(new Dictionary<string, List<BaseItemDto>>());
        }

        Task<RowResult>[] tasks = rowList
            .Where(r => !string.Equals(r.Type, "studios", StringComparison.Ordinal))
            .Select(r => Task.Run(() => FetchRow(r, user)))
            .ToArray();

        await Task.WhenAll(tasks).ConfigureAwait(false);

        var result = new Dictionary<string, List<BaseItemDto>>();
        foreach (Task<RowResult> t in tasks)
        {
            result[t.Result.Id] = t.Result.Items;
        }

        Response.Headers["Cache-Control"] = "no-cache";
        return Ok(result);
    }

    private RowResult FetchRow(HomeRowConfig row, User user)
    {
        string id = row.Id ?? string.Empty;
        try
        {
            return new RowResult(id, FetchRowItems(row, user));
        }
        catch
        {
            return new RowResult(id, new List<BaseItemDto>());
        }
    }

    private List<BaseItemDto> FetchRowItems(HomeRowConfig row, User user)
    {
        int limit = row.Limit > 0 ? row.Limit : 16;

        if (string.Equals(row.Type, "continue", StringComparison.Ordinal))
        {
            return FetchContinue(row, user);
        }

        if (string.Equals(row.Type, "trending", StringComparison.Ordinal))
        {
            return FetchTrending(row, user, limit);
        }

        if (string.Equals(row.Type, "latest", StringComparison.Ordinal))
        {
            return FetchLatest(row, user, limit);
        }

        var query = new InternalItemsQuery
        {
            User = user,
            Limit = limit,
            Recursive = true,
            IsVirtualItem = false,
            IncludeItemTypes = ParseTypes(row.Types),
        };
        if (ParseGuid(row.ParentId) is Guid parentGuid)
        {
            query.ParentId = parentGuid;
        }

        ApplySortBy(query, row);
        if (row.Released == true)
        {
            query.MaxPremiereDate = DateTime.UtcNow;
        }

        List<BaseItemDto> items = GetDtos(query, user);
        if (row.Shuffle)
        {
            Shuffle(items);
        }

        return items;
    }

    private List<BaseItemDto> FetchLatest(HomeRowConfig row, User user, int limit)
    {
        if (ParseGuid(row.ParentId) is not Guid parentGuid)
        {
            return new List<BaseItemDto>();
        }

        BaseItem? parent = _library.GetItemById(parentGuid);
        if (parent is null)
        {
            return new List<BaseItemDto>();
        }

        CollectionType? ct = _library.GetContentType(parent);
        if (ct is null)
        {
            return new List<BaseItemDto>();
        }

        var query = new InternalItemsQuery
        {
            User = user,
            Limit = limit,
            Recursive = true,
            IsVirtualItem = false,
            IncludeItemTypes = ParseTypes(row.Types),
        };
        IReadOnlyList<BaseItem> items = _library.GetLatestItemList(query, new[] { parent }, ct.Value);
        return _dto.GetBaseItemDtos(items, SlimDto, user, null, false).ToList();
    }

    private List<BaseItemDto> FetchContinue(HomeRowConfig row, User user)
    {
        int resumeLimit = Math.Max(row.ResumeLimit > 0 ? row.ResumeLimit : 50, 50);
        int nextUpLimit = Math.Max(row.NextUpLimit > 0 ? row.NextUpLimit : 50, 50);
        int limit = row.Limit > 0 ? row.Limit : 50;

        var resumeQuery = new InternalItemsQuery
        {
            User = user,
            IsResumable = true,
            MediaTypes = new[] { MediaType.Video },
            IncludeItemTypes = new[] { BaseItemKind.Movie },
            Limit = resumeLimit,
            Recursive = true,
            IsVirtualItem = false,
            OrderBy = new[] { (ItemSortBy.DatePlayed, SortOrder.Descending) },
        };
        List<BaseItemDto> movies = GetDtos(resumeQuery, user);

        var nextUpQuery = new NextUpQuery
        {
            User = user,
            Limit = nextUpLimit,
            EnableResumable = true,
            EnableRewatching = false,
        };
        QueryResult<BaseItem> nextUpResult = _tv.GetNextUp(nextUpQuery, SlimDto);
        List<BaseItemDto> episodes = _dto.GetBaseItemDtos(nextUpResult.Items, SlimDto, user, null, false).ToList();

        // Sort key = most recent LastPlayedDate of ANY played episode in the series.
        // Jellyfin does not reliably update the Series item's own LastPlayedDate; querying played
        // episodes directly mirrors how ITVSeriesManager.GetNextUp decides recency.
        foreach (BaseItemDto ep in episodes)
        {
            if (!ep.SeriesId.HasValue || ep.SeriesId.Value == Guid.Empty || ep.UserData is null) continue;

            var playedQuery = new InternalItemsQuery
            {
                User = user,
                Recursive = true,
                IsVirtualItem = false,
                IncludeItemTypes = new[] { BaseItemKind.Episode },
                AncestorIds = new[] { ep.SeriesId.Value },
                IsPlayed = true,
                OrderBy = new[] { (ItemSortBy.DatePlayed, SortOrder.Descending) },
                Limit = 1,
            };
            QueryResult<BaseItem> playedEps = _library.GetItemsResult(playedQuery);
            if (playedEps.Items.Count > 0)
            {
                UserItemData? playedUd = _userData.GetUserData(user, playedEps.Items[0]);
                DateTime? mostRecent = playedUd?.LastPlayedDate;
                if (mostRecent.HasValue && mostRecent.Value > (ep.UserData.LastPlayedDate ?? DateTime.MinValue))
                {
                    ep.UserData.LastPlayedDate = mostRecent.Value;
                }
            }
        }

        return MergeContinue(movies, episodes, limit);
    }

    private List<BaseItemDto> FetchTrending(HomeRowConfig row, User user, int limit)
    {
        TrendingList t = Trending.Current;
        bool allowUnreleased = row.Released == false;
        List<string> ids = t.Items
            .Where(i => allowUnreleased || i.Out)
            .Select(i => i.Id)
            .Take(limit + 10)
            .ToList();

        if (ids.Count == 0)
        {
            return new List<BaseItemDto>();
        }

        var query = new InternalItemsQuery
        {
            User = user,
            ItemIds = ids.Select(i => Guid.TryParse(i, out Guid g) ? g : Guid.Empty).Where(g => g != Guid.Empty).ToArray(),
            Limit = limit + 10,
        };
        Dictionary<string, BaseItemDto> byId = GetDtos(query, user)
            .ToDictionary(x => x.Id.ToString("N"), x => x);

        var ordered = new List<BaseItemDto>();
        foreach (string id in ids)
        {
            if (ordered.Count >= limit) break;
            if (byId.TryGetValue(id.Replace("-", string.Empty, StringComparison.Ordinal), out BaseItemDto? item))
            {
                ordered.Add(item);
            }
        }

        return ordered;
    }

    // ── Debug: Continue Watching pipeline ────────────────────────────────────

    /// <summary>
    /// Debug view of the Continue Watching pipeline for the signed-in user.
    /// Returns every step — rawResume, rawNextUp, merged, deduped, final — so you can see
    /// exactly which step drops a series. Only works for the userId in the query string.
    /// Usage: GET /UshereatsTheme/home/debug?userId=&lt;uid&gt;&amp;resumeLimit=50&amp;nextUpLimit=50&amp;limit=50
    /// </summary>
    [HttpGet("home/debug")]
    public IActionResult GetContinueDebug(
        [FromQuery(Name = "userId")] string? userId,
        [FromQuery(Name = "resumeLimit")] int resumeLimit = 50,
        [FromQuery(Name = "nextUpLimit")] int nextUpLimit = 50,
        [FromQuery(Name = "limit")] int limit = 50)
    {
        if (string.IsNullOrEmpty(userId) || !Guid.TryParse(userId, out Guid uid))
            return BadRequest();

        User? user = _users.GetUserById(uid);
        if (user is null)
            return Unauthorized();

        int rl = Math.Max(resumeLimit, 50);
        int nl = Math.Max(nextUpLimit, 50);
        int lim = limit > 0 ? limit : 50;

        // Step 1 — raw Resume (movies only)
        var resumeQuery = new InternalItemsQuery
        {
            User = user,
            IsResumable = true,
            MediaTypes = new[] { MediaType.Video },
            IncludeItemTypes = new[] { BaseItemKind.Movie },
            Limit = rl,
            Recursive = true,
            IsVirtualItem = false,
            OrderBy = new[] { (ItemSortBy.DatePlayed, SortOrder.Descending) },
        };
        List<BaseItemDto> rawMovies = GetDtos(resumeQuery, user);

        // Step 2 — raw NextUp (episodes)
        var nextUpQuery = new NextUpQuery
        {
            User = user,
            Limit = nl,
            EnableResumable = true,
            EnableRewatching = false,
        };
        QueryResult<BaseItem> nextUpResult = _tv.GetNextUp(nextUpQuery, SlimDto);
        List<BaseItemDto> rawEpisodes = _dto.GetBaseItemDtos(nextUpResult.Items, SlimDto, user, null, false).ToList();

        // Step 3 — sort key enrichment (same as FetchContinue)
        foreach (BaseItemDto ep in rawEpisodes)
        {
            if (!ep.SeriesId.HasValue || ep.SeriesId.Value == Guid.Empty || ep.UserData is null) continue;
            var playedQuery = new InternalItemsQuery
            {
                User = user,
                Recursive = true,
                IsVirtualItem = false,
                IncludeItemTypes = new[] { BaseItemKind.Episode },
                AncestorIds = new[] { ep.SeriesId.Value },
                IsPlayed = true,
                OrderBy = new[] { (ItemSortBy.DatePlayed, SortOrder.Descending) },
                Limit = 1,
            };
            QueryResult<BaseItem> playedEps = _library.GetItemsResult(playedQuery);
            if (playedEps.Items.Count > 0)
            {
                UserItemData? playedUd = _userData.GetUserData(user, playedEps.Items[0]);
                DateTime? mostRecent = playedUd?.LastPlayedDate;
                if (mostRecent.HasValue && mostRecent.Value > (ep.UserData.LastPlayedDate ?? DateTime.MinValue))
                    ep.UserData.LastPlayedDate = mostRecent.Value;
            }
        }

        // Step 4 — merge + sort
        List<BaseItemDto> merged = rawMovies.Concat(rawEpisodes).ToList();
        merged.Sort((a, b) =>
        {
            long x = a.UserData?.LastPlayedDate is DateTime da ? da.Ticks : 0L;
            long y = b.UserData?.LastPlayedDate is DateTime db ? db.Ticks : 0L;
            int cmp = y.CompareTo(x);
            if (cmp != 0) return cmp;
            bool ax = (a.UserData?.PlaybackPositionTicks ?? 0) > 0;
            bool bx = (b.UserData?.PlaybackPositionTicks ?? 0) > 0;
            if (ax == bx) return 0;
            return ax ? -1 : 1;
        });

        // Step 5 — dedup (same key logic as MergeContinue, but no mutation)
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var deduped = new List<BaseItemDto>();
        foreach (BaseItemDto it in merged)
        {
            string k = (it.SeriesId.HasValue && it.SeriesId.Value != Guid.Empty)
                ? it.SeriesId.Value.ToString("N")
                : it.Id.ToString("N");
            if (!string.IsNullOrEmpty(k) && seen.Add(k))
                deduped.Add(it);
        }

        // Step 6 — limit
        List<BaseItemDto> final = deduped.Take(lim).ToList();

        static object ToDebugEntry(BaseItemDto it) => new
        {
            id = it.Id,
            seriesId = it.SeriesId,
            name = it.Name,
            seriesName = it.SeriesName,
            episode = it.ParentIndexNumber is int s && it.IndexNumber is int ep
                ? $"S{s:D2}E{ep:D2}" : (string?)null,
            sortDate = it.UserData?.LastPlayedDate,
            positionTicks = it.UserData?.PlaybackPositionTicks ?? 0,
            type = it.Type,
        };

        Response.Headers["Cache-Control"] = "no-cache";
        return Ok(new
        {
            rawResume = rawMovies.Select(ToDebugEntry),
            rawNextUp = rawEpisodes.Select(ToDebugEntry),
            merged = merged.Select(ToDebugEntry),
            deduped = deduped.Select(ToDebugEntry),
            final = final.Select(ToDebugEntry),
            limits = new { resumeLimit = rl, nextUpLimit = nl, limit = lim },
        });
    }

    // ── B9 ───────────────────────────────────────────────────────────────────

    /// <summary>
    /// Single item as a real Jellyfin DTO. warm() in 25-prefetch.js calls this on hover to start
    /// image warming with correct tags before the detail page opens.
    /// </summary>
    [HttpGet("item/{id}")]
    public IActionResult GetItemDetail(
        [FromRoute] string id,
        [FromQuery(Name = "userId")] string? userId)
    {
        if (string.IsNullOrEmpty(id) || !Guid.TryParse(id, out Guid itemGuid))
        {
            return BadRequest();
        }

        if (string.IsNullOrEmpty(userId) || !Guid.TryParse(userId, out Guid uid))
        {
            return BadRequest();
        }

        User? user = _users.GetUserById(uid);
        if (user is null)
        {
            return Unauthorized();
        }

        BaseItem? item = _library.GetItemById(itemGuid);
        if (item is null)
        {
            return NotFound();
        }

        BaseItemDto dto = _dto.GetBaseItemDto(item, SlimDto, user, null);
        Response.Headers["Cache-Control"] = "no-cache";
        return Ok(dto);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private List<BaseItemDto> GetDtos(InternalItemsQuery query, User user)
    {
        QueryResult<BaseItem> result = _library.GetItemsResult(query);
        return _dto.GetBaseItemDtos(result.Items, SlimDto, user, null, false).ToList();
    }

    private static List<BaseItemDto> MergeContinue(List<BaseItemDto> movies, List<BaseItemDto> episodes, int limit)
    {
        List<BaseItemDto> all = movies.Concat(episodes).ToList();

        // Use Ticks for comparison — never throws regardless of DateTime.Kind.
        // On tie: in-progress (PlaybackPositionTicks > 0) wins over next-up (brief requirement).
        all.Sort((a, b) =>
        {
            long x = a.UserData?.LastPlayedDate is DateTime da ? da.Ticks : 0L;
            long y = b.UserData?.LastPlayedDate is DateTime db ? db.Ticks : 0L;
            int cmp = y.CompareTo(x);
            if (cmp != 0) return cmp;
            bool ax = (a.UserData?.PlaybackPositionTicks ?? 0) > 0;
            bool bx = (b.UserData?.PlaybackPositionTicks ?? 0) > 0;
            if (ax == bx) return 0;
            return ax ? -1 : 1;  // in-progress first
        });

        // Deduplicate: episodes use SeriesId as the key so each series appears at most once.
        // After the sort the first occurrence is always the most-recently-played card for that series.
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var output = new List<BaseItemDto>(limit);
        foreach (BaseItemDto it in all)
        {
            if (output.Count >= limit) break;
            string k = (it.SeriesId.HasValue && it.SeriesId.Value != Guid.Empty)
                ? it.SeriesId.Value.ToString("N")
                : it.Id.ToString("N");
            if (!string.IsNullOrEmpty(k) && seen.Add(k))
            {
                if (it.UserData is not null)
                {
                    it.UserData.LastPlayedDate = null;
                }

                output.Add(it);
            }
        }

        return output;
    }

    private static Guid? ParseGuid(string? s) =>
        !string.IsNullOrEmpty(s) && Guid.TryParse(s, out Guid g) ? g : (Guid?)null;

    private static BaseItemKind[] ParseTypes(string? types)
    {
        if (string.IsNullOrEmpty(types))
        {
            return Array.Empty<BaseItemKind>();
        }

        return types.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(t => Enum.TryParse<BaseItemKind>(t, true, out BaseItemKind k) ? k : (BaseItemKind?)null)
            .Where(k => k.HasValue)
            .Select(k => k!.Value)
            .ToArray();
    }

    private static void ApplySortBy(InternalItemsQuery query, HomeRowConfig row)
    {
        if (string.IsNullOrEmpty(row.SortBy)) return;

        SortOrder order = string.Equals(row.SortOrder, "Ascending", StringComparison.OrdinalIgnoreCase)
            ? SortOrder.Ascending
            : SortOrder.Descending;

        if (string.Equals(row.SortBy, "Random", StringComparison.OrdinalIgnoreCase))
        {
            query.OrderBy = new[] { (ItemSortBy.Random, SortOrder.Ascending) };
            return;
        }

        if (Enum.TryParse<ItemSortBy>(row.SortBy, true, out ItemSortBy sortBy))
        {
            query.OrderBy = new[] { (sortBy, order) };
        }
    }

    private static void Shuffle<T>(List<T> list)
    {
        var rng = new Random();
        for (int i = list.Count - 1; i > 0; i--)
        {
            int j = rng.Next(i + 1);
            (list[i], list[j]) = (list[j], list[i]);
        }
    }

    private static readonly JsonSerializerOptions JsonOpts = new JsonSerializerOptions
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    private record RowResult(string Id, List<BaseItemDto> Items);
}

// ── Row config DTO (from rows-boot.js, camelCase localStorage) ───────────────

public class HomeRowConfig
{
    [JsonPropertyName("id")]
    public string? Id { get; set; }

    [JsonPropertyName("type")]
    public string? Type { get; set; }

    [JsonPropertyName("limit")]
    public int Limit { get; set; }

    [JsonPropertyName("parentId")]
    public string? ParentId { get; set; }

    [JsonPropertyName("types")]
    public string? Types { get; set; }

    [JsonPropertyName("sortBy")]
    public string? SortBy { get; set; }

    [JsonPropertyName("sortOrder")]
    public string? SortOrder { get; set; }

    [JsonPropertyName("shuffle")]
    public bool Shuffle { get; set; }

    [JsonPropertyName("released")]
    public bool? Released { get; set; }

    [JsonPropertyName("resumeLimit")]
    public int ResumeLimit { get; set; }

    [JsonPropertyName("nextUpLimit")]
    public int NextUpLimit { get; set; }
}
