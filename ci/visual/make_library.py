"""Builds a small fake media library (tiny videos + NFO metadata + generated artwork) for visual tests."""
import os, subprocess, sys, random
from PIL import Image, ImageDraw, ImageFont

ROOT = sys.argv[1]
FFMPEG = sys.argv[2] if len(sys.argv) > 2 else "ffmpeg"
rnd = random.Random(7)
FONT = None
for f in ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"]:
    if os.path.exists(f):
        FONT = f
        break

def font(size):
    return ImageFont.truetype(FONT, size) if FONT else ImageFont.load_default()

PALETTE = [(24, 64, 120), (120, 30, 40), (30, 100, 70), (110, 80, 20), (70, 40, 110), (20, 90, 110), (130, 60, 20), (50, 50, 60)]

def art(path, size, title, colour, kind):
    w, h = size
    im = Image.new("RGB", size, colour)
    d = ImageDraw.Draw(im)
    for y in range(h):  # vertical gradient
        t = y / h
        c = tuple(int(v * (1 - 0.6 * t)) for v in colour)
        d.line([(0, y), (w, y)], fill=c)
    for i in range(6):  # a few shapes so images aren't flat
        x0, y0 = rnd.randint(0, w), rnd.randint(0, h)
        r = rnd.randint(w // 12, w // 4)
        d.ellipse([x0 - r, y0 - r, x0 + r, y0 + r], outline=tuple(min(255, v + 60) for v in colour), width=max(2, w // 200))
    if kind != "fanart":
        f = font(max(14, w // (10 if kind == "poster" else 18)))
        d.text((w * 0.07, h * (0.78 if kind == "poster" else 0.7)), title.upper(), font=f, fill=(255, 255, 255))
    im.save(path, quality=88)

def logo(path, title):
    f = font(96)
    tw = int(f.getlength(title.upper())) + 20
    im = Image.new("RGBA", (tw, 130), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((10, 10), title.upper(), font=f, fill=(255, 255, 255, 255))
    im.save(path)

def video(path, seconds=3):
    subprocess.run([FFMPEG, "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0x202830:s=320x180:d=%d" % seconds,
                    "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", str(seconds), "-c:v", "libx264", "-preset", "ultrafast",
                    "-c:a", "aac", "-shortest", path], check=True)

def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;")

GENRES = ["Action", "Drama", "Thriller", "Comedy", "Sci-Fi", "Mystery", "Romance", "Adventure"]
MOVIES = ["Aurora Line", "Glass Harbour", "The Quiet Engine", "Northbound", "Paper Lanterns", "Red Meridian", "Saltwater",
          "Static Bloom", "The Long Hallway", "Tin Crown", "Velvet Signal", "Winter Orchard"]
SHOWS = ["Copper Hills", "Night Shift Radio", "The Atlas Club", "Low Tide"]

ACTORS = ["Alex Rowan", "Mira Castell", "Jonah Pike", "Priya Venkat", "Leo Marsh"]
ROLES = ["Lead", "Friend", "Rival"]
os.makedirs(ROOT + "/movies", exist_ok=True)
os.makedirs(ROOT + "/shows", exist_ok=True)
for i, name in enumerate(MOVIES):
    year = 2014 + i
    d = "%s/movies/%s (%d)" % (ROOT, name, year)
    os.makedirs(d, exist_ok=True)
    base = "%s/%s (%d)" % (d, name, year)
    video(base + ".mkv")
    col = PALETTE[i % len(PALETTE)]
    art(d + "/poster.jpg", (600, 900), name, col, "poster")
    art(d + "/fanart.jpg", (1920, 1080), name, col, "fanart")
    art(d + "/landscape.jpg", (960, 540), name, col, "thumb")
    logo(d + "/clearlogo.png", name)
    g = [GENRES[i % 8], GENRES[(i + 3) % 8]]
    month = (i % 12) + 1
    open(base + ".nfo", "w").write(
        "<movie><title>%s</title><year>%d</year><premiered>%d-%02d-10</premiered><releasedate>%d-%02d-10</releasedate>"
        "<plot>%s is a made-up film used for visual tests. It has a two-sentence plot so the hero and cards show text.</plot>"
        "<rating>%.1f</rating><mpaa>M</mpaa><runtime>%d</runtime>%s<studio>Test Studio</studio>%s<director>Dana Okafor</director></movie>"
        % (esc(name), year, year, month, year, month, esc(name), 6 + (i % 4) * 0.7, 95 + i * 3, "".join("<genre>%s</genre>" % x for x in g),
           "".join("<actor><name>%s</name><role>%s</role><type>Actor</type></actor>" % (ACTORS[(i + k) % len(ACTORS)], ROLES[k]) for k in range(3))))

for s, name in enumerate(SHOWS):
    year = 2018 + s
    d = "%s/shows/%s (%d)" % (ROOT, name, year)
    os.makedirs(d + "/Season 01", exist_ok=True)
    col = PALETTE[(s + 3) % len(PALETTE)]
    art(d + "/poster.jpg", (600, 900), name, col, "poster")
    art(d + "/fanart.jpg", (1920, 1080), name, col, "fanart")
    art(d + "/landscape.jpg", (960, 540), name, col, "thumb")
    logo(d + "/clearlogo.png", name)
    open(d + "/tvshow.nfo", "w").write(
        "<tvshow><title>%s</title><year>%d</year><premiered>%d-03-01</premiered><status>Continuing</status>"
        "<plot>%s is a made-up series for visual tests.</plot><rating>7.4</rating><genre>Drama</genre><genre>Mystery</genre></tvshow>"
        % (esc(name), year, year, esc(name)))
    for e in range(1, 7):
        ep = "%s/Season 01/%s S01E%02d" % (d, name, e)
        video(ep + ".mkv")
        art(ep + "-thumb.jpg", (960, 540), "Episode %d" % e, PALETTE[(s + e) % len(PALETTE)], "thumb")
        open(ep + ".nfo", "w").write(
            "<episodedetails><title>Chapter %d</title><season>1</season><episode>%d</episode><aired>%d-03-%02d</aired>"
            "<plot>Episode %d of %s. A short synopsis long enough to wrap onto a second line in the episode list.</plot>"
            "<runtime>48</runtime><rating>7.%d</rating></episodedetails>" % (e, e, year, e + 1, e, esc(name), e))
# people: a picture each (in Jellyfin's metadata folder layout is not needed: the NFO path below works offline)
os.makedirs(ROOT + "/people", exist_ok=True)
for k, a in enumerate(ACTORS):
    art(ROOT + "/people/%s.jpg" % a, (400, 600), a, PALETTE[k % len(PALETTE)], "poster")

# music: 2 artists x 1 album x 4 songs, with cover art and tags
def song(path, title, artist, album, track, year):
    subprocess.run([FFMPEG, "-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=%d:duration=4" % (300 + track * 40),
                    "-c:a", "libmp3lame", "-b:a", "96k", "-metadata", "title=" + title, "-metadata", "artist=" + artist,
                    "-metadata", "album_artist=" + artist, "-metadata", "album=" + album, "-metadata", "track=%d" % track,
                    "-metadata", "date=%d" % year, "-metadata", "genre=Electronic", path], check=True)
for a, (artist, album) in enumerate([("Neon Harbour", "Afterglow"), ("The Static Pines", "Long Weekend")]):
    d = "%s/music/%s/%s" % (ROOT, artist, album)
    os.makedirs(d, exist_ok=True)
    art(d + "/cover.jpg", (600, 600), album, PALETTE[(a + 5) % len(PALETTE)], "poster")
    art("%s/music/%s/folder.jpg" % (ROOT, artist), (600, 600), artist, PALETTE[(a + 2) % len(PALETTE)], "poster")
    for t in range(1, 5):
        song("%s/%02d - Track %d.mp3" % (d, t, t), "Track %d" % t, artist, album, t, 2020 + a)
print("library ready")
