using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.UshereatsTheme.Configuration;

/// <summary>
/// Settings shown on the plugin page. Everything is sent to the browser as window.TB_CONFIG.
/// </summary>
public class PluginConfiguration : BasePluginConfiguration
{
    // ── Features (each one is only downloaded when switched on) ──
    public bool LibraryStats { get; set; } = true;
    public bool WelcomeSplash { get; set; } = true;
    public bool TimeRemaining { get; set; } = true;
    public bool HeaderAvatar { get; set; } = true;
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
    public bool CustomIcon { get; set; } = true;
    public bool AccentColour { get; set; } = true;
    public bool EpisodeList { get; set; } = true;
    public bool UserMenu { get; set; } = true;
    public bool DashboardSkin { get; set; } = true;

    // ── Settings ──
    public string TmdbKey { get; set; } = string.Empty;
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

    /// <summary>Extra CSS added after the theme (quick tweaks without rebuilding).</summary>
    public string ExtraCss { get; set; } = string.Empty;
}
