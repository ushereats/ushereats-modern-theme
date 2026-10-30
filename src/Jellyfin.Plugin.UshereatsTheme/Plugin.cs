using Jellyfin.Plugin.UshereatsTheme.Configuration;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;

namespace Jellyfin.Plugin.UshereatsTheme;

/// <summary>
/// Ushereats Theme: serves the custom look (CSS + scripts) straight from the page head,
/// so it is there on the very first frame.
/// </summary>
public class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
{
    public Plugin(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer)
        : base(applicationPaths, xmlSerializer)
    {
        Instance = this;
    }

    public override string Name => "Ushereats Theme";

    public override Guid Id => Guid.Parse("01c723cc-57de-4e19-b13c-514b644491a5");

    public override string Description => "Custom look for Jellyfin + SleekFin, loaded instantly from the page head.";

    public static Plugin? Instance { get; private set; }

    public IEnumerable<PluginPageInfo> GetPages()
    {
        return new[]
        {
            new PluginPageInfo
            {
                Name = "UshereatsTheme",
                DisplayName = "Ushereats Theme",
                EmbeddedResourcePath = "configPage.html",
                EnableInMainMenu = true,
                MenuIcon = "palette"
            }
        };
    }
}
