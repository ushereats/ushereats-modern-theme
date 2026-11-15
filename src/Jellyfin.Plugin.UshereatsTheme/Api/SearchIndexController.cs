using System.IO.Compression;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Jellyfin.Data.Enums;
using Jellyfin.Database.Implementations.Entities;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
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

    private readonly ILibraryManager _library;
    private readonly IUserManager _users;

    public SearchIndexController(ILibraryManager library, IUserManager users)
    {
        _library = library;
        _users = users;
    }

    /// <summary>
    /// Returns {version, items} where each item is a minimal object for local search.
    /// Response is gzip-compressed JSON. Versioned by a hash of the user's library item count + newest date.
    /// </summary>
    [HttpGet("search-index")]
    [Authorize]
    public IActionResult GetSearchIndex([FromQuery(Name = "userId")] string? userId)
    {
        if (string.IsNullOrEmpty(userId) || !Guid.TryParse(userId, out Guid uid))
            return BadRequest();

        User? user = _users.GetUserById(uid);
        if (user is null)
            return Unauthorized();

        // Check feature switch — resolve for this user
        var cfg = Plugin.Instance?.Configuration;
        if (cfg is null) return StatusCode(503);
        var level = cfg.InstantSearch;
        if (level == Configuration.FeatureLevel.Off)
            return StatusCode(403);
        if (level == Configuration.FeatureLevel.AdminsOnly && !user.HasPermission(Jellyfin.Data.Enums.PermissionKind.IsAdministrator))
            return StatusCode(403);

        // Movies + Shows (not episodes or music — keeps the index small but covers main search use)
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

        string version = ComputeVersion(result.TotalRecordCount, result.Items.Length > 0 ? result.Items[0].DateCreated : DateTime.MinValue);

        // Check ETag: if client already has this version, return 304
        string etag = "\"" + version + "\"";
        if (Request.Headers["If-None-Match"].ToString() == etag)
        {
            Response.Headers["ETag"] = etag;
            return StatusCode(304);
        }

        var items = new List<SearchIndexItem>(result.Items.Length + personResult.Items.Length);
        foreach (BaseItem it in result.Items)
        {
            items.Add(ToIndexItem(it));
        }
        foreach (BaseItem it in personResult.Items)
        {
            items.Add(ToIndexItem(it));
        }

        string json = JsonSerializer.Serialize(new SearchIndexPayload { Version = version, Items = items }, JsonOpts);
        byte[] compressed = GzipCompress(Encoding.UTF8.GetBytes(json));

        Response.Headers["Content-Encoding"] = "gzip";
        Response.Headers["Cache-Control"] = "no-cache";
        Response.Headers["ETag"] = etag;
        return File(compressed, "application/json; charset=utf-8");
    }

    private static SearchIndexItem ToIndexItem(BaseItem it)
    {
        string? primaryTag = it.ImageInfos
            .FirstOrDefault(i => i.Type == ImageType.Primary)?.Tag;
        string? thumbTag = it.ImageInfos
            .FirstOrDefault(i => i.Type == ImageType.Thumb)?.Tag;

        return new SearchIndexItem
        {
            Id = it.Id.ToString("N"),
            Name = it.Name,
            OriginalTitle = it is MediaBrowser.Controller.Entities.Movies.Movie m ? m.OriginalTitle : null,
            SortName = it.SortName,
            Type = it.GetType().Name,
            Year = it.ProductionYear,
            Primary = primaryTag,
            Thumb = thumbTag,
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
