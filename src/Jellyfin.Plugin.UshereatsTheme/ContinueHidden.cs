using System.Text.Json;

namespace Jellyfin.Plugin.UshereatsTheme;

/// <summary>
/// Next Up episodes each person removed from their Continue Watching row (the ✕ on a card).
/// Jellyfin has no "hide from Next Up" of its own, so the list is kept here, per user, by episode:
/// once you watch further, the show's next episode is a different one and the show comes back on its own.
/// Saved in the plugin's data folder (continue-hidden.json).
/// </summary>
internal static class ContinueHidden
{
    private const int MaxPerUser = 500;
    private static readonly object Gate = new object();
    private static Dictionary<string, Dictionary<string, long>>? s_data;

    private static string? FilePath()
    {
        string? dir = Plugin.Instance?.DataFolderPath;
        return string.IsNullOrEmpty(dir) ? null : Path.Combine(dir, "continue-hidden.json");
    }

    private static Dictionary<string, Dictionary<string, long>> Load()
    {
        if (s_data != null)
        {
            return s_data;
        }

        try
        {
            string? path = FilePath();
            if (path != null && File.Exists(path))
            {
                s_data = JsonSerializer.Deserialize<Dictionary<string, Dictionary<string, long>>>(File.ReadAllText(path));
            }
        }
        catch (Exception)
        {
            s_data = null;
        }

        s_data ??= new Dictionary<string, Dictionary<string, long>>(StringComparer.Ordinal);
        return s_data;
    }

    private static void Save()
    {
        try
        {
            string? path = FilePath();
            if (path == null || s_data == null)
            {
                return;
            }

            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            string tmp = path + ".tmp";
            File.WriteAllText(tmp, JsonSerializer.Serialize(s_data));
            File.Move(tmp, path, true);
        }
        catch (Exception)
        {
            // best effort: the hide still works until the server restarts
        }
    }

    /// <summary>The episode ids (no dashes) this user removed.</summary>
    public static HashSet<string> For(Guid user)
    {
        lock (Gate)
        {
            return Load().TryGetValue(user.ToString("N"), out Dictionary<string, long>? ids)
                ? new HashSet<string>(ids.Keys, StringComparer.Ordinal)
                : new HashSet<string>(StringComparer.Ordinal);
        }
    }

    public static void Add(Guid user, Guid item)
    {
        lock (Gate)
        {
            var data = Load();
            string key = user.ToString("N");
            if (!data.TryGetValue(key, out Dictionary<string, long>? ids))
            {
                ids = new Dictionary<string, long>(StringComparer.Ordinal);
                data[key] = ids;
            }

            ids[item.ToString("N")] = DateTime.UtcNow.Ticks;
            if (ids.Count > MaxPerUser)
            {
                foreach (string old in ids.OrderBy(kv => kv.Value).Take(ids.Count - MaxPerUser).Select(kv => kv.Key).ToList())
                {
                    ids.Remove(old);
                }
            }

            Save();
        }
    }
}
