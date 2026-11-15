using System.Text.Json;
using System.Text.Json.Serialization;
using Jellyfin.Database.Implementations.Entities;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.UshereatsTheme.Api;

/// <summary>
/// Client-side error reporting. Any authenticated user may POST; only admins may read or clear.
/// </summary>
[ApiController]
[Route("UshereatsTheme")]
public class ErrorController : ControllerBase
{
    private const int MaxErrors = 500;
    private const int MaxBodyBytes = 4096;
    private const int RateLimitWindowMs = 60_000;
    private const int RateLimitMax = 20;

    // In-process store: survives until restart (intentional — these are runtime errors, not audit logs).
    private static readonly object _lock = new();
    private static readonly List<ClientError> _errors = new(MaxErrors + 1);

    // Per-IP/token rate-limiting: ip -> (windowStart, count)
    private static readonly Dictionary<string, (long At, int Count)> _rate = new(StringComparer.Ordinal);

    private readonly IUserManager _users;

    public ErrorController(IUserManager users)
    {
        _users = users;
    }

    /// <summary>Receive a client-side error report from any signed-in user.</summary>
    [HttpPost("errors")]
    [Authorize]
    public async Task<IActionResult> PostError()
    {
        // Rate-limit per remote IP
        string ip = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "?";
        lock (_lock)
        {
            long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            if (_rate.TryGetValue(ip, out var r) && now - r.At < RateLimitWindowMs)
            {
                if (r.Count >= RateLimitMax) return StatusCode(429);
                _rate[ip] = (r.At, r.Count + 1);
            }
            else
            {
                _rate[ip] = (now, 1);
            }
        }

        // Size-limit the body
        Request.Body = new LimitedStream(Request.Body, MaxBodyBytes);
        string body;
        try
        {
            using var sr = new System.IO.StreamReader(Request.Body, System.Text.Encoding.UTF8);
            body = await sr.ReadToEndAsync().ConfigureAwait(false);
        }
        catch
        {
            return BadRequest();
        }

        ClientErrorPayload? payload;
        try
        {
            payload = JsonSerializer.Deserialize<ClientErrorPayload>(body, JsonOpts);
        }
        catch
        {
            return BadRequest();
        }

        if (payload == null || string.IsNullOrWhiteSpace(payload.Message)) return BadRequest();

        // Fingerprint: message + page + first 60 chars of stack
        string fingerprint = (payload.Message.Length > 200 ? payload.Message[..200] : payload.Message)
            + "|" + (payload.Page?.Length > 100 ? payload.Page[..100] : payload.Page ?? "")
            + "|" + (payload.Stack?.Length > 60 ? payload.Stack[..60] : payload.Stack ?? "");

        string now2 = DateTimeOffset.UtcNow.ToString("o");
        lock (_lock)
        {
            var existing = _errors.FirstOrDefault(e => e.Fingerprint == fingerprint);
            if (existing != null)
            {
                existing.Count++;
                existing.LastSeen = now2;
            }
            else
            {
                if (_errors.Count >= MaxErrors) _errors.RemoveAt(0);
                _errors.Add(new ClientError
                {
                    Fingerprint = fingerprint,
                    Message = payload.Message.Length > 500 ? payload.Message[..500] : payload.Message,
                    Stack = payload.Stack?.Length > 1000 ? payload.Stack[..1000] : payload.Stack,
                    Page = payload.Page?.Length > 200 ? payload.Page[..200] : payload.Page,
                    Browser = payload.Browser?.Length > 200 ? payload.Browser[..200] : payload.Browser,
                    ThemeVersion = payload.ThemeVersion?.Length > 32 ? payload.ThemeVersion[..32] : payload.ThemeVersion,
                    Count = 1,
                    FirstSeen = now2,
                    LastSeen = now2,
                });
            }
        }

        return NoContent();
    }

    /// <summary>List stored client-side errors. Admins only.</summary>
    [HttpGet("errors")]
    [Authorize(Policy = "RequiresElevation")]
    public IActionResult GetErrors()
    {
        lock (_lock)
        {
            Response.Headers["Cache-Control"] = "no-store";
            return Ok(new { errors = _errors.ToList() });
        }
    }

    /// <summary>Clear all stored errors. Admins only.</summary>
    [HttpDelete("errors")]
    [Authorize(Policy = "RequiresElevation")]
    public IActionResult ClearErrors()
    {
        lock (_lock) { _errors.Clear(); }
        return NoContent();
    }

    private static readonly JsonSerializerOptions JsonOpts = new JsonSerializerOptions
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };
}

public class ClientError
{
    public string Fingerprint { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string? Stack { get; set; }
    public string? Page { get; set; }
    public string? Browser { get; set; }
    public string? ThemeVersion { get; set; }
    public int Count { get; set; }
    public string FirstSeen { get; set; } = string.Empty;
    public string LastSeen { get; set; } = string.Empty;
}

public class ClientErrorPayload
{
    public string? Message { get; set; }
    public string? Stack { get; set; }
    public string? Page { get; set; }
    public string? Browser { get; set; }
    public string? ThemeVersion { get; set; }
}

/// <summary>Reads at most <see cref="Limit"/> bytes, then stops; prevents oversized POST bodies.</summary>
internal sealed class LimitedStream : System.IO.Stream
{
    private readonly System.IO.Stream _inner;
    private long _remaining;

    public LimitedStream(System.IO.Stream inner, long limit)
    {
        _inner = inner;
        _remaining = limit;
    }

    public override bool CanRead => true;
    public override bool CanSeek => false;
    public override bool CanWrite => false;
    public override long Length => throw new NotSupportedException();
    public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
    public override void Flush() { }
    public override long Seek(long offset, System.IO.SeekOrigin origin) => throw new NotSupportedException();
    public override void SetLength(long value) => throw new NotSupportedException();
    public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();

    public override int Read(byte[] buffer, int offset, int count)
    {
        if (_remaining <= 0) return 0;
        int toRead = (int)Math.Min(count, _remaining);
        int read = _inner.Read(buffer, offset, toRead);
        _remaining -= read;
        return read;
    }

    public override async Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken)
    {
        if (_remaining <= 0) return 0;
        int toRead = (int)Math.Min(count, _remaining);
        int read = await _inner.ReadAsync(buffer.AsMemory(offset, toRead), cancellationToken).ConfigureAwait(false);
        _remaining -= read;
        return read;
    }
}
