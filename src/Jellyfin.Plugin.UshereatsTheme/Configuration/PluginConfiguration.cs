using Jellyfin.Plugin.UshereatsTheme.Sleek;
using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.UshereatsTheme.Configuration;

/// <summary>
/// Settings shown on the plugin page. Everything is sent to the browser as window.TB_CONFIG.
/// </summary>
public class PluginConfiguration : BasePluginConfiguration
{
    /// <summary>Accent colour for the whole UI (#rrggbb). Empty = SleekFin's saved colour on first start.</summary>
    public string AccentColor { get; set; } = string.Empty;

    // ── Features (each one is only downloaded when switched on) ──
    public bool LibraryStats { get; set; } = true;
    public bool WelcomeSplash { get; set; } = true;
    public bool TimeRemaining { get; set; } = true;
    public bool MarkSections { get; set; } = true;
    public bool ReleaseDates { get; set; } = true;
    public bool QualityBadges { get; set; } = true;
    public bool NewEpisodeTags { get; set; } = true;
    public bool SearchRestyle { get; set; } = true;
    public bool AmbientBackground { get; set; } = true;
    public bool HoverCards { get; set; } = true;
    public bool PlayerSkin { get; set; } = true;
    public bool LoginExtras { get; set; } = true;
    public bool PauseScreen { get; set; } = true;
    public bool DashboardSkin { get; set; } = true;

    /// <summary>"Now Playing" panel on the dashboard home (replaces the PlayInfo plugin).</summary>
    public bool NowPlaying { get; set; } = true;

    /// <summary>Instant home hero (replaces SleekFin's hero; switch SleekFin's hero off).</summary>
    public bool Hero { get; set; } = true;

    /// <summary>Home rows set below (replaces KefinTweaks' Enhanced Home Screen and Jellyfin's own rows).</summary>
    public bool HomeRows { get; set; } = true;

    /// <summary>Search as you type with type chips (replaces KefinTweaks' Enhanced Search).</summary>
    public bool Search { get; set; } = true;

    /// <summary>The home rows, in order (JSON, edited on the plugin page). One layout for everyone.</summary>
    public string HomeRowsJson { get; set; } = DefaultHomeRows;

    public const string DefaultHomeRows = "[{\"id\":\"studios\",\"on\":true,\"title\":\"Browse by Studio\",\"type\":\"studios\",\"shuffle\":true,\"items\":[{\"name\":\"AMC\",\"id\":\"072771d94e42aaf0e27a71f474a6482f\",\"logo\":\"AMC\"},{\"name\":\"Apple TV\",\"id\":\"865e87e3544b4bcd5f1fcd3f7b8358e8\",\"logo\":\"Apple_TV\"},{\"name\":\"Columbia Pictures\",\"id\":\"3e8c9b438ab4664dc15b8cdbfce57134\",\"logo\":\"Columbia_Pictures\"},{\"name\":\"Disney+\",\"id\":\"20d264313828d2206d85c42b68e2f024\",\"logo\":\"Disney+\"},{\"name\":\"FX\",\"id\":\"689ac7d1eea98cdc45ec3d569dbef8c8\",\"logo\":\"FX\"},{\"name\":\"HBO\",\"id\":\"e54a9a384f9494b12c8b0db6d0e0d508\",\"logo\":\"HBO\"},{\"name\":\"Marvel Studios\",\"id\":\"92e087260fb84bbba21ef249122925df\",\"logo\":\"Marvel_Studios\"},{\"name\":\"New Line Cinema\",\"id\":\"7873ccad8e0c6cb8e4381eaf1d35e7fa\",\"logo\":\"New_Line_Cinema\"},{\"name\":\"Paramount Pictures\",\"id\":\"2672ed34a3f2b0bb6b4257c2ab9875b7\",\"logo\":\"Paramount_Pictures\"},{\"name\":\"Pixar\",\"id\":\"a1384420050b89ea581e04c0dd9a83a8\",\"logo\":\"Pixar\"},{\"name\":\"Paramount+ with Showtime\",\"id\":\"86142dfe58fec2c017c489f4ce722585\",\"logo\":\"Paramount+_with_Showtime\"},{\"name\":\"Universal Pictures\",\"id\":\"e56aaac7ab0bb0f5f48371be0252bab4\",\"logo\":\"Universal_Pictures\"},{\"name\":\"Prime Video\",\"id\":\"4218c9396bdb422a9ae9502ac47bd567\",\"logo\":\"Prime_Video\"},{\"name\":\"Hulu\",\"id\":\"de873e4b49970a1876abaa177ede4554\",\"logo\":\"Hulu\"},{\"name\":\"Peacock\",\"id\":\"eaba5a62596eecd5193eabf58764cca4\",\"logo\":\"Peacock\"}]},{\"id\":\"continue\",\"on\":true,\"title\":\"Continue Watching & Next Up\",\"type\":\"continue\",\"shape\":\"thumb\",\"limit\":24,\"resumeLimit\":12,\"nextUpLimit\":24},{\"id\":\"trending\",\"on\":true,\"title\":\"Trending This Week\",\"type\":\"trending\",\"shape\":\"poster\",\"limit\":10,\"released\":true,\"ranked\":true},{\"id\":\"latest-releases\",\"on\":true,\"title\":\"Latest Releases\",\"type\":\"items\",\"shape\":\"poster\",\"types\":\"Movie,Series\",\"sortBy\":\"PremiereDate\",\"sortOrder\":\"Descending\",\"released\":true,\"limit\":16},{\"id\":\"recent-movies\",\"on\":true,\"title\":\"Recently Added Movies\",\"type\":\"latest\",\"shape\":\"poster\",\"parentId\":\"f137a2dd21bbc1b99aa5c0f6bf02a805\",\"limit\":16,\"more\":\"#/movies.html?topParentId=f137a2dd21bbc1b99aa5c0f6bf02a805&collectionType=movies&tab=1\"},{\"id\":\"recent-shows\",\"on\":true,\"title\":\"Recently Added Shows\",\"type\":\"latest\",\"shape\":\"poster\",\"parentId\":\"a656b907eb3a73532e40e44b968d0225\",\"limit\":16,\"more\":\"#/tv.html?topParentId=a656b907eb3a73532e40e44b968d0225&collectionType=tvshows&tab=1\"}]";

    // ── Speed / feel ──
    /// <summary>Ambient background cross-fades when it changes (off = instant). The first one is always instant.</summary>
    public bool AmbientFade { get; set; } = true;

    /// <summary>Gets or sets a value indicating whether page changes cross-fade (as on cinejoy.pk).</summary>
    public bool PageTransitions { get; set; } = true;

    /// <summary>Gets or sets a value indicating whether each device opens with the answers to Jellyfin's start-up requests from last time ("Quick start").</summary>
    public bool DeviceCache { get; set; } = true;

    // ── Settings ──
    public string TmdbKey { get; set; } = string.Empty;

    /// <summary>Gets or sets how often (hours) TMDB's trending chart is read again. New titles are matched to it straight away.</summary>
    public int TrendingRefreshHours { get; set; } = 6;
    public string TmdbCountries { get; set; } = "AU,US";
    public string IconUrl { get; set; } = "https://i.imgur.com/ckrwhZ1.png";
    public string DiscordUrl { get; set; } = "https://discord.gg/fgKX5u4Zn9";
    public string DiscordText1 { get; set; } = "Forgot password or need help? Join our Discord";
    public string DiscordText2 { get; set; } = "discord.gg/fgKX5u4Zn9";
    public bool SplashSound { get; set; } = true;
    public double SplashVolume { get; set; } = 0.5;
    public double AmbientDim { get; set; } = 0.48;
    public string PauseStyle { get; set; } = "netflix";
    public int PauseDelaySeconds { get; set; }
    public int SearchHue { get; set; } = 105;
    public string SearchTitle { get; set; } = "Discover something new";
    public int DashboardHoldMs { get; set; } = 1200;
    public int DashboardRecentCount { get; set; } = 16;
    public bool DashboardBlurIps { get; set; } = true;
    public bool DashboardPluginsCollapsed { get; set; } = true;

    /// <summary>
    /// SleekFin's settings (header, details pages, cards, hero look...). SleekFin is built into this plugin now;
    /// on first start these are copied from the SleekFin plugin's saved settings.
    /// </summary>
    public SleekConfiguration? Sleek { get; set; }

}
