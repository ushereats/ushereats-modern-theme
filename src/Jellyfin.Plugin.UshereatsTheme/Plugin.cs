using System.Xml.Serialization;
using Jellyfin.Plugin.UshereatsTheme.Configuration;
using Jellyfin.Plugin.UshereatsTheme.Sleek;
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
        _paths = applicationPaths;
        if (Configuration.Sleek == null)
        {
            // first start with SleekFin built in: bring over SleekFin's own saved settings
            Configuration.Sleek = ImportSleekFin() ?? new SleekConfiguration();
            Normalize(Configuration.Sleek);
            SaveConfiguration();
        }
        else
        {
            Normalize(Configuration.Sleek);
        }

        if (!IsHex(Configuration.AccentColor))
        {
            // accent moved to this page: start from the colour SleekFin had
            Configuration.AccentColor = Configuration.Sleek.AccentColor;
            SaveConfiguration();
        }
    }

    internal static bool IsHex(string? s) => s != null && s.Length == 7 && s[0] == '#' && s.Skip(1).All(char.IsAsciiHexDigit);

    private readonly IApplicationPaths _paths;

    public override void UpdateConfiguration(BasePluginConfiguration configuration)
    {
        if (configuration is PluginConfiguration c)
        {
            c.Sleek ??= Configuration.Sleek ?? new SleekConfiguration();
            if (!IsHex(c.AccentColor))
            {
                c.AccentColor = IsHex(Configuration.AccentColor) ? Configuration.AccentColor : c.Sleek.AccentColor;
            }

            c.AccentColor = c.AccentColor.ToLowerInvariant();
            c.Sleek.AccentColor = c.AccentColor;   // one colour: SleekFin's previews follow it too
            Normalize(c.Sleek);
        }

        base.UpdateConfiguration(configuration);
    }

    private static void Normalize(SleekConfiguration s)
    {
        HeaderConfiguration.Normalize(s);
        HeroConfiguration.Normalize(s);
        DetailsConfiguration.Normalize(s);
    }

    private SleekConfiguration? ImportSleekFin()
    {
        try
        {
            string file = Path.Combine(_paths.PluginConfigurationsPath, "Jellyfin.Plugin.SleekFin.xml");
            if (!File.Exists(file))
            {
                return null;
            }

            XmlSerializer xs = new XmlSerializer(typeof(SleekConfiguration), new XmlRootAttribute("PluginConfiguration"));
            using FileStream fs = File.OpenRead(file);
            return xs.Deserialize(fs) as SleekConfiguration;
        }
        catch (Exception)
        {
            return null;
        }
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
