using System.Text.Json;
using System.Text.Json.Serialization;
using Jellyfin.Data.Enums;
using Jellyfin.Database.Implementations.Entities;
using Jellyfin.Database.Implementations.Enums;
using MediaBrowser.Controller.Dto;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.TV;
using MediaBrowser.Model.Entities;
using MediaBrowser.Model.Querying;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.UshereatsTheme.Api;

/// <summary>
/// B8: aggregate all home rows in one round-trip.
/// B9: aggregate item details (item + related) in one round-trip.
/// </summary>
[ApiController]
[AllowAnonymous]
[Route("UshereatsTheme")]
public class HomeController : ControllerBase
{
    private static readonly JsonSerializerOptions JsonOpts = new JsonSerializerOptions
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    private static readonly DtoOptions SlimDto = new DtoOptions(false)
    {
        ImageTypeLimit = 1,
        EnableImages = true,
        Fields = new[] { ItemFields.PrimaryImageAspectRatio },
    };

    private readonly ILibraryManager _library;
    private readonly IUserManager _users;
    private readonly IUserDataManager _userData;
    private readonly ITVSeriesManager _tv;

    public HomeController(
        ILibraryManager library,
        IUserManager users,
        IUserDataManager userData,
        ITVSeriesManager tv)
    {
        _library = library;
        _users = users;
        _userData = userData;
        _tv = tv;
    }

    // ── B8 ───────────────────────────────────────────────────────────────────

    /// <summary>
    /// All home rows in one request. rows-boot.js calls this before falling back to individual /Items? calls.
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
            return Content("{}", "application/json; charset=utf-8");
        }

        // Run all row queries in parallel, skipping studio rows (they're static, no server call needed).
        Task<RowResult>[] tasks = rowList
            .Where(r => !string.Equals(r.Type, "studios", StringComparison.Ordinal))
            .Select(r => Task.Run(() => FetchRow(r, user)))
            .ToArray();

        await Task.WhenAll(tasks).ConfigureAwait(false);

        var result = new Dictionary<string, List<HomeItemDto>>();
        foreach (Task<RowResult> t in tasks)
        {
            result[t.Result.Id] = t.Result.Items;
        }

        Response.Headers["Cache-Control"] = "no-cache";
        return Content(JsonSerializer.Serialize(result, JsonOpts), "application/json; charset=utf-8");
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
            return new RowResult(id, new List<HomeItemDto>());
        }
    }

    private List<HomeItemDto> FetchRowItems(HomeRowConfig row, User user)
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

        // "latest" and generic rows both use GetItemsResult
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

        if (string.Equals(row.Type, "latest", StringComparison.Ordinal))
        {
            query.OrderBy = new[] { (ItemSortBy.DateCreated, SortOrder.Descending) };
        }
        else
        {
            ApplySortBy(query, row);
            if (row.Released == true)
            {
                query.MaxPremiereDate = DateTime.UtcNow;
            }
        }

        List<HomeItemDto> items = GetItemsResult(query, user);
        if (row.Shuffle)
        {
            Shuffle(items);
        }

        return items;
    }

    private List<HomeItemDto> FetchContinue(HomeRowConfig row, User user)
    {
        int resumeLimit = row.ResumeLimit > 0 ? row.ResumeLimit : 12;
        int nextUpLimit = row.NextUpLimit > 0 ? row.NextUpLimit : 24;
        int limit = row.Limit > 0 ? row.Limit : 16;

        // Resume: partially-watched movies
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
        List<HomeItemDto> movies = GetItemsResult(resumeQuery, user);

        // Next-Up: next unwatched episode per series
        var nextUpQuery = new NextUpQuery
        {
            User = user,
            Limit = nextUpLimit,
            EnableResumable = true,
            EnableRewatching = false,
        };
        QueryResult<BaseItem> nextUpResult = _tv.GetNextUp(nextUpQuery, SlimDto);
        List<HomeItemDto> episodes = nextUpResult.Items
            .Select(it => ToSlimItem(it, user))
            .ToList();

        return MergeContinue(movies, episodes, limit);
    }

    private List<HomeItemDto> FetchTrending(HomeRowConfig row, User user, int limit)
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
            return new List<HomeItemDto>();
        }

        var query = new InternalItemsQuery
        {
            User = user,
            ItemIds = ids.Select(i => Guid.TryParse(i, out Guid g) ? g : Guid.Empty).Where(g => g != Guid.Empty).ToArray(),
            Limit = limit + 10,
        };
        Dictionary<string, HomeItemDto> byId = GetItemsResult(query, user)
            .ToDictionary(x => x.Id ?? string.Empty, x => x);

        // Preserve TMDB's order
        List<HomeItemDto> ordered = new List<HomeItemDto>();
        foreach (string id in ids)
        {
            if (ordered.Count >= limit)
            {
                break;
            }

            if (byId.TryGetValue(id, out HomeItemDto? item))
            {
                ordered.Add(item);
            }
        }

        return ordered;
    }

    // ── B9 ───────────────────────────────────────────────────────────────────

    /// <summary>
    /// Item + similar in one request. warm() in 25-prefetch.js calls this on hover.
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

        HomeItemDto main = ToSlimItem(item, user);

        // Similar items: same kind + at least one shared genre, excluding the item itself (best-effort)
        List<HomeItemDto> similar = new List<HomeItemDto>();
        try
        {
            var simQuery = new InternalItemsQuery
            {
                User = user,
                Limit = 24,
                Recursive = true,
                IsVirtualItem = false,
                IncludeItemTypes = new[] { item.GetBaseItemKind() },
                ExcludeItemIds = new[] { item.Id },
                OrderBy = new[] { (ItemSortBy.Random, SortOrder.Ascending) },
            };
            string[] genres = item.Genres;
            if (genres.Length > 0)
            {
                simQuery.Genres = genres;
                simQuery.Limit = 12;
            }

            QueryResult<BaseItem> sim = _library.GetItemsResult(simQuery);
            similar = sim.Items.Select(i => ToSlimItem(i, user)).ToList();
        }
        catch
        {
            // ignore
        }

        var response = new { item = main, similar };
        Response.Headers["Cache-Control"] = "no-cache";
        return Content(JsonSerializer.Serialize(response, JsonOpts), "application/json; charset=utf-8");
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private List<HomeItemDto> GetItemsResult(InternalItemsQuery query, User user)
    {
        QueryResult<BaseItem> result = _library.GetItemsResult(query);
        return result.Items.Select(it => ToSlimItem(it, user)).ToList();
    }

    private HomeItemDto ToSlimItem(BaseItem it, User user)
    {
        var dto = new HomeItemDto
        {
            Id = it.Id.ToString("N"),
            Name = it.Name,
            Type = it.GetBaseItemKind().ToString(),
            IsFolder = it is Folder,
        };

        // Optional scalar fields
        if (it.MediaType != MediaType.Unknown)
        {
            dto.MediaType = it.MediaType.ToString();
        }

        if (it.ProductionYear.HasValue)
        {
            dto.ProductionYear = it.ProductionYear;
        }

        if (it.RunTimeTicks.HasValue)
        {
            dto.RunTimeTicks = it.RunTimeTicks;
        }

        if (it.PremiereDate.HasValue)
        {
            dto.PremiereDate = it.PremiereDate;
        }

        if (it.EndDate.HasValue)
        {
            dto.EndDate = it.EndDate;
        }

        if (it.ParentIndexNumber.HasValue)
        {
            dto.ParentIndexNumber = it.ParentIndexNumber;
        }

        if (it.IndexNumber.HasValue)
        {
            dto.IndexNumber = it.IndexNumber;
        }

        if (!string.IsNullOrEmpty(it.Name) && it is MediaBrowser.Controller.Entities.TV.Series s)
        {
            dto.Status = s.Status?.ToString();
        }

        if (it is MediaBrowser.Controller.Entities.TV.Episode ep)
        {
            dto.SeriesId = ep.SeriesId.ToString("N");
            dto.SeriesName = ep.SeriesName;

            // parent series images for backdrop warm-up
            BaseItem? series = _library.GetItemById(ep.SeriesId);
            if (series is not null)
            {
                ItemImageInfo? si = series.GetImages(ImageType.Primary).FirstOrDefault();
                if (si is not null)
                {
                    dto.SeriesPrimaryImageTag = si.DateModified.Ticks.ToString("x8");
                }

                ItemImageInfo? bi = series.GetImages(ImageType.Backdrop).FirstOrDefault();
                if (bi is not null)
                {
                    dto.ParentBackdropItemId = ep.SeriesId.ToString("N");
                    dto.ParentBackdropImageTags = new[] { bi.DateModified.Ticks.ToString("x8") };
                }
            }

            // parent thumb (season poster) fallback
            BaseItem? season = ep.Season;
            if (season is not null)
            {
                ItemImageInfo? ti = season.GetImages(ImageType.Thumb).FirstOrDefault()
                    ?? season.GetImages(ImageType.Primary).FirstOrDefault();
                if (ti is not null)
                {
                    dto.ParentThumbItemId = season.Id.ToString("N");
                    dto.ParentThumbImageTag = ti.DateModified.Ticks.ToString("x8");
                }
            }
        }

        // Image tags
        var imageTags = new Dictionary<string, string>(2);
        ItemImageInfo? primaryImg = it.GetImages(ImageType.Primary).FirstOrDefault();
        if (primaryImg is not null)
        {
            imageTags["Primary"] = primaryImg.DateModified.Ticks.ToString("x8");
        }

        ItemImageInfo? thumbImg = it.GetImages(ImageType.Thumb).FirstOrDefault();
        if (thumbImg is not null)
        {
            imageTags["Thumb"] = thumbImg.DateModified.Ticks.ToString("x8");
        }

        if (imageTags.Count > 0)
        {
            dto.ImageTags = imageTags;
        }

        ItemImageInfo? backdropImg = it.GetImages(ImageType.Backdrop).FirstOrDefault();
        if (backdropImg is not null)
        {
            dto.BackdropImageTags = new[] { backdropImg.DateModified.Ticks.ToString("x8") };
        }

        // User data
        try
        {
            UserItemData? ud = _userData.GetUserData(user, it);
            if (ud is not null)
            {
                var uDto = new HomeUserDataDto();
                bool hasData = false;

                if (ud.PlaybackPositionTicks > 0)
                {
                    uDto.PlaybackPositionTicks = ud.PlaybackPositionTicks;
                    hasData = true;

                    if (it.RunTimeTicks is > 0)
                    {
                        double pct = (double)ud.PlaybackPositionTicks / it.RunTimeTicks.Value * 100.0;
                        uDto.PlayedPercentage = Math.Round(pct * 10) / 10;
                    }
                }

                if (ud.Played)
                {
                    uDto.Played = true;
                    hasData = true;
                }

                if (ud.IsFavorite)
                {
                    uDto.IsFavorite = true;
                    hasData = true;
                }

                if (ud.LastPlayedDate.HasValue)
                {
                    uDto.LastPlayedDate = ud.LastPlayedDate;
                    hasData = true;
                }

                if (hasData)
                {
                    dto.UserData = uDto;
                }
            }
        }
        catch
        {
            // user data is optional; ignore errors
        }

        return dto;
    }

    // Replicates rows-boot.js mergeContinue: movies + next-up episodes, sorted by LastPlayedDate, deduplicated
    private static List<HomeItemDto> MergeContinue(List<HomeItemDto> movies, List<HomeItemDto> episodes, int limit)
    {
        // Forward LastPlayedDate from later episodes to earlier ones (matches JS logic)
        for (int i = episodes.Count - 1; i >= 0; i--)
        {
            HomeUserDataDto? ud = episodes[i].UserData;
            if (ud?.LastPlayedDate is null)
            {
                for (int j = i + 1; j < episodes.Count; j++)
                {
                    if (episodes[j].UserData?.LastPlayedDate is not null)
                    {
                        ud ??= new HomeUserDataDto();
                        ud.LastPlayedDate = episodes[j].UserData!.LastPlayedDate;
                        episodes[i].UserData = ud;
                        break;
                    }
                }
            }
        }

        List<HomeItemDto> all = movies.Concat(episodes).ToList();
        all.Sort((a, b) =>
        {
            long x = a.UserData?.LastPlayedDate is DateTimeOffset da ? da.ToUnixTimeMilliseconds() : 0;
            long y = b.UserData?.LastPlayedDate is DateTimeOffset db ? db.ToUnixTimeMilliseconds() : 0;
            return y.CompareTo(x);
        });

        var seen = new HashSet<string>(StringComparer.Ordinal);
        var out2 = new List<HomeItemDto>(limit);
        foreach (HomeItemDto item in all)
        {
            if (out2.Count >= limit)
            {
                break;
            }

            string key = item.Id ?? string.Empty;
            if (seen.Add(key))
            {
                // Clear the forwarded LastPlayedDate (matches JS: `delete all[n].UserData.LastPlayedDate`)
                if (item.UserData is not null)
                {
                    item.UserData.LastPlayedDate = null;
                }

                out2.Add(item);
            }
        }

        return out2;
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
        if (string.IsNullOrEmpty(row.SortBy))
        {
            return;
        }

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

    private record RowResult(string Id, List<HomeItemDto> Items);
}

// ── DTOs ─────────────────────────────────────────────────────────────────────

/// <summary>Row config from rows-boot.js (camelCase from JS localStorage).</summary>
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

/// <summary>Slim item matching the shape slim() in rows-boot.js produces from Jellyfin's /Items response.</summary>
public class HomeItemDto
{
    [JsonPropertyName("Id")]
    public string? Id { get; set; }

    [JsonPropertyName("Name")]
    public string? Name { get; set; }

    [JsonPropertyName("Type")]
    public string? Type { get; set; }

    [JsonPropertyName("IsFolder")]
    public bool IsFolder { get; set; }

    [JsonPropertyName("MediaType")]
    public string? MediaType { get; set; }

    [JsonPropertyName("ProductionYear")]
    public int? ProductionYear { get; set; }

    [JsonPropertyName("RunTimeTicks")]
    public long? RunTimeTicks { get; set; }

    [JsonPropertyName("PremiereDate")]
    public DateTimeOffset? PremiereDate { get; set; }

    [JsonPropertyName("EndDate")]
    public DateTimeOffset? EndDate { get; set; }

    [JsonPropertyName("Status")]
    public string? Status { get; set; }

    [JsonPropertyName("ParentIndexNumber")]
    public int? ParentIndexNumber { get; set; }

    [JsonPropertyName("IndexNumber")]
    public int? IndexNumber { get; set; }

    [JsonPropertyName("SeriesId")]
    public string? SeriesId { get; set; }

    [JsonPropertyName("SeriesName")]
    public string? SeriesName { get; set; }

    [JsonPropertyName("SeriesPrimaryImageTag")]
    public string? SeriesPrimaryImageTag { get; set; }

    [JsonPropertyName("ParentBackdropItemId")]
    public string? ParentBackdropItemId { get; set; }

    [JsonPropertyName("ParentBackdropImageTags")]
    public string[]? ParentBackdropImageTags { get; set; }

    [JsonPropertyName("ParentThumbItemId")]
    public string? ParentThumbItemId { get; set; }

    [JsonPropertyName("ParentThumbImageTag")]
    public string? ParentThumbImageTag { get; set; }

    [JsonPropertyName("ImageTags")]
    public Dictionary<string, string>? ImageTags { get; set; }

    [JsonPropertyName("BackdropImageTags")]
    public string[]? BackdropImageTags { get; set; }

    [JsonPropertyName("UserData")]
    public HomeUserDataDto? UserData { get; set; }
}

public class HomeUserDataDto
{
    [JsonPropertyName("PlayedPercentage")]
    public double? PlayedPercentage { get; set; }

    [JsonPropertyName("PlaybackPositionTicks")]
    public long? PlaybackPositionTicks { get; set; }

    [JsonPropertyName("Played")]
    public bool? Played { get; set; }

    [JsonPropertyName("UnplayedItemCount")]
    public int? UnplayedItemCount { get; set; }

    [JsonPropertyName("IsFavorite")]
    public bool? IsFavorite { get; set; }

    [JsonPropertyName("LastPlayedDate")]
    public DateTimeOffset? LastPlayedDate { get; set; }
}
