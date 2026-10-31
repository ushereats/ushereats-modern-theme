using System.Diagnostics;
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
}
