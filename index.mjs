import { createDAVClient } from "tsdav";
import icalGen from "ical-generator";
import fs from "fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ICAL = require("ical.js");
import { FILTER_CONFIG } from "./FILTER_CONFIG.mjs";
import { fileURLToPath } from "url";

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);

// // 设置时间范围（展开重复事件时必须）
// const RANGE_START = FILTER_CONFIG.range.start;
// const RANGE_END = FILTER_CONFIG.range.end;

// 读取 .env 文件中的配置
const localEnv = require("dotenv").config();

let CALDAV_USERNAME = localEnv.parsed.USERNAME;
let CALDAV_PASSWORD = localEnv.parsed.PASSWORD;
let CALDAV_SERVER_URL = localEnv.parsed.URL;

const CALDAV_CONFIG = {
  serverUrl: CALDAV_SERVER_URL,
  credentials: {
    username: CALDAV_USERNAME,
    password: CALDAV_PASSWORD,
  },
};

console.log("### -> CALDAV_CONFIG", CALDAV_CONFIG);

export async function getFilteredCal({ filterConfig }) {
  const getIsMatch = ({ summary, description }) => {
    const { filter } = filterConfig;

    if (!summary) {
      return false;
    }

    // 没法判断，因为在群组里面的人拿不到状态
    // if (accepted) {
    //   return true;
    // }

    // 过滤 summary
    if (
      filter.summary.some((item) => {
        return summary.includes(item);
      })
    ) {
      return false;
    }

    // 过滤 description
    if (
      description &&
      filter.description.some((item) => {
        return description.includes(item);
      })
    ) {
      return false;
    }

    //   const declined = event.component
    //     ?.getAllProperties("attendee")
    //     ?.some((p) => p.getParameter("partstat") === "DECLINED");

    //   if (declined) {
    //     return false;
    //   }

    return true;
  };

  const client = await createDAVClient({
    serverUrl: "https://caldav.larkoffice.com",
    credentials: { username: "caijin", password: "6RoWeALZjj" },
    authMethod: "Basic",
    defaultAccountType: "caldav",
  });

  const calendars = await client.fetchCalendars();
  const objects = await client.fetchCalendarObjects({ calendar: calendars[0] });

  const cal = icalGen({ name: "Filtered CalDAV" });

  const calCreateEvent = (event) => {
    if (
      getIsMatch({
        summary: event.summary,
        description: event.description,
      })
    ) {
      cal.createEvent({
        ...event,
        id: event.uid,
      });
    }
  };

  for (const obj of objects) {
    try {
      const jcal = ICAL.parse(obj.data);
      const comp = new ICAL.Component(jcal);
      const vevents = comp.getAllSubcomponents("vevent");

      const eventsByUID = {};
      for (const v of vevents) {
        const e = new ICAL.Event(v);
        const uid = e.uid;
        if (!eventsByUID[uid])
          eventsByUID[uid] = { master: null, overrides: [] };
        if (e.recurrenceId) {
          eventsByUID[uid].overrides.push(e);
        } else {
          eventsByUID[uid].master = e;
        }
      }

      for (const { master, overrides } of Object.values(eventsByUID)) {
        if (!master && overrides.length > 0) {
          // fallback：只处理单个 override，不展开 recurrence
          for (const o of overrides) {
            const eventObj = {
              start: o.startDate.toJSDate(),
              end: o.endDate.toJSDate(),
              summary: o.summary,
              description: o.description,
              uid: o.uid,
              location: o.component.getFirstPropertyValue("location"),
            };

            if (getIsMatch(eventObj)) {
              calCreateEvent(eventObj);
            }
          }
          continue;
        }

        const exdates = new Set(
          master.component
            .getAllProperties("exdate")
            .map((p) => p.getFirstValue().toJSDate().toISOString())
        );

        if (master.isRecurring()) {
          const recurExpansion = new ICAL.RecurExpansion({
            component: master.component,
            dtstart: master.startDate,
          });

          let next;
          while ((next = recurExpansion.next())) {
            const dt = next.toJSDate();
            if (dt > new Date("2025-12-31")) break;
            if (exdates.has(dt.toISOString())) continue;

            const override = overrides.find(
              (o) => o.recurrenceId.compare(next) === 0
            );
            const e = override || master;

            if (override) {
              calCreateEvent({
                start: override.startDate.toJSDate(),
                end: override.endDate.toJSDate(),
                summary: override.summary,
                description: override.description,
                uid: override.uid,
                location: override.component.getFirstPropertyValue("location"),
              });
            } else {
              calCreateEvent({
                start: dt,
                end: new Date(
                  dt.getTime() +
                    (master.endDate.toJSDate() - master.startDate.toJSDate())
                ),
                summary: master.summary,
                description: master.description,
                // uid: master.uid,
                location: master.component.getFirstPropertyValue("location"),
              });
            }
          }
        } else {
          // 单次非重复事件
          calCreateEvent({
            start: master.startDate.toJSDate(),
            end: master.endDate.toJSDate(),
            summary: master.summary,
            description: master.description,
            uid: master.uid,
            location: master.component.getFirstPropertyValue("location"),
          });
        }
      }
    } catch (err) {
      console.error("⚠️ Error processing calendar object:", err);
    }
  }

  return cal.toString();
}

console.log("### -> isDirectRun", isDirectRun);

if (isDirectRun) {
  try {
    console.log("### -> start targetFilteredCal");

    const calFiltered = await getFilteredCal({
      filterConfig: FILTER_CONFIG,
    });
    fs.writeFileSync("log/filtered.ics", calFiltered);

    console.log("### -> end targetFilteredCal");
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}
