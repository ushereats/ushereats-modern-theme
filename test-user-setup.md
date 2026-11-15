# Test user setup

The visual tests and smoke tests use a dedicated read-only Jellyfin account.
Run these steps once on your server.

## 1. Create the user

1. Open Jellyfin admin → **Users** → **New User**
2. Username: `ci-test` (or anything you like)
3. Password: set a strong password you won't use elsewhere
4. Uncheck **Allow media downloads**
5. Uncheck **Allow media deletion**
6. Under **Library access**, tick every library the tests should see (Movies + Shows at minimum)
7. Save

## 2. Get the user's ID and token

Open a terminal and run (replace HOST and PASSWORD):

```bash
curl -s -X POST "http://HOST:8096/Users/AuthenticateByName" \
  -H "Authorization: MediaBrowser Client=\"ci\", Device=\"ci\", DeviceId=\"ci-setup\", Version=\"1.0\"" \
  -H "Content-Type: application/json" \
  -d '{"Username":"ci-test","Pw":"PASSWORD"}' | python3 -m json.tool
```

Note down:
- `AccessToken` → `token`
- `User.Id` → `userId`
- `ServerId` → `serverId`

## 3. Get the movie library ID

```bash
curl -s "http://HOST:8096/UserViews?userId=YOUR_USER_ID" \
  -H "Authorization: MediaBrowser Token=\"YOUR_TOKEN\"" | python3 -m json.tool
```

Find the entry with `"CollectionType": "movies"` and note its `Id` → `movieLib`.

## 4. Create ci-session.json

Copy `ci-session.example.json` to `ci-session.json` (gitignored) and fill in all five values:

```json
{
  "server": "http://HOST:8096",
  "token": "ACCESS_TOKEN_FROM_STEP_2",
  "userId": "USER_ID_FROM_STEP_2",
  "serverId": "SERVER_ID_FROM_STEP_2",
  "movieLib": "MOVIE_LIB_ID_FROM_STEP_3"
}
```

## 5. Install Playwright browsers (one-time)

```bash
npx playwright install chromium webkit
```

## 6. Verify

```bash
npm run smoke
```

All steps should print PASS.
