using System.Text.RegularExpressions;
using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;

namespace Jellyfin.Plugin.UshereatsTheme;

/// <summary>Registers the plugin's request handling with Jellyfin.</summary>
public class ServiceRegistrator : IPluginServiceRegistrator
{
    public void RegisterServices(IServiceCollection serviceCollection, IServerApplicationHost applicationHost)
    {
        serviceCollection.AddTransient<IStartupFilter, LogoSizeStartupFilter>();
        // Trending This Week: new titles join it straight away, and the chart is re-read on the set schedule
        serviceCollection.AddHostedService<TrendingWatcher>();
    }
}

/// <summary>Puts <see cref="LogoSize"/> in front of Jellyfin's own request handling.</summary>
public class LogoSizeStartupFilter : IStartupFilter
{
    public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) => app =>
    {
        app.Use(async (context, nextStep) =>
        {
            LogoSize.Apply(context);
            await ServerMeter.Track(context, nextStep).ConfigureAwait(false);
        });
        next(app);
    };
}

/// <summary>
/// Title logos asked for without a size (Jellyfin's details page does this) come back at the size they
/// are drawn, not the original file: a 6.6 MB logo becomes ~100 KB. Jellyfin keeps the resized copy.
/// </summary>
public static partial class LogoSize
{
    private const int MaxWidth = 1000;   // logos are drawn at most ~500 px wide (x2 for sharp screens)
    private const int MaxHeight = 400;

    [GeneratedRegex(@"/Items/[^/]+/Images/Logo(/\d+)?/?$", RegexOptions.IgnoreCase)]
    private static partial Regex LogoPath();

    // the dashboard's Libraries page asks for each library's picture at 1024 px (~700 KB each) and shows it
    // a few hundred pixels wide
    [GeneratedRegex(@"/Items/[^/]+/Images/Primary/?$", RegexOptions.IgnoreCase)]
    private static partial Regex PrimaryPath();

    private static readonly string[] SizeKeys = { "maxWidth", "maxHeight", "width", "height", "fillWidth", "fillHeight" };

    public static void Apply(HttpContext context)
    {
        HttpRequest request = context.Request;
        if (!HttpMethods.IsGet(request.Method) && !HttpMethods.IsHead(request.Method))
        {
            return;
        }

        string path = (request.PathBase.Value ?? string.Empty) + (request.Path.Value ?? string.Empty);
        if (request.Query.Count == 1 && string.Equals(request.Query["maxWidth"], "1024", StringComparison.Ordinal) && PrimaryPath().IsMatch(path))
        {
            request.QueryString = new QueryString("?maxWidth=720&quality=82");
            context.Response.OnStarting(() =>
            {
                context.Response.Headers["X-Ushereats-Logo"] = "sized";
                if (context.Response.StatusCode == 200)
                {
                    context.Response.Headers.CacheControl = "private, max-age=3600";
                }

                return Task.CompletedTask;
            });
            return;
        }

        if (!LogoPath().IsMatch(path))
        {
            return;
        }

        foreach (string key in SizeKeys)
        {
            if (request.Query.ContainsKey(key))
            {
                return;
            }
        }

        request.QueryString = request.QueryString.Add("maxWidth", MaxWidth.ToString(System.Globalization.CultureInfo.InvariantCulture))
            .Add("maxHeight", MaxHeight.ToString(System.Globalization.CultureInfo.InvariantCulture));
        context.Response.OnStarting(() =>
        {
            context.Response.Headers["X-Ushereats-Logo"] = "sized";
            return Task.CompletedTask;
        });
    }
}
