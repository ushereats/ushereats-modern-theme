using System.Collections.Concurrent;
using System.Diagnostics;
using System.IO.Pipelines;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;

namespace Jellyfin.Plugin.UshereatsTheme;

/// <summary>
/// Measures what Jellyfin sends: every byte of every response (pages, images, API, video and music
/// streams), so the dashboard can show the real upload right now, and how long each kind of request takes
/// (used by the speed test to show what is slow on the server, including other plugins).
/// </summary>
public static partial class ServerMeter
{
    private static long s_totalBytes;
    private static long s_streamBytes;

    // one sample per second, last 30 s: (time, total bytes, stream bytes)
    private static readonly (long At, long Total, long Streams)[] s_samples = new (long, long, long)[30];
    private static int s_sampleIndex;
    private static Timer? s_timer;
    private static readonly object s_lock = new();

    private static readonly ConcurrentDictionary<string, RouteStat> s_routes = new(StringComparer.Ordinal);

    // playback reports (start / progress / stop), kept since the server started (never reset)
    private static readonly ConcurrentDictionary<string, RouteStat> s_playback = new(StringComparer.Ordinal);
    private static readonly Stopwatch s_clock = Stopwatch.StartNew();

    // what each stream is sending: keyed by its play session and by its device, with the same 30 one-second samples
    private static readonly ConcurrentDictionary<string, Counter> s_perStream = new(StringComparer.OrdinalIgnoreCase);

    private sealed class Counter
    {
        public long Bytes;
        public readonly long[] Samples = new long[30];
        public long LastSentAt = s_clock.ElapsedMilliseconds;
    }

    [GeneratedRegex(@"DeviceId=""([^""]+)""", RegexOptions.IgnoreCase)]
    private static partial Regex AuthDeviceId();

    // the item a stream belongs to (players that send neither a play session nor a device with the stream)
    [GeneratedRegex(@"/(?:videos|audio)/([0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12})(?:/|$)", RegexOptions.IgnoreCase)]
    private static partial Regex StreamItem();

    [GeneratedRegex(@"[0-9a-fA-F]{32}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")]
    private static partial Regex Guid();

    [GeneratedRegex(@"/\d+(?=/|$)")]
    private static partial Regex Number();

    [GeneratedRegex(@"(^|/)(videos|audio|music)/|/hls\d*/|/stream(\.\w+)?$|/download$|/universal$|/master\.m3u8$|/main\.m3u8$|\.(ts|mp4|m4s|aac|mkv|webm)$", RegexOptions.IgnoreCase)]
    private static partial Regex StreamPath();

    private sealed class RouteStat
    {
        public long Count;
        public long TotalMs;
        public long MaxMs;
        public long Bytes;
    }

    private static void EnsureTimer()
    {
        if (s_timer != null)
        {
            return;
        }

        lock (s_lock)
        {
            s_timer ??= new Timer(_ => Sample(), null, 0, 1000);
        }
    }

    private static void Sample()
    {
        lock (s_lock)
        {
            s_sampleIndex = (s_sampleIndex + 1) % s_samples.Length;
            s_samples[s_sampleIndex] = (s_clock.ElapsedMilliseconds, Interlocked.Read(ref s_totalBytes), Interlocked.Read(ref s_streamBytes));
            long now = s_clock.ElapsedMilliseconds;
            foreach (KeyValuePair<string, Counter> kv in s_perStream)
            {
                kv.Value.Samples[s_sampleIndex] = Interlocked.Read(ref kv.Value.Bytes);

                // nothing sent for two minutes: that stream has ended
                if (now - Interlocked.Read(ref kv.Value.LastSentAt) > 120000)
                {
                    s_perStream.TryRemove(kv.Key, out _);
                }
            }
        }
    }

    /// <summary>Bits per second each stream is sending now (last <paramref name="seconds"/> s), by play session and by device.</summary>
    public static Dictionary<string, double> StreamRates(int seconds)
    {
        EnsureTimer();
        var result = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase);
        lock (s_lock)
        {
            int then = ((s_sampleIndex - seconds) % s_samples.Length + s_samples.Length) % s_samples.Length;
            double span = (s_samples[s_sampleIndex].At - s_samples[then].At) / 1000.0;
            if (span <= 0)
            {
                return result;
            }

            foreach (KeyValuePair<string, Counter> kv in s_perStream)
            {
                long a = kv.Value.Samples[then], b = kv.Value.Samples[s_sampleIndex];
                result[kv.Key] = Math.Round((b - Math.Min(a, b)) * 8 / span / 1e6, 2);
            }
        }

        return result;
    }

    private static string[] StreamKeys(HttpContext context)
    {
        var keys = new List<string>(2);
        IQueryCollection q = context.Request.Query;
        string? play = q["PlaySessionId"].FirstOrDefault() ?? q["playSessionId"].FirstOrDefault();
        if (!string.IsNullOrEmpty(play))
        {
            keys.Add("ps:" + play);
        }

        string? device = q["DeviceId"].FirstOrDefault() ?? q["deviceId"].FirstOrDefault();
        if (string.IsNullOrEmpty(device))
        {
            string auth = context.Request.Headers.Authorization.ToString();
            if (string.IsNullOrEmpty(auth))
            {
                auth = context.Request.Headers["X-Emby-Authorization"].ToString();
            }

            Match m = AuthDeviceId().Match(auth);
            if (m.Success)
            {
                device = Uri.UnescapeDataString(m.Groups[1].Value);
            }
        }

        if (!string.IsNullOrEmpty(device))
        {
            keys.Add("dev:" + device);
        }

        Match item = StreamItem().Match(context.Request.Path.Value ?? string.Empty);
        if (item.Success)
        {
            keys.Add("item:" + item.Groups[1].Value.Replace("-", string.Empty, StringComparison.Ordinal).ToLowerInvariant());
        }

        return keys.ToArray();
    }

    /// <summary>Bytes per second over the last <paramref name="seconds"/> seconds (whole service, streams only).</summary>
    public static (double Total, double Streams) Rate(int seconds)
    {
        EnsureTimer();
        lock (s_lock)
        {
            var now = s_samples[s_sampleIndex];
            var then = s_samples[((s_sampleIndex - seconds) % s_samples.Length + s_samples.Length) % s_samples.Length];
            double span = (now.At - then.At) / 1000.0;
            if (span <= 0 || then.At == 0)
            {
                return (0, 0);
            }

            return ((now.Total - then.Total) / span, (now.Streams - then.Streams) / span);
        }
    }

    /// <summary>Request timings per kind of request since the last reset (slowest first).</summary>
    public static object Routes()
    {
        return s_routes
            .Select(kv => new
            {
                route = kv.Key,
                count = kv.Value.Count,
                avgMs = kv.Value.Count == 0 ? 0 : kv.Value.TotalMs / kv.Value.Count,
                maxMs = kv.Value.MaxMs,
                totalMs = kv.Value.TotalMs,
                kb = kv.Value.Bytes / 1024
            })
            .OrderByDescending(r => r.totalMs)
            .Take(80)
            .ToArray();
    }

    public static void ResetRoutes() => s_routes.Clear();

    /// <summary>Playback reports since the server started (how long each kind took).</summary>
    public static object Playback() => Table(s_playback);

    private static object Table(ConcurrentDictionary<string, RouteStat> table)
    {
        return table
            .Select(kv => new
            {
                route = kv.Key,
                count = kv.Value.Count,
                avgMs = kv.Value.Count == 0 ? 0 : kv.Value.TotalMs / kv.Value.Count,
                maxMs = kv.Value.MaxMs,
                totalMs = kv.Value.TotalMs
            })
            .OrderByDescending(r => r.maxMs)
            .ToArray();
    }

    private static void Record(ConcurrentDictionary<string, RouteStat> table, string route, long ms, long bytes)
    {
        RouteStat stat = table.GetOrAdd(route, _ => new RouteStat());
        Interlocked.Increment(ref stat.Count);
        Interlocked.Add(ref stat.TotalMs, ms);
        Interlocked.Add(ref stat.Bytes, bytes);
        long max;
        do
        {
            max = Interlocked.Read(ref stat.MaxMs);
        }
        while (ms > max && Interlocked.CompareExchange(ref stat.MaxMs, ms, max) != max);
    }

    private static string RouteOf(HttpContext context)
    {
        string path = context.Request.Path.Value ?? "/";
        path = Guid().Replace(path, "{id}");
        path = Number().Replace(path, "/{n}");
        return context.Request.Method + " " + (path.Length > 120 ? path[..120] : path);
    }

    /// <summary>Wraps one request: counts what is sent and how long it takes.</summary>
    public static async Task Track(HttpContext context, RequestDelegate next)
    {
        EnsureTimer();
        if (context.WebSockets.IsWebSocketRequest
            || string.Equals(context.Request.Headers.Upgrade, "websocket", StringComparison.OrdinalIgnoreCase))
        {
            await next(context).ConfigureAwait(false);
            return;
        }

        string path = context.Request.Path.Value ?? string.Empty;
        bool stream = StreamPath().IsMatch(path);
        IHttpResponseBodyFeature? original = context.Features.Get<IHttpResponseBodyFeature>();
        CountingBody? counting = null;
        if (original != null)
        {
            counting = new CountingBody(original, stream, stream ? StreamKeys(context) : Array.Empty<string>());
            context.Features.Set<IHttpResponseBodyFeature>(counting);
        }

        long start = s_clock.ElapsedMilliseconds;
        try
        {
            await next(context).ConfigureAwait(false);
        }
        finally
        {
            if (original != null)
            {
                context.Features.Set(original);
            }

            // long streams/websockets would only skew request timings
            if (!stream)
            {
                long ms = s_clock.ElapsedMilliseconds - start;
                string route = RouteOf(context);
                Record(s_routes, route, ms, counting?.Sent ?? 0);
                if (route.Contains("/Sessions/Playing", StringComparison.OrdinalIgnoreCase))
                {
                    Record(s_playback, route, ms, 0);
                }
            }
        }
    }

    internal static void Add(long bytes, bool stream)
    {
        Interlocked.Add(ref s_totalBytes, bytes);
        if (stream)
        {
            Interlocked.Add(ref s_streamBytes, bytes);
        }
    }

    /// <summary>The response body, passed through unchanged; every byte is counted on the way.</summary>
    private sealed class CountingBody : IHttpResponseBodyFeature
    {
        private readonly IHttpResponseBodyFeature _inner;
        private readonly bool _stream;
        private readonly CountingStream _body;
        private PipeWriter? _writer;
        public long Sent;

        private readonly Counter[] _counters;
        private readonly string[] _keys;

        public CountingBody(IHttpResponseBodyFeature inner, bool stream, string[] keys)
        {
            _inner = inner;
            _stream = stream;
            _keys = keys;
            _counters = keys.Select(k => s_perStream.GetOrAdd(k, _ => new Counter())).ToArray();
            _body = new CountingStream(inner.Stream, this);
        }

        public Stream Stream => _body;

        public PipeWriter Writer => _writer ??= PipeWriter.Create(_body, new StreamPipeWriterOptions(leaveOpen: true));

        public void Counted(long bytes)
        {
            Sent += bytes;
            Add(bytes, _stream);
            for (int i = 0; i < _counters.Length; i++)
            {
                Counter c = _counters[i];
                Interlocked.Add(ref c.Bytes, bytes);
                Interlocked.Exchange(ref c.LastSentAt, s_clock.ElapsedMilliseconds);

                // a long pause got it dropped: put it back while this response keeps sending
                s_perStream.TryAdd(_keys[i], c);
            }
        }

        public void DisableBuffering() => _inner.DisableBuffering();

        public Task StartAsync(CancellationToken cancellationToken = default) => _inner.StartAsync(cancellationToken);

        public async Task CompleteAsync()
        {
            if (_writer != null)
            {
                await _writer.FlushAsync().ConfigureAwait(false);
            }

            await _inner.CompleteAsync().ConfigureAwait(false);
        }

        // files are copied through the counted stream (Kestrel does the same copy itself)
        public async Task SendFileAsync(string path, long offset, long? count, CancellationToken cancellationToken = default)
        {
            if (_writer != null)
            {
                await _writer.FlushAsync(cancellationToken).ConfigureAwait(false);
            }

            await using FileStream file = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete, 1, FileOptions.Asynchronous | FileOptions.SequentialScan);
            file.Seek(offset, SeekOrigin.Begin);
            long left = count ?? (file.Length - offset);
            byte[] buffer = System.Buffers.ArrayPool<byte>.Shared.Rent(64 * 1024);
            try
            {
                while (left > 0)
                {
                    int read = await file.ReadAsync(buffer.AsMemory(0, (int)Math.Min(buffer.Length, left)), cancellationToken).ConfigureAwait(false);
                    if (read <= 0)
                    {
                        break;
                    }

                    await _body.WriteAsync(buffer.AsMemory(0, read), cancellationToken).ConfigureAwait(false);
                    left -= read;
                }
            }
            finally
            {
                System.Buffers.ArrayPool<byte>.Shared.Return(buffer);
            }
        }
    }

    private sealed class CountingStream : Stream
    {
        private readonly Stream _inner;
        private readonly CountingBody _owner;

        public CountingStream(Stream inner, CountingBody owner)
        {
            _inner = inner;
            _owner = owner;
        }

        public override bool CanRead => false;

        public override bool CanSeek => false;

        public override bool CanWrite => true;

        public override long Length => throw new NotSupportedException();

        public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }

        public override void Flush() => _inner.Flush();

        public override Task FlushAsync(CancellationToken cancellationToken) => _inner.FlushAsync(cancellationToken);

        public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException();

        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();

        public override void SetLength(long value) => throw new NotSupportedException();

        public override void Write(byte[] buffer, int offset, int count)
        {
            _inner.Write(buffer, offset, count);
            _owner.Counted(count);
        }

        public override void Write(ReadOnlySpan<byte> buffer)
        {
            _inner.Write(buffer);
            _owner.Counted(buffer.Length);
        }

        public override async Task WriteAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken)
        {
            await _inner.WriteAsync(buffer.AsMemory(offset, count), cancellationToken).ConfigureAwait(false);
            _owner.Counted(count);
        }

        public override async ValueTask WriteAsync(ReadOnlyMemory<byte> buffer, CancellationToken cancellationToken = default)
        {
            await _inner.WriteAsync(buffer, cancellationToken).ConfigureAwait(false);
            _owner.Counted(buffer.Length);
        }
    }
}
