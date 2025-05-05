/**
 *
 * ✅ 从 CalDAV 拉取数据；
 * ✅ 本地解析并按规则过滤事件；
 * ✅ 将这些过滤后的事件重新生成为一个 .ics 文件；
 * ✅ 输出到当前目录的 filtered.ics 文件中
 */

import { createDAVClient } from "tsdav";
import icalGen from "ical-generator";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const IcalExpander = require("ical-expander");
import fs from "node:fs";

import { FILTER_CONFIG } from "./FILTER_CONFIG.mjs";

// 设置时间范围（展开重复事件时必须）
const RANGE_START = FILTER_CONFIG.range.start;
const RANGE_END = FILTER_CONFIG.range.end;

// 判断是否为 github actions 环境
const isGithubActions = process.env.GITHUB_ACTIONS === "true";

// 读取 .env 文件中的配置
const localEnv = require("dotenv").config();

let CALDAV_USERNAME = localEnv.parsed.USERNAME;
let CALDAV_PASSWORD = localEnv.parsed.PASSWORD;
let CALDAV_SERVER_URL = localEnv.parsed.URL;

if (isGithubActions) {
  CALDAV_USERNAME = process.env.CALDAV_USERNAME;
  CALDAV_PASSWORD = process.env.CALDAV_PASSWORD;
  CALDAV_SERVER_URL = process.env.CALDAV_SERVER_URL;
}

const CALDAV_CONFIG = {
  serverUrl: CALDAV_SERVER_URL,
  credentials: {
    username: CALDAV_USERNAME,
    password: CALDAV_PASSWORD,
  },
};

console.log("### -> CALDAV_CONFIG", CALDAV_CONFIG);

const { filterFields, filterRules } = FILTER_CONFIG;

async function fetchAndFilterEvents() {
  const client = await createDAVClient({
    ...CALDAV_CONFIG,
    authMethod: "Basic",
    defaultAccountType: "caldav",
  });

  const calendars = await client.fetchCalendars();

  // 并发获取所有日历的事件
  const calendarObjectsPromises = calendars.map((calendar) =>
    client.fetchCalendarObjects({ calendar })
  );

  const allCalendarObjects = (
    await Promise.all(calendarObjectsPromises)
  ).flat();

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

const getFilteredCal = async () => {
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
      organizer: e.organizer?.val,
    });
  }

  return cal;
};

try {
  console.log("### -> start targetFilteredCal");

  const cal = await getFilteredCal();

  console.log("### -> end targetFilteredCal");

  fs.writeFileSync("filtered.ics", cal.toString());
} catch (err) {
  console.error("Error:", err);
  process.exit(1);
}
