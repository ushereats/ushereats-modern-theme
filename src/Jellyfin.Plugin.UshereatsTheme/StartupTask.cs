using System.Reflection;
using System.Runtime.Loader;
using System.Text.Json;
using MediaBrowser.Model.Tasks;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.UshereatsTheme;

/// <summary>
/// Runs when Jellyfin starts: asks the File Transformation plugin to pass index.html through IndexPatch.
/// </summary>
public class StartupTask : IScheduledTask
{
    private readonly ILogger<StartupTask> _logger;

    public StartupTask(ILogger<StartupTask> logger)
    {
        _logger = logger;
    }

    public string Name => "Ushereats Theme Startup";

    public string Key => "Jellyfin.Plugin.UshereatsTheme.Startup";

    public string Description => "Adds the Ushereats theme to Jellyfin's web page (needs the File Transformation plugin).";

    public string Category => "Startup Services";

    public Task ExecuteAsync(IProgress<double> progress, CancellationToken cancellationToken)
    {
        try
        {
            Assembly? ft = AssemblyLoadContext.All
                .SelectMany(c => c.Assemblies)
                .FirstOrDefault(a => a.FullName?.Contains(".FileTransformation", StringComparison.Ordinal) ?? false);
            Type? api = ft?.GetType("Jellyfin.Plugin.FileTransformation.PluginInterface");
            MethodInfo? register = api?.GetMethod("RegisterTransformation");
            if (register == null)
            {
                _logger.LogError("[Ushereats Theme] File Transformation plugin not found. Install it, then restart Jellyfin.");
                return Task.CompletedTask;
            }

            // Build the payload with File Transformation's own JSON type (avoids version clashes between plugins)
            Type payloadType = register.GetParameters()[0].ParameterType;
            MethodInfo? parse = payloadType.GetMethod("Parse", new[] { typeof(string) });
            bool Register(string id, string pattern, Type callback, string method)
            {
                string json = JsonSerializer.Serialize(new Dictionary<string, string?>
                {
                    ["id"] = id,
                    ["fileNamePattern"] = pattern,
                    ["callbackAssembly"] = callback.Assembly.FullName,
                    ["callbackClass"] = callback.FullName,
                    ["callbackMethod"] = method,
                });
                object? payload = parse?.Invoke(null, new object[] { json });
                if (payload == null)
                {
                    return false;
                }

                register.Invoke(null, new[] { payload });
                return true;
            }

            if (!Register("fc34dcce-8a8a-4ac4-a7ae-fdbdc6589563", "index.html", typeof(IndexPatch), nameof(IndexPatch.Apply)))
            {
                _logger.LogError("[Ushereats Theme] Could not build the File Transformation payload.");
                return Task.CompletedTask;
            }

            // Jellyfin's service worker: keeps the files that never change on each device (see sw-cache.js)
            Register("6b1d3e0a-4f2c-4c8e-9d61-2a7f0b5e9c13", "serviceworker.js", typeof(ServiceWorkerPatch), nameof(ServiceWorkerPatch.Apply));
            ThemeAssets.Get(); // warm up so the first page load is instant
            _logger.LogInformation("[Ushereats Theme] Registered with File Transformation.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[Ushereats Theme] Startup failed.");
        }

        return Task.CompletedTask;
    }

    public IEnumerable<TaskTriggerInfo> GetDefaultTriggers()
    {
        yield return new TaskTriggerInfo
        {
            Type = TaskTriggerInfoType.StartupTrigger
        };
    }
}
