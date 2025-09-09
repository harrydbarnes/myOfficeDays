// Add console.log_debug to be no-op if not debugging
// global.console.log_debug = (...args) => { /* मौन */ };
// To enable debug logs for testing, uncomment the line below and comment the line above.
global.console.log_debug = console.log;

const pako = require('./pako.min.js');
const {
    getDefaultScheduleStructure,
    convertToCompactFormat,
    parseAndApplyShortcode,
    deduceAndDisplayPattern,
    isOfficeDayInternal,
    isFestiveBreak,
    isSummerHoursDay,
    generateICalData,
    isBankHoliday
} = require('./schedule_logic.js');


// --- Helper Functions ---
function generateScheduleToShare(activeScheduleData) {
    // This function creates the "full" data structure that convertToCompactFormat expects as input.
    // It's important that it mirrors the structure of `activeScheduleData` closely.
    const scheduleToShare = {
        name: activeScheduleData.name,
        selections: activeScheduleData.selections,
        patternType: activeScheduleData.patternType,
        patternAnchorDate: activeScheduleData.patternAnchorDate,
        // Crucially, include the full summerHours and festiveBreak objects if they exist,
        // including their 'enabled' status, for convertToCompactFormat to process.
        summerHours: activeScheduleData.summerHours,
        festiveBreak: activeScheduleData.festiveBreak,
    };
    return scheduleToShare;
}


// --- Test Runner and Assertions ---
let testsPassed = 0;
let testsFailed = 0;
const testResults = [];

function assert(condition, message) {
    if (condition) {
        testsPassed++;
        testResults.push(`PASS: ${message}`);
    } else {
        testsFailed++;
        testResults.push(`FAIL: ${message}`);
        console.error(`Assertion FAILED: ${message}`);
    }
}

function assertEqual(actual, expected, message) {
    assert(actual === expected, `${message} (Expected: ${expected}, Got: ${actual})`);
}

function assertDeepEqual(actual, expected, message) {
    const_str_actual = JSON.stringify(actual);
    const_str_expected = JSON.stringify(expected);
    assert(const_str_actual === const_str_expected, `${message} (Expected: ${const_str_expected}, Got: ${const_str_actual})`);
}


// --- Test Data and Execution ---

console.log("--- Starting Part 1: Valid Link Generation and Parsing ---");

// Test Case 1: Simple Schedule
let activeSchedule1 = getDefaultScheduleStructure("Test Simple");
activeSchedule1.patternType = 'constant';
activeSchedule1.selections.week1 = [1, 3, 5];
activeSchedule1.patternAnchorDate = "2024-01-01";

let fullScheduleToShare1 = generateScheduleToShare(activeSchedule1);
let compactScheduleToShare1 = convertToCompactFormat(fullScheduleToShare1);
let jsonString1 = JSON.stringify(compactScheduleToShare1);
const compressedData1 = pako.deflate(new TextEncoder().encode(jsonString1), { level: 9 });
const compressedBinaryString1 = String.fromCharCode.apply(null, compressedData1);
let shortcode1 = btoa(compressedBinaryString1);
let parsedResult1 = parseAndApplyShortcode(shortcode1, pako, atob, TextDecoder);

console.log_debug("Test 1 Compact Shortcode:", shortcode1);
console.log_debug("Test 1 Parsed Full:", JSON.stringify(parsedResult1));
console.log_debug("Test 1 Compact Data used for stringify:", JSON.stringify(compactScheduleToShare1));


assert(parsedResult1 && !parsedResult1.error, "Test 1.1: Simple schedule parses without error");
assertEqual(parsedResult1.name, "Test Simple", "Test 1.2: Name matches");
assertEqual(parsedResult1.patternType, 'constant', "Test 1.3: Pattern type matches");
assertDeepEqual(parsedResult1.selections.week1, [1, 3, 5], "Test 1.4: Selections match");
assertEqual(parsedResult1.summerHours.enabled, false, "Test 1.5: Summer hours disabled by default in compact if not present");
assertEqual(parsedResult1.festiveBreak.enabled, false, "Test 1.6: Festive break disabled by default in compact if not present");

// ... (rest of the existing tests) ...

// --- New Tests ---
console.log("\n--- Starting Part 6: New Tests for Business Logic ---");

// Test isBankHoliday
console.log("\n--- Testing isBankHoliday ---");
assert(isBankHoliday(new Date(2025, 0, 1)), "Test isBankHoliday: Jan 1st is a bank holiday");
assert(!isBankHoliday(new Date(2025, 0, 2)), "Test isBankHoliday: Jan 2nd is not a bank holiday");

// Test isFestiveBreak
console.log("\n--- Testing isFestiveBreak ---");
let festiveSchedule = getDefaultScheduleStructure("Festive Test");
festiveSchedule.festiveBreak.enabled = true;
festiveSchedule.festiveBreak.startDate = "2025-12-24";
festiveSchedule.festiveBreak.endDate = "2026-01-02";
assert(isFestiveBreak(new Date(2025, 11, 25), festiveSchedule), "Test isFestiveBreak: Christmas is a festive break day");
assert(!isFestiveBreak(new Date(2025, 11, 23), festiveSchedule), "Test isFestiveBreak: Dec 23rd is not a festive break day");

// Test isSummerHoursDay
console.log("\n--- Testing isSummerHoursDay ---");
let summerSchedule = getDefaultScheduleStructure("Summer Test");
summerSchedule.summerHours.enabled = true;
summerSchedule.summerHours.startDate = "2025-07-01";
summerSchedule.summerHours.endDate = "2025-07-31";
summerSchedule.summerHours.affectedDays = [5]; // Fridays
assert(isSummerHoursDay(new Date(2025, 6, 4), summerSchedule), "Test isSummerHoursDay: A Friday in July is a summer hours day");
assert(!isSummerHoursDay(new Date(2025, 6, 3), summerSchedule), "Test isSummerHoursDay: A Thursday in July is not a summer hours day");

// Test deduceAndDisplayPattern
console.log("\n--- Testing deduceAndDisplayPattern ---");
let pattern = deduceAndDisplayPattern(['2025-01-06']); // A Monday
assertEqual(pattern.patternType, 'constant_single_day', "Test deduceAndDisplayPattern: Single day is constant_single_day");
assertDeepEqual(pattern.selections.week1, [1], "Test deduceAndDisplayPattern: Single day selection is correct");

pattern = deduceAndDisplayPattern(['2025-01-06', '2025-01-08']); // Mon, Wed
assertEqual(pattern.patternType, 'constant', "Test deduceAndDisplayPattern: Two days in same week is constant");
assertDeepEqual(pattern.selections.week1, [1, 3], "Test deduceAndDisplayPattern: Two days selection is correct");

pattern = deduceAndDisplayPattern(['2025-01-06', '2025-01-13']); // Two consecutive Mondays
assertEqual(pattern.patternType, 'constant_single_day', "Test deduceAndDisplayPattern: Two consecutive Mondays is constant_single_day");

pattern = deduceAndDisplayPattern(['2025-01-06', '2025-01-14']); // Mon, then next Tue
assertEqual(pattern.patternType, 'custom_4_week', "Test deduceAndDisplayPattern: Mon then Tue is custom_4_week pattern");

pattern = deduceAndDisplayPattern(['2025-01-06', '2025-01-20']); // Mon, then Mon after 2 weeks
assertEqual(pattern.patternType, 'constant_single_day', "Test deduceAndDisplayPattern: Mon, then Mon after 2 weeks is constant_single_day pattern");

// Test isOfficeDayInternal
console.log("\n--- Testing isOfficeDayInternal ---");
let officeDaySchedule = getDefaultScheduleStructure("Office Day Test");
officeDaySchedule.patternType = 'constant';
officeDaySchedule.patternAnchorDate = '2025-01-06';
officeDaySchedule.selections.week1 = [1, 3, 5];
assert(isOfficeDayInternal(new Date(2025, 0, 6), officeDaySchedule), "Test isOfficeDayInternal: Monday is office day in constant pattern");
assert(!isOfficeDayInternal(new Date(2025, 0, 7), officeDaySchedule), "Test isOfficeDayInternal: Tuesday is not office day in constant pattern");

// Test generateICalData
console.log("\n--- Testing generateICalData ---");
let iCalSchedule = getDefaultScheduleStructure("iCal Test");
iCalSchedule.patternType = 'constant_single_day';
iCalSchedule.patternAnchorDate = '2025-01-06'; // A Monday
iCalSchedule.selections.week1 = [1];
let iCalData = generateICalData(iCalSchedule);
assert(iCalData.includes("SUMMARY:In Office"), "Test generateICalData: Contains 'In Office' summary");
assert(iCalData.includes("DTSTART;VALUE=DATE:2025"), "Test generateICalData: Contains a start date in 2025");
assert(iCalData.includes("BEGIN:VCALENDAR"), "Test generateICalData: Starts with BEGIN:VCALENDAR");
assert(iCalData.includes("END:VCALENDAR"), "Test generateICalData: Ends with END:VCALENDAR");


// --- Final Summary ---
console.log("\n--- Final Test Execution Summary ---");
testResults.forEach(res => console.log(res.startsWith("FAIL") ? `\x1b[31m${res}\x1b[0m` : `\x1b[32m${res}\x1b[0m`)); // Add color
console.log(`\nTotal Tests: ${testsPassed + testsFailed}, Passed: ${testsPassed}, Failed: ${testsFailed}`);

if (testsFailed > 0) {
    process.exit(1); // Indicate failure for CI environments
}
