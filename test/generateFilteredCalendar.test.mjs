import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { generateFilteredCalendar } from "../index.mjs";

const FILTERS_ALLOW_ALL = {
  filter: {
    summary: [],
    description: [],
  },
};

const singleEventICS = `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Test Corp//EN\nBEGIN:VEVENT\nUID:single-event-1\nDTSTAMP:20240101T000000Z\nDTSTART:20240102T020000Z\nDTEND:20240102T030000Z\nSUMMARY:Non Recurring Meeting\nEND:VEVENT\nEND:VCALENDAR`;

const recurringEventICS = `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Test Corp//EN\nBEGIN:VEVENT\nUID:recurring-event-123\nDTSTAMP:20240101T000000Z\nDTSTART:20240103T040000Z\nDTEND:20240103T050000Z\nRRULE:FREQ=DAILY;COUNT=2\nSUMMARY:Recurring Planning\nEND:VEVENT\nEND:VCALENDAR`;

const recurringWithOverrideICS = `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Test Corp//EN\nBEGIN:VEVENT\nUID:recurring-override-456\nDTSTAMP:20240101T000000Z\nDTSTART:20240105T060000Z\nDTEND:20240105T070000Z\nRRULE:FREQ=DAILY;COUNT=2\nSUMMARY:Recurring With Override\nEND:VEVENT\nBEGIN:VEVENT\nUID:recurring-override-456\nDTSTAMP:20240102T000000Z\nDTSTART:20240106T080000Z\nDTEND:20240106T090000Z\nRECURRENCE-ID:20240106T060000Z\nSUMMARY:Recurring With Override\nEND:VEVENT\nEND:VCALENDAR`;

const assertUIDs = (icsText, expectedUIDs) => {
  const uidLines = icsText
    .split("\n")
    .map((line) => line.replace(/\r$/, ""))
    .filter((line) => line.startsWith("UID:"));

  assert.deepEqual(uidLines.sort(), expectedUIDs.sort());
};

describe("generateFilteredCalendar", () => {
  it("keeps single events' original UID", () => {
    const icsText = generateFilteredCalendar({
      calendarObjects: [{ data: singleEventICS }],
      filterConfig: FILTERS_ALLOW_ALL,
    });

    assertUIDs(icsText, ["UID:single-event-1"]);
  });

  it("creates deterministic UID per recurring occurrence", () => {
    const icsText = generateFilteredCalendar({
      calendarObjects: [{ data: recurringEventICS }],
      filterConfig: FILTERS_ALLOW_ALL,
    });

    assertUIDs(icsText, [
      "UID:recurring-event-123__20240103T040000Z",
      "UID:recurring-event-123__20240104T040000Z",
    ]);
  });

  it("uses recurrence-id for overridden instances", () => {
    const icsText = generateFilteredCalendar({
      calendarObjects: [{ data: recurringWithOverrideICS }],
      filterConfig: FILTERS_ALLOW_ALL,
    });

    assertUIDs(icsText, [
      "UID:recurring-override-456__20240105T060000Z",
      "UID:recurring-override-456__20240106T060000Z",
    ]);
  });

  it("generates stable output for the same source data", () => {
    const calendarObjects = [
      { data: singleEventICS },
      { data: recurringEventICS },
      { data: recurringWithOverrideICS },
    ];

    const first = generateFilteredCalendar({
      calendarObjects,
      filterConfig: FILTERS_ALLOW_ALL,
    });

    const second = generateFilteredCalendar({
      calendarObjects,
      filterConfig: FILTERS_ALLOW_ALL,
    });

    assert.equal(first, second);
  });
});
