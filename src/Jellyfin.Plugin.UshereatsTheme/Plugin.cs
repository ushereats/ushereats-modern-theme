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
    }

    private readonly IApplicationPaths _paths;

    /// <summary>
    /// True only while the separate SleekFin plugin is really running (its plugin object exists and its file is
    /// still on disk). Uninstalled / disabled / left-over SleekFin = false, so the built-in copy takes over.
    /// </summary>
    public static bool SleekFinPluginLoaded
    {
        get
        {
            DateTime now = DateTime.UtcNow;
            if (now < s_sleekCheckedUntil)
            {
                return s_sleekRunning;
            }

            s_sleekRunning = CheckSleekFin();
            s_sleekCheckedUntil = now.AddSeconds(15);
            return s_sleekRunning;
        }
    }

    private static bool s_sleekRunning;
    private static DateTime s_sleekCheckedUntil = DateTime.MinValue;

    private static bool CheckSleekFin()
    {
        foreach (System.Reflection.Assembly asm in AppDomain.CurrentDomain.GetAssemblies())
        {
            if (!string.Equals(asm.GetName().Name, "Jellyfin.Plugin.SleekFin", StringComparison.Ordinal))
            {
                continue;
            }

            try
            {
                string location = asm.Location;
                if (!string.IsNullOrEmpty(location) && !File.Exists(location))
                {
                    continue; // uninstalled: file gone, only the old copy in memory is left
                }

                object? instance = asm.GetType("Jellyfin.Plugin.SleekFin.SleekFinPlugin")
                    ?.GetProperty("Instance", System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Static)
                    ?.GetValue(null);
                if (instance != null)
                {
                    return true;
                }
            }
            catch (Exception)
            {
                // can't tell: treat as not running
            }
        }

        return false;
    }

    public override void UpdateConfiguration(BasePluginConfiguration configuration)
    {
        if (configuration is PluginConfiguration c)
        {
            c.Sleek ??= Configuration.Sleek ?? new SleekConfiguration();
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
            },
            new PluginPageInfo
            {
                // SleekFin's settings page (header, details pages, cards, hero look)
                Name = "UshereatsThemeLook",
                DisplayName = "Ushereats Theme: Look",
                EmbeddedResourcePath = "sleekPage.html",
                EnableInMainMenu = true,
                MenuIcon = "format_paint"
            }
        };
    }
}
