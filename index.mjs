import { createDAVClient } from "tsdav";
import icalGen from "ical-generator";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ICAL = require("ical.js");
import fs from "node:fs";
import { fileURLToPath } from "url";
import { FILTER_CONFIG } from "./FILTER_CONFIG.mjs";

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);

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
  const calendarObjectsPromises = calendars.map((calendar) =>
    client.fetchCalendarObjects({ calendar })
  );
  const allCalendarObjects = (await Promise.all(calendarObjectsPromises)).flat();
  const filteredEvents = [];

  // 处理单个事件
  const processEvent = (event, startDate, endDate) => {
    if (startDate >= RANGE_START && endDate <= RANGE_END) {
      const item = {
        summary: event.summary,
        description: event.description,
        location: event.location,
        uid: event.uid,
        organizer: event.organizer?.val,
      };

      const isMatch = !filterFields.some((field) => {
        const value = item[field];
        return value && filterRules.some((rule) => {
          if (Array.isArray(rule[field])) {
            return rule[field].some((r) => value.includes(r));
          }
          return value.includes(rule[field]);
        });
      });

      if (isMatch) {
        filteredEvents.push({
          start: startDate,
          end: endDate,
          ...item,
        });
      }
    }
  };

  if (isDirectRun) {
    fs.writeFileSync("log/allCalendarObjects.json", JSON.stringify(allCalendarObjects, null, 2));
  }

  for (const obj of allCalendarObjects) {
    try {
      const jcalData = ICAL.parse(obj.data);
      const comp = new ICAL.Component(jcalData);
      const vevent = comp.getFirstSubcomponent("vevent");

      if (vevent) {
        const event = new ICAL.Event(vevent);

        if (event.isRecurring()) {
          // 获取已排除的日期
          const excludedDates = new Set();
          const exdates = vevent.getAllProperties("exdate");
          
          for (const exdate of exdates) {
            const value = exdate.getFirstValue();
            // 处理 UTC 时间（带 Z）
            if (value.toString().endsWith('Z')) {
              const time = value.toJSDate();
              // 转换为本地时间进行比较
              const localTime = new Date(time.getTime() + time.getTimezoneOffset() * 60000);
              excludedDates.add(localTime.toISOString().split('T')[0]);
            } else if (value.timezone) {
              // 处理带时区的情况
              const time = value.toJSDate();
              excludedDates.add(time.toISOString().split('T')[0]);
            } else {
              // 处理不带时区的情况
              excludedDates.add(value.toString().split('T')[0]);
            }
          }

          // 处理重复事件
          const iterator = event.iterator();
          let next;
          while ((next = iterator.next()) && next.toJSDate() <= RANGE_END) {
            const startDate = next.toJSDate();
            // 转换为本地时间进行比较
            const localStartDate = new Date(startDate.getTime() + startDate.getTimezoneOffset() * 60000);
            const startDateStr = localStartDate.toISOString().split('T')[0];
            
            if (!excludedDates.has(startDateStr)) {
              const endDate = event.getOccurrenceDetails(next).endDate.toJSDate();
              processEvent(event, startDate, endDate);
            }
          }
        } else {
          // 处理单次事件
          const startDate = event.startDate.toJSDate();
          const endDate = event.endDate.toJSDate();
          processEvent(event, startDate, endDate);
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


console.log("### -> isDirectRun", isDirectRun);

if (isDirectRun) {
  try {
    console.log("### -> start targetFilteredCal");
    const cal = await getFilteredCal();
    console.log("### -> end targetFilteredCal");
    fs.writeFileSync("log/filtered.ics", cal.toString());
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

