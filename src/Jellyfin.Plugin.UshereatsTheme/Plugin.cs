using System.Xml.Serialization;
using Jellyfin.Plugin.UshereatsTheme.Configuration;
using Jellyfin.Plugin.UshereatsTheme.Look;
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
        if (Configuration.Look == null)
        {
            // settings saved before the rename: moved over once, nothing resets
            Configuration.Look = ReadSavedLook() ?? new LookConfiguration();
            Normalize(Configuration.Look);
            SaveConfiguration();
        }
        else
        {
            Normalize(Configuration.Look);
        }

        if (!IsHex(Configuration.AccentColor))
        {
            // accent moved to this page: start from the colour the look had
            Configuration.AccentColor = Configuration.Look.AccentColor;
            SaveConfiguration();
        }
    }

    internal static bool IsHex(string? s) => s != null && s.Length == 7 && s[0] == '#' && s.Skip(1).All(char.IsAsciiHexDigit);

    public override void UpdateConfiguration(BasePluginConfiguration configuration)
    {
        if (configuration is PluginConfiguration c)
        {
            c.Look ??= Configuration.Look ?? new LookConfiguration();
            if (!IsHex(c.AccentColor))
            {
                c.AccentColor = IsHex(Configuration.AccentColor) ? Configuration.AccentColor : c.Look.AccentColor;
            }

            c.AccentColor = c.AccentColor.ToLowerInvariant();
            c.Look.AccentColor = c.AccentColor;   // one colour: the settings previews follow it too
            Normalize(c.Look);
        }

        base.UpdateConfiguration(configuration);
        IndexPatch.InvalidateHtmlCache();
    }

    private static void Normalize(LookConfiguration s)
    {
        HeaderConfiguration.Normalize(s);
        HeroConfiguration.Normalize(s);
        DetailsConfiguration.Normalize(s);
    }

    // The look's settings were saved under the section's old name before the rename: read once from this
    // plugin's own settings file and saved under the new one.
    private const string OldSection = "Sleek";

    private LookConfiguration? ReadSavedLook()
    {
        try
        {
            string file = ConfigurationFilePath;
            if (!File.Exists(file))
            {
                return null;
            }

            System.Xml.Linq.XElement? el = System.Xml.Linq.XDocument.Load(file).Root?.Element(OldSection);
            if (el == null)
            {
                return null;
            }

            XmlSerializer xs = new XmlSerializer(typeof(LookConfiguration), new XmlRootAttribute(OldSection));
            using System.Xml.XmlReader r = el.CreateReader();
            return xs.Deserialize(r) as LookConfiguration;
        }
        catch (Exception)
        {
            return null;
        }
    }

    public override string Name => "Ushereats Theme";

    public override Guid Id => Guid.Parse("01c723cc-57de-4e19-b13c-514b644491a5");

    public override string Description => "Custom look for Jellyfin, loaded instantly from the page head.";

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
