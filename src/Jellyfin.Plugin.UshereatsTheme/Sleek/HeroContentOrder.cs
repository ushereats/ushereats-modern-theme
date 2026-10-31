namespace Jellyfin.Plugin.UshereatsTheme.Sleek;

public static class HeroContentOrder
{
    private static readonly string[] ContentSources =
    [
        "ContinueWatching",
        "NextUp",
        "LatestMovies",
        "LatestShows",
        "Favorites"
    ];

    public static IReadOnlyList<string> Normalize(string? value)
    {
        var allowed = new HashSet<string>(ContentSources, StringComparer.OrdinalIgnoreCase);
        return (value ?? string.Join(',', ContentSources))
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(allowed.Contains)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Select(item => ContentSources.First(allowedItem => string.Equals(allowedItem, item, StringComparison.OrdinalIgnoreCase)))
            .ToArray();
    }
}