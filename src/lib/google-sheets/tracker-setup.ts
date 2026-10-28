import type { Snapshot } from "./rows";
import { cellValue } from "./training-plan";
import {
  cellUpdate,
  logWriteRequests,
  roadmapWriteRequests,
  type TrackerState,
} from "./tracker";
import { AppError } from "../server/errors";

export function trackerSetupRequests(snapshot: Snapshot, state: TrackerState) {
  if (!snapshot.trainingPlan)
    throw new AppError("Connect Training Plan first.", 409);
  const plan = snapshot.trainingPlan.grid;
  const requests: unknown[] = [
    ...logWriteRequests(snapshot, [], state),
    ...roadmapWriteRequests(snapshot, [], state, true),
  ];
  // Three calculated source columns make native dashboard formulas follow the
  // same type, optional flag and retained reschedule status as the web parser.
  const names = ["PE_Sport", "PE_Optional", "PE_Status"];
  for (let i = 0; i < 3; i++) {
    if (
      cellValue(plan.rows[0]?.[16 + i]) !== "" &&
      cellValue(plan.rows[0]?.[16 + i]) !== names[i]
    )
      throw new AppError(
        "Training Plan dashboard helper columns are occupied.",
        409,
      );
    if (
      cellValue(plan.rows[0]?.[16 + i]) === "" &&
      plan.rows.slice(1).some((r) => cellValue(r[16 + i]) !== "")
    )
      throw new AppError(
        "Training Plan dashboard helper cells contain data.",
        409,
      );
    const u = cellUpdate(plan, 0, 16 + i, names[i]);
    if (u) requests.push(u);
  }
  const typed = `IF(IFERROR(REGEXEXTRACT(P2:P,"""sourceSession"":""([^""]+)"""),"")=C2:C,IFERROR(REGEXEXTRACT(P2:P,"""type"":""([^""]+)"""),C2:C),C2:C)`;
  const helpers = [
    `=ARRAYFORMULA(IF(A2:A="","",IF(REGEXMATCH(${typed},"(?i)run|interval"),"running",IF(REGEXMATCH(${typed},"(?i)cycl|bike|b2w"),"cycling",IF(REGEXMATCH(${typed},"(?i)^rest|^recovery"),"rest","other")))))`,
    `=ARRAYFORMULA(IF(A2:A="","",IF((H2:H="Optional")+(H2:H="Tentative"),TRUE,IF(REGEXMATCH(H2:H,"^(Completed|Skipped|Modified|Partially Completed)$"),IFERROR(REGEXEXTRACT(P2:P,"""optional"":(true|false)")="true",FALSE),FALSE))))`,
    `=ARRAYFORMULA(IF(A2:A="","",IF((H2:H="Skipped")*IFERROR(REGEXEXTRACT(P2:P,"""planStatus"":""([^""]+)""")="Rescheduled",FALSE),"Rescheduled",IF(H2:H="Modified","Partially Completed",IF((H2:H="Optional")+(H2:H="Tentative"),"Planned",H2:H)))))`,
  ];
  const formula = (
    sheetId: number,
    rowIndex: number,
    columnIndex: number,
    formulaValue: string,
  ) => ({
    updateCells: {
      start: { sheetId, rowIndex, columnIndex },
      rows: [{ values: [{ userEnteredValue: { formulaValue } }] }],
      fields: "userEnteredValue",
    },
  });
  helpers.forEach((f, i) => requests.push(formula(plan.sheetId, 1, 16 + i, f)));
  const end = "",
    le = "";
  const dates = (tab: string, n: string) =>
    `IF(ISNUMBER('${tab}'!A2:A${n}),'${tab}'!A2:A${n},IFERROR(DATEVALUE('${tab}'!A2:A${n}),0))`;
  const bounds = (tab: string, n: string) =>
    `(${dates(tab, n)}>=$B$10)*(${dates(tab, n)}<=$B$11)`;
  const active = `${bounds("Training Plan", end)}*('Training Plan'!Q2:Q${end}<>"rest")*('Training Plan'!S2:S${end}<>"Rescheduled")`;
  const required = `${active}*('Training Plan'!R2:R${end}=FALSE)`;
  const formulas = new Map([
    [2, `=TEXT(B10,"yyyy-mm-dd")&" to "&TEXT(B11,"yyyy-mm-dd")`],
    [3, `=SUMPRODUCT(${active}*('Training Plan'!S2:S${end}="Completed"))`],
    [4, `=SUMPRODUCT(${active})`],
    [
      5,
      `=SUMPRODUCT(${active}*('Training Plan'!Q2:Q${end}="running")*('Training Plan'!S2:S${end}="Completed"))`,
    ],
    [
      6,
      `=SUMPRODUCT(${bounds("Workout Log", le)}*('Workout Log'!M2:M${le}=TRUE)*('Workout Log'!N2:N${le}="running")*IFERROR('Workout Log'!C2:C${le}*1,0))`,
    ],
    [
      7,
      `=IFERROR(MAX(FILTER('Workout Log'!C2:C${le},${dates("Workout Log", le)}>=$B$10,${dates("Workout Log", le)}<=$B$11,'Workout Log'!M2:M${le}=TRUE,'Workout Log'!N2:N${le}="running")),0)`,
    ],
    [9, `=TODAY()-WEEKDAY(TODAY(),2)+1`],
    [10, `=B10+6`],
    [
      11,
      `=IFERROR(SUMPRODUCT(${required}*('Training Plan'!S2:S${end}="Completed"))/SUMPRODUCT(${required}),"")`,
    ],
  ]);
  for (const [row, f] of formulas)
    requests.push(formula(state.dashboard.sheetId, row, 1, f));
  for (const [row, label] of [
    [4, "Scheduled sessions"],
    [7, "Longest recorded run km"],
    [9, "Week starts (WIB)"],
    [10, "Week ends (WIB)"],
    [11, "Training consistency"],
  ] as const) {
    const u = cellUpdate(state.dashboard, row, 0, label);
    if (u) requests.push(u);
  }
  requests.push({
    repeatCell: {
      range: {
        sheetId: state.dashboard.sheetId,
        startRowIndex: 9,
        endRowIndex: 11,
        startColumnIndex: 1,
        endColumnIndex: 2,
      },
      cell: {
        userEnteredFormat: {
          numberFormat: { type: "DATE", pattern: "yyyy-mm-dd" },
        },
      },
      fields: "userEnteredFormat.numberFormat",
    },
  });
  requests.push({
    repeatCell: {
      range: {
        sheetId: state.dashboard.sheetId,
        startRowIndex: 11,
        endRowIndex: 12,
        startColumnIndex: 1,
        endColumnIndex: 2,
      },
      cell: {
        userEnteredFormat: { numberFormat: { type: "PERCENT", pattern: "0%" } },
      },
      fields: "userEnteredFormat.numberFormat",
    },
  });
  requests.push({
    updateSpreadsheetProperties: {
      properties: { timeZone: "Asia/Jakarta" },
      fields: "timeZone",
    },
  });
  return requests;
}
