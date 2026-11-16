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
[Authorize]
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

    // The signed-in user, from the access token (never from the query string: a userId in the address
    // would let anyone read another user's watch history).
    private Guid? SignedInUserId()
    {
        string? v = HttpContext.User.FindFirst("Jellyfin-UserId")?.Value;
        return Guid.TryParse(v, out Guid g) ? g : null;
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
        if (SignedInUserId() is not Guid uid)
        {
            return Unauthorized();
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
            if (t.Result.Items is not null)
            {
                result[t.Result.Id] = t.Result.Items;
            }
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
            return new RowResult(id, null);
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

    // ── Continue Watching & Next Up: one set of rules (the debug view shows the same steps) ─────────
    // 1. Resume: everything you're part-way through (films AND episodes), like Jellyfin's Continue Watching.
    // 2. Next Up: the next episode of each show you're watching (Jellyfin's own Next Up, without part-watched ones).
    // 3. Each entry's "last watched": its own date for part-watched ones; for a next episode, the last time you
    //    watched anything from that show.
    // 4. Newest first (on a tie the part-watched one first, then Jellyfin's own order), one card per show.
    private sealed class ContinueEntry
    {
        public ContinueEntry(BaseItemDto dto, DateTime? date, bool resume, int index)
        {
            Dto = dto;
            Date = date;
            Resume = resume;
            Index = index;
        }

        public BaseItemDto Dto { get; }

        public DateTime? Date { get; }

        public bool Resume { get; }

        public int Index { get; }
    }

    private sealed class ContinueSteps
    {
        public List<ContinueEntry> Resume { get; } = new List<ContinueEntry>();

        public List<ContinueEntry> NextUp { get; } = new List<ContinueEntry>();

        public List<ContinueEntry> Final { get; } = new List<ContinueEntry>();
    }

    private static string ShowKey(BaseItemDto it) =>
        it.SeriesId.HasValue && it.SeriesId.Value != Guid.Empty ? it.SeriesId.Value.ToString("N") : it.Id.ToString("N");

    private ContinueSteps BuildContinue(User user, int limit)
    {
        var steps = new ContinueSteps();

        var resumeQuery = new InternalItemsQuery
        {
            User = user,
            IsResumable = true,
            MediaTypes = new[] { MediaType.Video },
            IncludeItemTypes = new[] { BaseItemKind.Movie, BaseItemKind.Episode },
            Limit = 60,
            Recursive = true,
            IsVirtualItem = false,
            OrderBy = new[] { (ItemSortBy.DatePlayed, SortOrder.Descending) },
        };
        int i = 0;
        foreach (BaseItemDto dto in GetDtos(resumeQuery, user))
        {
            steps.Resume.Add(new ContinueEntry(dto, dto.UserData?.LastPlayedDate, true, i++));
        }

        // the latest part-watched date per show (counts as watching that show too)
        var showLast = new Dictionary<string, DateTime>(StringComparer.Ordinal);
        foreach (ContinueEntry e in steps.Resume)
        {
            if (e.Date is DateTime d && e.Dto.SeriesId.HasValue && e.Dto.SeriesId.Value != Guid.Empty)
            {
                string k = ShowKey(e.Dto);
                if (!showLast.TryGetValue(k, out DateTime had) || d > had)
                {
                    showLast[k] = d;
                }
            }
        }

        var nextUpQuery = new NextUpQuery
        {
            User = user,
            Limit = 60,
            EnableResumable = false,
            EnableRewatching = false,
        };
        QueryResult<BaseItem> nextUpResult = _tv.GetNextUp(nextUpQuery, SlimDto);
        List<BaseItemDto> nextDtos = _dto.GetBaseItemDtos(nextUpResult.Items, SlimDto, user, null, false).ToList();

        // when you last watched each of those shows: ONE lookup for all of them (newest first, so the first
        // episode seen per show is its latest), instead of one lookup per show
        var seriesIds = nextDtos.Where(e => e.SeriesId.HasValue && e.SeriesId.Value != Guid.Empty).Select(e => e.SeriesId!.Value).Distinct().ToArray();
        var lastPlayed = new Dictionary<string, DateTime>(StringComparer.Ordinal);
        if (seriesIds.Length > 0)
        {
            var playedQuery = new InternalItemsQuery
            {
                User = user,
                Recursive = true,
                IsVirtualItem = false,
                IncludeItemTypes = new[] { BaseItemKind.Episode },
                AncestorIds = seriesIds,
                IsPlayed = true,
                OrderBy = new[] { (ItemSortBy.DatePlayed, SortOrder.Descending) },
                Limit = 1000,
            };
            foreach (BaseItem played in _library.GetItemsResult(playedQuery).Items)
            {
                if (played is not MediaBrowser.Controller.Entities.TV.Episode pe || pe.SeriesId == Guid.Empty)
                {
                    continue;
                }

                string k = pe.SeriesId.ToString("N");
                if (lastPlayed.ContainsKey(k))
                {
                    continue;
                }

                DateTime? when = _userData.GetUserData(user, played)?.LastPlayedDate;
                if (when.HasValue)
                {
                    lastPlayed[k] = when.Value;
                }

                if (lastPlayed.Count == seriesIds.Length)
                {
                    break;
                }
            }
        }

        // episodes this person removed from the row with the ✕ (until they watch further)
        HashSet<string> hidden = ContinueHidden.For(user.Id);
        i = 0;
        foreach (BaseItemDto ep in nextDtos)
        {
            if (hidden.Contains(ep.Id.ToString("N")))
            {
                continue;
            }

            DateTime? date = null;
            if (ep.SeriesId.HasValue && ep.SeriesId.Value != Guid.Empty)
            {
                string k = ShowKey(ep);
                if (lastPlayed.TryGetValue(k, out DateTime full))
                {
                    date = full;
                }

                if (showLast.TryGetValue(k, out DateTime partly) && (date is null || partly > date.Value))
                {
                    date = partly;
                }
            }

            steps.NextUp.Add(new ContinueEntry(ep, date, false, i++));
        }

        IEnumerable<ContinueEntry> sorted = steps.Resume.Concat(steps.NextUp)
            .OrderByDescending(e => e.Date.HasValue ? e.Date.Value.Ticks : 0L)
            .ThenBy(e => e.Resume ? 0 : 1)
            .ThenBy(e => e.Index);
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (ContinueEntry e in sorted)
        {
            if (steps.Final.Count >= limit)
            {
                break;
            }

            if (seen.Add(ShowKey(e.Dto)))
            {
                steps.Final.Add(e);
            }
        }

        return steps;
    }

    private List<BaseItemDto> FetchContinue(HomeRowConfig row, User user)
    {
        // never fewer than 40: everything you're watching should be there
        int limit = Math.Min(60, Math.Max(row.Limit, 40));
        ContinueSteps steps;
        try
        {
            steps = BuildContinue(user, limit);
        }
        catch
        {
            // a busy moment on the server: once more before giving up (an empty answer made the page use
            // a different, older way of building this row)
            steps = BuildContinue(user, limit);
        }

        var output = new List<BaseItemDto>(steps.Final.Count);
        foreach (ContinueEntry e in steps.Final)
        {
            if (e.Dto.UserData is not null)
            {
                e.Dto.UserData.LastPlayedDate = null;
            }

            output.Add(e.Dto);
        }

        return output;
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

    // ── Continue Watching: removing a card ───────────────────────────────────

    /// <summary>
    /// Removes a Next Up episode from the signed-in user's Continue Watching row (the ✕ on a card).
    /// Part-watched items are also cleared by the client (their position is reset in Jellyfin itself).
    /// </summary>
    [HttpPost("continue/hide")]
    public IActionResult HideFromContinue([FromQuery(Name = "itemId")] string? itemId)
    {
        if (SignedInUserId() is not Guid uid)
        {
            return Unauthorized();
        }

        if (!Guid.TryParse(itemId, out Guid item) || item == Guid.Empty)
        {
            return BadRequest();
        }

        ContinueHidden.Add(uid, item);
        return NoContent();
    }

    /// <summary>The episode ids the signed-in user removed (for the browser's own fallback version of the row).</summary>
    [HttpGet("continue/hidden")]
    public IActionResult HiddenFromContinue()
    {
        if (SignedInUserId() is not Guid uid)
        {
            return Unauthorized();
        }

        Response.Headers["Cache-Control"] = "no-cache";
        return Ok(new { ids = ContinueHidden.For(uid) });
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
        if (SignedInUserId() is not Guid uid)
            return Unauthorized();

        User? user = _users.GetUserById(uid);
        if (user is null)
            return Unauthorized();

        ContinueSteps steps = BuildContinue(user, limit > 0 ? limit : 50);

        static object Entry(ContinueEntry e) => new
        {
            id = e.Dto.Id,
            seriesId = e.Dto.SeriesId,
            name = e.Dto.Name,
            seriesName = e.Dto.SeriesName,
            episode = e.Dto.ParentIndexNumber is int sn && e.Dto.IndexNumber is int en ? $"S{sn:D2}E{en:D2}" : (string?)null,
            sortDate = e.Date,
            positionTicks = e.Dto.UserData?.PlaybackPositionTicks ?? 0,
            partWatched = e.Resume,
        };

        Response.Headers["Cache-Control"] = "no-cache";
        return Ok(new
        {
            rawResume = steps.Resume.Select(Entry),
            rawNextUp = steps.NextUp.Select(Entry),
            merged = steps.Resume.Concat(steps.NextUp).Select(Entry),
            deduped = steps.Final.Select(Entry),
            final = steps.Final.Select(Entry),
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

        if (SignedInUserId() is not Guid uid)
        {
            return Unauthorized();
        }

        User? user = _users.GetUserById(uid);
        if (user is null)
        {
            return Unauthorized();
        }

        BaseItem? item = _library.GetItemById(itemGuid);
        if (item is null || !item.IsVisible(user))
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

    private record RowResult(string Id, List<BaseItemDto>? Items);
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
