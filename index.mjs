import { createDAVClient } from "tsdav";
import icalGen from "ical-generator";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ICAL = require("ical.js");
import fs from "node:fs";
import { fileURLToPath } from "url";

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
      let parsedEvent = null;

      // 使用 ical.js 解析
      const jcalData = ICAL.parse(obj.data);
      const comp = new ICAL.Component(jcalData);
      const vevent = comp.getFirstSubcomponent("vevent");

      if (vevent) {
        parsedEvent = new ICAL.Event(vevent);

        // 处理事件（重复和非重复）
        const processEvent = (startDate, endDate) => {
          if (startDate >= RANGE_START && endDate <= RANGE_END) {
            let isMatch = true;
            const item = {
              summary: parsedEvent.summary,
              description: parsedEvent.description,
              location: parsedEvent.location,
              uid: parsedEvent.uid,
              organizer: parsedEvent.organizer?.val,
            };

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
                start: startDate,
                end: endDate,
                summary: item.summary,
                description: item.description,
                location: item.location,
                uid: item.uid,
                organizer: item.organizer?.val,
              });
            }
          }
        };

        // 处理重复事件
        if (parsedEvent.isRecurring()) {
          const iterator = parsedEvent.iterator();
          let next;

          while ((next = iterator.next()) && next.toJSDate() <= RANGE_END) {
            const startDate = next.toJSDate();
            const endDate = parsedEvent
              .getOccurrenceDetails(next)
              .endDate.toJSDate();
            processEvent(startDate, endDate);
          }
        } else {
          // 处理非重复事件
          const startDate = parsedEvent.startDate.toJSDate();
          const endDate = parsedEvent.endDate.toJSDate();
          processEvent(startDate, endDate);
        }
      }
    } catch (err) {
      console.log("⚠️ Failed to parse calendar object:", err);
    }
  }

  return filteredEvents;
}

export const getFilteredCal = async () => {
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

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);

console.log("### -> isDirectRun", isDirectRun);

if (isDirectRun) {
  try {
    console.log("### -> start targetFilteredCal");

    const cal = await getFilteredCal();

    console.log("### -> end targetFilteredCal");

    fs.writeFileSync("filtered.ics", cal.toString());
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

