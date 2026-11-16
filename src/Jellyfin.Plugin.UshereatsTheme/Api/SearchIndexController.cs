using System.IO.Compression;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Jellyfin.Data.Enums;
using Jellyfin.Database.Implementations.Entities;
using Jellyfin.Database.Implementations.Enums;
using MediaBrowser.Controller.Dto;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Dto;
using MediaBrowser.Model.Entities;
using MediaBrowser.Model.Querying;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.UshereatsTheme.Api;

/// <summary>
/// Returns a compact search index of all user-accessible media so the browser can search locally.
/// </summary>
[ApiController]
[Route("UshereatsTheme")]
public class SearchIndexController : ControllerBase
{
    private const int MaxItems = 20_000;

    private static readonly DtoOptions IndexDto = new DtoOptions(false)
    {
        ImageTypeLimit = 1,
        EnableImages = true,
    };

    private readonly ILibraryManager _library;
    private readonly IUserManager _users;
    private readonly IDtoService _dto;

    public SearchIndexController(ILibraryManager library, IUserManager users, IDtoService dto)
    {
        _library = library;
        _users = users;
        _dto = dto;
    }

    /// <summary>
    /// Returns {version, items} where each item is a minimal object for local search.
    /// Response is gzip-compressed JSON. Versioned by a hash of the user's library item count + newest date.
    /// </summary>
    [HttpGet("search-index")]
    [Authorize]
    public IActionResult GetSearchIndex([FromQuery(Name = "userId")] string? userId)
    {
        string? claim = HttpContext.User.FindFirst("Jellyfin-UserId")?.Value;
        if (!Guid.TryParse(claim, out Guid uid))
            return Unauthorized();

        User? user = _users.GetUserById(uid);
        if (user is null)
            return Unauthorized();

        // Check feature switch — resolve for this user
        var cfg = Plugin.Instance?.Configuration;
        if (cfg is null) return StatusCode(503);
        var level = cfg.InstantSearch;
        if (level == Configuration.FeatureLevel.Off)
            return StatusCode(403);
        bool isAdmin = user.Permissions.Any(p => p.Kind == PermissionKind.IsAdministrator && p.Value);
        if (level == Configuration.FeatureLevel.AdminsOnly && !isAdmin)
            return StatusCode(403);

        // Movies + Shows (not episodes or music — keeps the index small but covers main search use)
        // First a cheap check (count + newest title only): when the device already has this version the answer is
        // "nothing changed" without building the whole index (that took ~1.6 s on a big library).
        var probe = new InternalItemsQuery
        {
            User = user,
            Recursive = true,
            IsVirtualItem = false,
            IncludeItemTypes = new[] { BaseItemKind.Movie, BaseItemKind.Series },
            OrderBy = new[] { (ItemSortBy.DateCreated, SortOrder.Descending) },
            Limit = 1,
            EnableTotalRecordCount = true,
        };
        QueryResult<BaseItem> head = _library.GetItemsResult(probe);
        string version = ComputeVersion(head.TotalRecordCount, head.Items.Count > 0 ? head.Items[0].DateCreated : DateTime.MinValue);
        string etag = "\"" + version + "\"";
        if (Request.Headers["If-None-Match"].ToString() == etag)
        {
            Response.Headers["ETag"] = etag;
            return StatusCode(304);
        }

        var query = new InternalItemsQuery
        {
            User = user,
            Recursive = true,
            IsVirtualItem = false,
            IncludeItemTypes = new[] { BaseItemKind.Movie, BaseItemKind.Series },
            OrderBy = new[] { (ItemSortBy.DateCreated, SortOrder.Descending) },
            Limit = MaxItems,
        };

        QueryResult<BaseItem> result = _library.GetItemsResult(query);

        // Also get people (Person items): query separately and append
        var personQuery = new InternalItemsQuery
        {
            User = user,
            Recursive = true,
            IsVirtualItem = false,
            IncludeItemTypes = new[] { BaseItemKind.Person },
            OrderBy = new[] { (ItemSortBy.SortName, SortOrder.Ascending) },
            Limit = 2000,
        };
        QueryResult<BaseItem> personResult = _library.GetItemsResult(personQuery);

        var items = new List<SearchIndexItem>(result.Items.Count + personResult.Items.Count);
        foreach (BaseItemDto dto in _dto.GetBaseItemDtos(result.Items, IndexDto, user, null, true))
        {
            items.Add(ToIndexItem(dto));
        }
        foreach (BaseItemDto dto in _dto.GetBaseItemDtos(personResult.Items, IndexDto, user, null, true))
        {
            items.Add(ToIndexItem(dto));
        }

        string json = JsonSerializer.Serialize(new SearchIndexPayload { Version = version, Items = items }, JsonOpts);
        byte[] compressed = GzipCompress(Encoding.UTF8.GetBytes(json));

        Response.Headers["Content-Encoding"] = "gzip";
        Response.Headers["Cache-Control"] = "no-cache";
        Response.Headers["ETag"] = etag;
        return File(compressed, "application/json; charset=utf-8");
    }

    private static SearchIndexItem ToIndexItem(BaseItemDto dto)
    {
        return new SearchIndexItem
        {
            Id = dto.Id.ToString("N"),
            Name = dto.Name ?? string.Empty,
            OriginalTitle = dto.OriginalTitle,
            SortName = dto.SortName,
            Type = dto.Type.ToString(),
            Year = dto.ProductionYear,
            Primary = dto.ImageTags != null && dto.ImageTags.TryGetValue(ImageType.Primary, out var p) ? p : null,
            Thumb = dto.ImageTags != null && dto.ImageTags.TryGetValue(ImageType.Thumb, out var th) ? th : null,
        };
    }

    private static string ComputeVersion(int count, DateTime newest)
        => $"{count}-{newest.Ticks / TimeSpan.TicksPerMinute}";

    private static byte[] GzipCompress(byte[] data)
    {
        using var ms = new MemoryStream();
        using (var gz = new GZipStream(ms, CompressionLevel.Optimal))
        {
            gz.Write(data, 0, data.Length);
        }
        return ms.ToArray();
    }

    private static readonly JsonSerializerOptions JsonOpts = new JsonSerializerOptions
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };
}

public class SearchIndexPayload
{
    public string Version { get; set; } = string.Empty;
    public List<SearchIndexItem> Items { get; set; } = new();
}

public class SearchIndexItem
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? OriginalTitle { get; set; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? SortName { get; set; }
    public string Type { get; set; } = string.Empty;
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? Year { get; set; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Primary { get; set; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Thumb { get; set; }
}
