import express from "express";
import { createDAVClient } from "tsdav";
import icalGen from "ical-generator";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const IcalExpander = require("ical-expander");
import dotenv from "dotenv";

import { FILTER_CONFIG } from "./FILTER_CONFIG.mjs";

// 加载本地 .env 配置
dotenv.config();

// 时间范围配置
const RANGE_START = FILTER_CONFIG.range.start;
const RANGE_END = FILTER_CONFIG.range.end;

// 判断是否在 GitHub Actions 环境
const isGithubActions = process.env.GITHUB_ACTIONS === "true";

// CalDAV 配置
const CALDAV_CONFIG = {
  serverUrl: isGithubActions ? process.env.CALDAV_SERVER_URL : process.env.URL,
  credentials: {
    username: isGithubActions ? process.env.CALDAV_USERNAME : process.env.USERNAME,
    password: isGithubActions ? process.env.CALDAV_PASSWORD : process.env.PASSWORD,
  },
};

const { filterFields, filterRules } = FILTER_CONFIG;

// 5 分钟缓存机制
let cachedICS = null;
let lastGeneratedTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5分钟

// 拉取并过滤事件
async function fetchAndFilterEvents() {
  const client = await createDAVClient({
    ...CALDAV_CONFIG,
    authMethod: "Basic",
    defaultAccountType: "caldav",
  });

  const calendars = await client.fetchCalendars();

  const calendarObjectsPromises = calendars.map((calendar) =>
    client.fetchCalendarObjects({ calendar })
  );

  const allCalendarObjects = (await Promise.all(calendarObjectsPromises)).flat();

  const filteredEvents = [];

  for (const obj of allCalendarObjects) {
    try {
      const expander = new IcalExpander({
        ics: obj.data,
        maxIterations: 1000,
      });

      const { occurrences } = expander.between(RANGE_START, RANGE_END);

      occurrences.forEach(({ item, startDate, endDate }) => {
        let isMatch = true;

        for (const field of filterFields) {
          const value = item[field];
          if (value) {
            if (
              filterRules.some((rule) => {
                if (Array.isArray(rule[field])) {
                  return rule[field].some((r) => value.includes(r));
                }
                return value.includes(rule[field]);
              })
            ) {
              isMatch = false;
            }
          }
        }

        if (isMatch) {
          filteredEvents.push({
            start: startDate.toJSDate(),
            end: endDate.toJSDate(),
            summary: item.summary,
            description: item.description,
            location: item.location,
            uid: item.uid,
            organizer: item.organizer?.val,
          });
        }
      });
    } catch (err) {
      console.warn("⚠️ Failed to parse calendar object:", err.message);
    }
  }

  return filteredEvents;
}

// 构造过滤后的 ics 日历
async function getFilteredCal() {
  const events = await fetchAndFilterEvents();
  const cal = icalGen({ name: "Filtered Calendar" });

  for (const e of events) {
    cal.createEvent({
      start: e.start,
      end: e.end,
      summary: e.summary,
      description: e.description,
      location: e.location,
      uid: e.uid,
      organizer: e.organizer,
    });
  }

  return cal;
}

// 启动 Express 应用
const app = express();
const PORT = 3000;

app.get("/filtered.ics", async (req, res) => {
  const now = Date.now();

  if (cachedICS && now - lastGeneratedTime < CACHE_TTL) {
    console.log("✅ Serving cached .ics");
    res.setHeader("Content-Type", "text/calendar");
    res.setHeader("Content-Disposition", "attachment; filename=filtered.ics");
    return res.send(cachedICS);
  }

  try {
    console.log("🔄 Generating new .ics");
    const cal = await getFilteredCal();
    const icsString = cal.toString();

    // 更新缓存
    cachedICS = icsString;
    lastGeneratedTime = now;

    res.setHeader("Content-Type", "text/calendar");
    res.setHeader("Content-Disposition", "attachment; filename=filtered.ics");
    res.send(icsString);
  } catch (err) {
    console.error("❌ Error generating calendar:", err);
    res.status(500).send("Error generating calendar.");
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
