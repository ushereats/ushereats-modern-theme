using System.Diagnostics;
using System.Reflection;
using MediaBrowser.Controller.Session;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.UshereatsTheme.Api;

/// <summary>Live upload and server request timings (admins only): the dashboard panel and the speed test.</summary>
[ApiController]
[Authorize(Policy = "RequiresElevation")]
[Route("UshereatsTheme/Meter")]
public class MeterController : ControllerBase
{
    private static (DateTime At, TimeSpan Cpu)? s_lastCpu;
    private readonly ISessionManager _sessions;

    public MeterController(ISessionManager sessions)
    {
        _sessions = sessions;
    }

    /// <summary>What Jellyfin is sending right now (average of the last 5 s): everything, and streams only.</summary>
    [HttpGet]
    public IActionResult Get([FromQuery] int seconds = 5)
    {
        (double total, double streams) = ServerMeter.Rate(Math.Clamp(seconds, 1, 25));
        return Ok(new { totalMbps = Math.Round(total * 8 / 1e6, 2), streamsMbps = Math.Round(streams * 8 / 1e6, 2), seconds });
    }

    /// <summary>The server process: CPU use since the last ask, memory, threads.</summary>
    [HttpGet("Process")]
    public IActionResult Process()
    {
        using Process p = System.Diagnostics.Process.GetCurrentProcess();
        DateTime now = DateTime.UtcNow;
        TimeSpan cpu = p.TotalProcessorTime;
        double? cpuPercent = null;
        if (s_lastCpu is { } last && now > last.At)
        {
            cpuPercent = Math.Round((cpu - last.Cpu).TotalMilliseconds / (now - last.At).TotalMilliseconds / Environment.ProcessorCount * 100, 1);
        }

        s_lastCpu = (now, cpu);
        return Ok(new
        {
            cpuPercent,
            cores = Environment.ProcessorCount,
            memoryMb = p.WorkingSet64 / 1048576,
            managedMb = GC.GetTotalMemory(false) / 1048576,
            threads = p.Threads.Count,
            uptimeMinutes = (int)(now - p.StartTime.ToUniversalTime()).TotalMinutes,
            gcCollections = new[] { GC.CollectionCount(0), GC.CollectionCount(1), GC.CollectionCount(2) }
        });
    }

    /// <summary>Request timings per kind of request since the last reset (slowest total first).</summary>
    [HttpGet("Routes")]
    public IActionResult Routes() => Ok(ServerMeter.Routes());

    [HttpPost("Routes/Reset")]
    public IActionResult Reset()
    {
        ServerMeter.ResetRoutes();
        return NoContent();
    }

    /// <summary>
    /// Why pressing play / stop can be slow: how long Jellyfin took to answer the player's playback reports
    /// (since the server started), and everything that runs when playback starts or stops - other plugins
    /// hook in there (notifications, webhooks, scrobblers, reporting), and the player waits for them.
    /// </summary>
    [HttpGet("Playback")]
    public IActionResult Playback()
    {
        return Ok(new { reports = ServerMeter.Playback(), listeners = Listeners() });
    }

    private object Listeners()
    {
        var found = new List<object>();
        // plugins that subscribe to the session manager's events (PlaybackStart += ...)
        Type type = _sessions.GetType();
        foreach (string name in new[] { "PlaybackStart", "PlaybackProgress", "PlaybackStopped", "SessionStarted", "SessionEnded", "SessionActivity", "CapabilitiesChanged" })
        {
            FieldInfo? field = null;
            for (Type? t = type; t != null && field == null; t = t.BaseType)
            {
                field = t.GetField(name, BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public);
            }

            if (field?.GetValue(_sessions) is not Delegate handlers)
            {
                continue;
            }

            foreach (Delegate d in handlers.GetInvocationList())
            {
                Type? owner = d.Target?.GetType() ?? d.Method.DeclaringType;
                found.Add(new { @event = name, by = Who(owner), handler = (owner?.FullName ?? "?") + "." + d.Method.Name });
            }
        }

        // plugins' event consumers (IEventConsumer<Playback...> / <Session...>)
        foreach (Assembly asm in AppDomain.CurrentDomain.GetAssemblies())
        {
            Type[] types;
            try
            {
                types = asm.GetTypes();
            }
            catch (ReflectionTypeLoadException e)
            {
                types = e.Types.OfType<Type>().ToArray();
            }
            catch (Exception)
            {
                continue;
            }

            foreach (Type t in types)
            {
                if (t.IsAbstract || t.IsInterface)
                {
                    continue;
                }

                Type[] interfaces;
                try
                {
                    interfaces = t.GetInterfaces();
                }
                catch (Exception)
                {
                    continue;
                }

                foreach (Type i in interfaces)
                {
                    if (!i.IsGenericType || i.GetGenericTypeDefinition().Name != "IEventConsumer`1")
                    {
                        continue;
                    }

                    string arg = i.GetGenericArguments()[0].Name;
                    if (arg.Contains("Playback", StringComparison.Ordinal) || arg.Contains("Session", StringComparison.Ordinal))
                    {
                        found.Add(new { @event = arg, by = Who(t), handler = t.FullName });
                    }
                }
            }
        }

        return found;
    }

    private static string Who(Type? t)
    {
        string asm = t?.Assembly.GetName().Name ?? "?";
        return asm.StartsWith("Jellyfin.Server", StringComparison.Ordinal) || asm.StartsWith("Emby.", StringComparison.Ordinal) || asm.StartsWith("MediaBrowser.", StringComparison.Ordinal) || asm == "Jellyfin.Api"
            ? "Jellyfin (" + asm + ")"
            : "plugin: " + asm;
    }
}
