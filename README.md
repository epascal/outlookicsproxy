# Outlook ICS Proxy

**Version 1.0.0**

An Express proxy server that fetches Outlook 365 ICS calendar feeds and fixes timezone issues for Google Calendar compatibility. This proxy converts UTC timestamps to local timezones, handles floating times, and ensures proper VTIMEZONE blocks for seamless integration with Google Calendar.

## Features

- ✅ Converts UTC timestamps (ending with `Z`) to target timezone with TZID
- ✅ Attaches TZID to floating times without shifting the clock
- ✅ Preserves all-day events (VALUE=DATE) as-is
- ✅ Optionally overrides existing TZIDs
- ✅ Maps Windows timezone identifiers to IANA equivalents
- ✅ Adds Google Calendar-compatible VTIMEZONE blocks
- ✅ CORS enabled for all origins
- ✅ Built with TypeScript and Node.js 22.20.0
- ✅ Docker-ready with multi-stage builds
- ✅ Docker Swarm deployment support

## Quick Start

### Prerequisites

- Node.js 22.20.0 or higher
- npm or yarn
- Docker (optional, for containerized deployment)

### Local Development

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd outlookicsproxy
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set environment variables**
   ```bash
   export SOURCE_ICS_URL="https://outlook.office365.com/owa/calendar/your-calendar-url/calendar.ics"
   export TARGET_TZ="Europe/Zurich"
   export PORT=3003
   ```

4. **Run the server**
   ```bash
   npm start
   ```

5. **Access the calendar**
   ```
   http://localhost:3003/calendar.ics
   ```

## Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `SOURCE_ICS_URL` | Source Outlook 365 ICS calendar URL | - | Yes |
| `TARGET_TZ` | Target timezone (IANA format) | `Europe/Zurich` | No |
| `PORT` | Server port | `3003` | No |
| `NODE_ENV` | Node.js environment | `production` | No |

### Query Parameters

The `/calendar.ics` endpoint accepts the following query parameters:

- `url` - Override the source ICS URL (if different from `SOURCE_ICS_URL`)
- `tz` - Override the target timezone (if different from `TARGET_TZ`)
- `override` - Force conversion of existing timezones (`1` = override, `0` = respect existing)

**Example:**
```
http://localhost:3003/calendar.ics?tz=Europe/Paris&override=1
```

## Docker Deployment

### Quick Deployment with Docker Swarm

1. **Build the image**
   ```bash
   ./build.sh
   ```

2. **Deploy the stack**
   ```bash
   ./deploy.sh --no-build
   ```

### Manual Deployment

1. **Build the image**
   ```bash
   docker build -t outlookicsproxy:latest .
   ```

2. **Deploy with Docker Swarm**
   ```bash
   docker stack deploy -c docker-compose.yml outlookicsproxy
   ```

3. **Or use Docker Compose (development)**
   ```bash
   docker-compose -f docker-compose.dev.yml up --build
   ```

### Environment Configuration

Copy `env.example` to `.env` and adjust the values:

```bash
cp env.example .env
```

Edit `.env` with your configuration:
```env
SOURCE_ICS_URL=https://outlook.office365.com/owa/calendar/your-calendar-url/calendar.ics
TARGET_TZ=Europe/Zurich
PORT=3003
NODE_ENV=production
```

## How It Works

The proxy performs the following transformations on ICS files:

1. **UTC Timestamps** → Converts to target timezone with TZID
   - Input: `DTSTART:20240101T120000Z`
   - Output: `DTSTART;TZID=Europe/Zurich:20240101T130000`

2. **Floating Times** → Attaches TZID without shifting
   - Input: `DTSTART:20240101T120000`
   - Output: `DTSTART;TZID=Europe/Zurich:20240101T120000`

3. **All-Day Events** → Preserved as-is
   - Input: `DTSTART;VALUE=DATE:20240101`
   - Output: `DTSTART;VALUE=DATE:20240101`

4. **VTIMEZONE Blocks** → Added/updated for Google Calendar compatibility

5. **Windows Timezones** → Mapped to IANA equivalents
   - `W. Europe Standard Time` → `Europe/Zurich`
   - `Eastern Standard Time` → `America/New_York`

## API Endpoints

### GET `/calendar.ics`

Fetches and transforms the ICS calendar file.

**Query Parameters:**
- `url` (optional) - Source ICS URL
- `tz` (optional) - Target timezone (IANA format)
- `override` (optional) - Override existing timezones (1/0)

**Response:**
- Content-Type: `text/calendar; charset=utf-8`
- Cache-Control: `public, max-age=600` (10 minutes)

**Example:**
```bash
curl "http://localhost:3003/calendar.ics?tz=Europe/Paris&override=1"
```

## Monitoring

### Docker Swarm Commands

```bash
# View logs in real-time
docker service logs -f outlookicsproxy_outlookicsproxy

# View service status
docker service ps outlookicsproxy_outlookicsproxy

# View metrics
docker stats $(docker ps -q --filter name=outlookicsproxy)

# Restart service
docker service update --force outlookicsproxy_outlookicsproxy
```

### Health Check

The service includes a health check endpoint that verifies:
- Service availability
- Connection to source URL
- ICS data transformation

## Troubleshooting

### Service Won't Start

```bash
# Check logs
docker service logs outlookicsproxy_outlookicsproxy

# Check configuration
docker service inspect outlookicsproxy_outlookicsproxy
```

### Network Issues

```bash
# Check overlay network
docker network ls
docker network inspect outlookicsproxy_outlookicsproxy-network
```

### Resource Issues

```bash
# Check resource usage
docker stats
docker node ls
```

## Development

### Project Structure

```
outlookicsproxy/
├── server.ts              # Main server file
├── package.json           # Dependencies and scripts
├── tsconfig.json          # TypeScript configuration
├── Dockerfile             # Docker image definition
├── docker-compose.yml     # Docker Swarm configuration
├── docker-compose.dev.yml # Development configuration
├── build.sh              # Build script
├── deploy.sh             # Deployment script
├── env.example           # Environment variables template
└── README.md             # This file
```

### Scripts

- `npm start` - Start the server
- `npm run dev` - Start in development mode
- `./build.sh` - Build Docker image
- `./deploy.sh` - Deploy to Docker Swarm

## Technical Details

- **Runtime**: Node.js 22.20.0 (with native TypeScript support)
- **Framework**: Express.js
- **Timezone Library**: Luxon
- **Language**: TypeScript
- **Container**: Alpine Linux
- **Security**: Non-root user execution
- **Caching**: 10-minute cache for ICS files
- **CORS**: Enabled for all origins

## License

ISC

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues and questions, please open an issue on the GitHub repository.
