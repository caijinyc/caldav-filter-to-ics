# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
A CalDAV calendar filtering service that connects to Lark/飞书 CalDAV server, fetches events, applies filtering rules, and generates filtered ICS files. Supports both CLI and HTTP server modes.

## Key Commands
- `npm start` - CLI mode: generates filtered.ics file directly
- `node server-version.mjs` - Server mode: runs Express server on port 3000
- `npm test` - Placeholder (no tests implemented)

## Architecture
- **index.mjs**: Core filtering logic (CLI entry point)
- **server-version.mjs**: Express HTTP server wrapper with caching
- **FILTER_CONFIG.mjs**: Filtering rules configuration
- **ACCOUNTS_CONFIG.mjs**: Account settings (currently empty)

## Dependencies
- **tsdav**: CalDAV client
- **ical-generator**: Creates ICS files
- **ical.js**: Parses calendar data
- **express**: HTTP server
- **dotenv**: Environment variables

## Configuration
- **.env**: Contains CalDAV credentials (USERNAME, PASSWORD, URL)
- **FILTER_CONFIG.mjs**: Defines date range and filtering rules
- **log/**: Output directory for filtered.ics and debug files

## Usage Patterns
- **CLI**: Direct execution for one-time filtering
- **Server**: Persistent service with 1-minute cache refresh
- **Calendar Subscription**: Subscribe to `http://localhost:3000/filtered.ics`

## Security Notes
- Credentials stored in .env (properly gitignored)
- Server mode has hardcoded credentials (security issue to address)