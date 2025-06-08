// Add console.log_debug to be no-op if not debugging
// global.console.log_debug = (...args) => { /* मौन */ };
// To enable debug logs for testing, uncomment the line below and comment the line above.
global.console.log_debug = console.log;

const pako = require('./pako.min.js');

// --- Polyfills/Mocks ---
// Mock Pako for testing environment if actual pako.min.js is not loaded
/*
const pako = {
    deflate: function(data, options) {
        // Identity function for testing logic flow
        console.log_debug("Mock pako.deflate called");
        if (options && options.to === 'string') {
            // Simulate binary string output: ensure char codes are within byte range
            // For simplicity in mock, we just return the string as is.
            // A true binary string might require mapping to valid byte char codes.
            return data;
        }
        // If not 'string', pako usually returns Uint8Array.
        // For mock, returning string; actual pako would need Uint8Array input too.
        const encoder = new TextEncoder();
        return encoder.encode(data); // Return as Uint8Array if not to string
    },
    inflate: function(data, options) {
        // Identity function for testing logic flow
        console.log_debug("Mock pako.inflate called");
        if (options && options.to === 'string') {
            if (data instanceof Uint8Array) {
                const decoder = new TextDecoder();
                return decoder.decode(data);
            }
            return data; // Should be a string already if converted from atob's output
        }
        // If not to 'string', pako usually expects to return Uint8Array
        if (typeof data === 'string') {
             const encoder = new TextEncoder();
             return encoder.encode(data);
        }
        return data;
    },
    // Add a dummy Z_OK if any internal logic might check for it (not in current code)
    Z_OK: 0
};
*/

// btoa and atob are usually available in modern Node.js (v16+) globally.
// If running in an older Node or specific environment where they aren't:
if (typeof btoa === 'undefined') {
    global.btoa = function(str) {
        console.log_debug("Mock btoa called");
        return Buffer.from(str, 'binary').toString('base64');
    };
}
if (typeof atob === 'undefined') {
    global.atob = function(b64Encoded) {
        console.log_debug("Mock atob called");
        return Buffer.from(b64Encoded, 'base64').toString('binary');
    };
}

// --- Functions extracted from index.html ---

function getDefaultScheduleStructure(name = "") {
    const currentYear = new Date().getFullYear();
    const todayForDefaults = new Date();

    let currentWeekMonday = new Date(todayForDefaults);
    currentWeekMonday.setDate(todayForDefaults.getDate() - ( (todayForDefaults.getDay() + 6) % 7) );

    return {
        name: name,
        selections: { week1: [], week2: [], week3: [], week4: [] },
        patternType: 'none',
        patternAnchorDate: null, // Should be YYYY-MM-DD
        patternDescription: "No schedule set.", // Only used locally, not shared
        summerHours: {
            enabled: false,
            startDate: currentWeekMonday.toISOString().split('T')[0],
            endDate: `${currentYear}-08-29`,
            affectedDays: [5],
            finishTime: "15:00"
        },
        festiveBreak: {
            enabled: false,
            startDate: `${currentYear}-12-25`,
            endDate: `${currentYear + 1}-01-01`
        },
        // loadedFromShareLink: false // This is a local runtime flag, not shared
    };
}

// Compact format mapping (copied from index.html)
const patternTypeToNum = { "none": 0, "constant": 1, "ab": 2, "aa_bb": 3, "abba": 4, "custom_4_week": 5, "constant_single_day": 6 };
const numToPatternType = Object.fromEntries(Object.entries(patternTypeToNum).map(([k, v]) => [v, k]));

function convertToCompactFormat(scheduleData) {
    if (!scheduleData) return null;
    const compact = {
        n: scheduleData.name,
        pt: patternTypeToNum[scheduleData.patternType] !== undefined ? patternTypeToNum[scheduleData.patternType] : 0,
        paD: scheduleData.patternAnchorDate ? scheduleData.patternAnchorDate.replace(/-/g, "") : null,
    };

    const selections = scheduleData.selections || {};
    const weekKeys = ['week1', 'week2', 'week3', 'week4'];
    compact.sL = weekKeys.map(wk => (selections[wk] || []).join("")).join("|");

    if (scheduleData.summerHours && scheduleData.summerHours.enabled) {
        compact.sH = {
            e: 1, // true
            sD: scheduleData.summerHours.startDate ? scheduleData.summerHours.startDate.replace(/-/g, "") : null,
            eD: scheduleData.summerHours.endDate ? scheduleData.summerHours.endDate.replace(/-/g, "") : null,
            fT: scheduleData.summerHours.finishTime ? scheduleData.summerHours.finishTime.replace(":", "") : null,
            aD: (scheduleData.summerHours.affectedDays || []).join("")
        };
    }

    if (scheduleData.festiveBreak && scheduleData.festiveBreak.enabled) {
        compact.fB = {
            e: 1, // true
            sD: scheduleData.festiveBreak.startDate ? scheduleData.festiveBreak.startDate.replace(/-/g, "") : null,
            eD: scheduleData.festiveBreak.endDate ? scheduleData.festiveBreak.endDate.replace(/-/g, "") : null
        };
    }
    return compact;
}

function convertFromCompactFormat(compactData) {
    if (!compactData) return null;

    const fullSchedule = getDefaultScheduleStructure(compactData.n || "");

    fullSchedule.name = compactData.n || "Shared Schedule";
    fullSchedule.patternType = numToPatternType[compactData.pt] || 'none';
    if (compactData.paD && typeof compactData.paD === 'string' && compactData.paD.length === 8) {
        fullSchedule.patternAnchorDate = `${compactData.paD.substring(0,4)}-${compactData.paD.substring(4,6)}-${compactData.paD.substring(6,8)}`;
    } else {
        fullSchedule.patternAnchorDate = null;
    }

    if (typeof compactData.sL === 'string') {
        const weekStrings = compactData.sL.split('|');
        const weekKeys = ['week1', 'week2', 'week3', 'week4'];
        weekKeys.forEach((wk, index) => {
            if (weekStrings[index]) {
                fullSchedule.selections[wk] = weekStrings[index].split("").map(d => parseInt(d, 10)).filter(d => !isNaN(d));
            } else {
                fullSchedule.selections[wk] = [];
            }
        });
    } else {
         fullSchedule.selections = { week1: [], week2: [], week3: [], week4: [] };
    }

    if (compactData.sH) {
        fullSchedule.summerHours.enabled = true;
        if (compactData.sH.sD && typeof compactData.sH.sD === 'string' && compactData.sH.sD.length === 8) {
            fullSchedule.summerHours.startDate = `${compactData.sH.sD.substring(0,4)}-${compactData.sH.sD.substring(4,6)}-${compactData.sH.sD.substring(6,8)}`;
        }
        if (compactData.sH.eD && typeof compactData.sH.eD === 'string' && compactData.sH.eD.length === 8) {
            fullSchedule.summerHours.endDate = `${compactData.sH.eD.substring(0,4)}-${compactData.sH.eD.substring(4,6)}-${compactData.sH.eD.substring(6,8)}`;
        }
        if (compactData.sH.fT && typeof compactData.sH.fT === 'string' && compactData.sH.fT.length === 4) {
            fullSchedule.summerHours.finishTime = `${compactData.sH.fT.substring(0,2)}:${compactData.sH.fT.substring(2,4)}`;
        }
        if (typeof compactData.sH.aD === 'string') {
            fullSchedule.summerHours.affectedDays = compactData.sH.aD.split("").map(d => parseInt(d, 10)).filter(d => !isNaN(d));
        } else {
            fullSchedule.summerHours.affectedDays = [];
        }
    } else {
        fullSchedule.summerHours.enabled = false;
    }

    if (compactData.fB) {
        fullSchedule.festiveBreak.enabled = true;
         if (compactData.fB.sD && typeof compactData.fB.sD === 'string' && compactData.fB.sD.length === 8) {
            fullSchedule.festiveBreak.startDate = `${compactData.fB.sD.substring(0,4)}-${compactData.fB.sD.substring(4,6)}-${compactData.fB.sD.substring(6,8)}`;
        }
        if (compactData.fB.eD && typeof compactData.fB.eD === 'string' && compactData.fB.eD.length === 8) {
            fullSchedule.festiveBreak.endDate = `${compactData.fB.eD.substring(0,4)}-${compactData.fB.eD.substring(4,6)}-${compactData.fB.eD.substring(6,8)}`;
        }
    } else {
        fullSchedule.festiveBreak.enabled = false;
    }
    fullSchedule.patternDescription = "Shared schedule loaded."; // Or derive more accurately if needed
    return fullSchedule;
}


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

function parseAndApplyShortcode(encodedShortcode) {
    if (typeof encodedShortcode !== 'string') { // Optional: a type check for robustness
        // console.error("encodedShortcode is not a string:", encodedShortcode);
        return { error: true, stage: 'input_validation', message: 'Input shortcode is not a string.' };
    }
    encodedShortcode = encodedShortcode.replace(/\s/g, ''); // Sanitize

    // Constants for user links to add specific logging (REMOVED after diagnostics)
    // const USER_LINK_1_SHORTCODE = "eNqrVspTslJKLE5R0lEqKFGyMgVSiS5AISMDI1MDMwMjoHixD5BvWGNUU6NUCwAq+gw8";
    // const USER_LINK_2_SHORTCODE = "eNqrVspTslJKLE6BICUdpYISJStjIJXoApQwMjAyNTAzMAKKF/sA+MamNSBsaGQCwkq1ADq6EKk=";

    // if (encodedShortcode === USER_LINK_2_SHORTCODE) {
    //     console.log_debug("UserLink2 encodedShortcode:", encodedShortcode);
    // }

    let compressedData;
    try {
        const binaryString = atob(encodedShortcode);
        // if (encodedShortcode === USER_LINK_2_SHORTCODE) {
        //     console.log_debug("UserLink2 binaryString length:", binaryString.length, "First chars:", binaryString.charCodeAt(0), binaryString.charCodeAt(1), binaryString.charCodeAt(2));
        // }
        compressedData = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            compressedData[i] = binaryString.charCodeAt(i);
        }
        // if (encodedShortcode === USER_LINK_2_SHORTCODE) {
        //     console.log_debug("UserLink2 compressedData length:", compressedData.length, "First bytes:", compressedData[0], compressedData[1], compressedData[2]);
        // }
    } catch (e) {
        // console.error("Shortcode decode fail (atob/binary conversion):", e);
        return { error: true, stage: 'decoding', message: 'Link data is not correctly encoded.' };
    }

    let jsonString;
    try {
        // First, decompress to Uint8Array
        const decompressedBytes = pako.inflate(compressedData);

        // Check if decompression returned undefined or empty for non-empty input
        if (decompressedBytes === undefined || (compressedData.length > 0 && decompressedBytes.length === 0)) {
            // console.error("Pako.inflate (to Uint8Array) returned undefined or empty. Shortcode:", encodedShortcode, "Input compressedData length:", compressedData.length);
            return { error: true, stage: 'decompression_bytes', message: 'Decompression to bytes failed or yielded empty/undefined result.' };
        }

        // Manually decode UTF-8 Uint8Array to string
        // In Node.js environment for tests, TextDecoder is available globally.
        jsonString = new TextDecoder().decode(decompressedBytes);

    } catch (e) {
        // console.error("Pako.inflate (to Uint8Array) or TextDecoder construction/decode failed. Shortcode:", encodedShortcode, "Error:", e);
        let userMessage = 'Decompression or string decoding failed.';
        if (e && e.message && e.message.toLowerCase().includes('pako') || (e.name && e.name.toLowerCase().includes('pako'))) {
            userMessage = 'Link data appears corrupted (Pako error during decompression to bytes).';
        } else if (e && e.message && e.message.toLowerCase().includes('utf-8')) {
            userMessage = 'Failed to decode link data (UTF-8 decoding error).';
        }
        return { error: true, stage: 'decompression_manual_decode', message: userMessage, originalError: e };
    }

    let compactJson;
    try {
        compactJson = JSON.parse(jsonString);
        // if (encodedShortcode === USER_LINK_1_SHORTCODE) {
        //     console.log_debug("UserLink1 compactJson:", JSON.stringify(compactJson));
        // }
    } catch (e) {
        // console.error("Shortcode JSON parse fail:", e);
        return { error: true, stage: 'parsing', message: 'Link data format is invalid.' };
    }

    const fullScheduleData = convertFromCompactFormat(compactJson);
    // if (encodedShortcode === USER_LINK_1_SHORTCODE) {
    //     console.log_debug("UserLink1 fullScheduleData:", JSON.stringify(fullScheduleData));
    // }

    if (!fullScheduleData) {
        return { error: true, stage: 'validation', message: 'Failed to process shared link data (compact conversion failed).' };
    }

    // Validate the reconstructed fullScheduleData
    if (!fullScheduleData.name || typeof fullScheduleData.name !== 'string' ||
        !fullScheduleData.patternType || typeof fullScheduleData.patternType !== 'string' ||
        !fullScheduleData.selections || typeof fullScheduleData.selections !== 'object' ||
        (fullScheduleData.patternType !== 'none' && !fullScheduleData.patternAnchorDate) ||
        !fullScheduleData.summerHours || typeof fullScheduleData.summerHours !== 'object' ||
        !fullScheduleData.festiveBreak || typeof fullScheduleData.festiveBreak !== 'object') {
        // console.error("Invalid data structure in reconstructed shared schedule:", fullScheduleData);
        return { error: true, stage: 'validation', message: 'Link data has an unexpected structure after compact conversion.' };
    }
    return fullScheduleData;
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
let parsedResult1 = parseAndApplyShortcode(shortcode1);

console.log_debug("Test 1 Compact Shortcode:", shortcode1);
console.log_debug("Test 1 Parsed Full:", JSON.stringify(parsedResult1));
console.log_debug("Test 1 Compact Data used for stringify:", JSON.stringify(compactScheduleToShare1));


assert(parsedResult1 && !parsedResult1.error, "Test 1.1: Simple schedule parses without error");
assertEqual(parsedResult1.name, "Test Simple", "Test 1.2: Name matches");
assertEqual(parsedResult1.patternType, 'constant', "Test 1.3: Pattern type matches");
assertDeepEqual(parsedResult1.selections.week1, [1, 3, 5], "Test 1.4: Selections match");
assertEqual(parsedResult1.summerHours.enabled, false, "Test 1.5: Summer hours disabled by default in compact if not present");
assertEqual(parsedResult1.festiveBreak.enabled, false, "Test 1.6: Festive break disabled by default in compact if not present");

// Test Case 2: Schedule with Summer Hours
let activeSchedule2 = getDefaultScheduleStructure("Test Summer");
activeSchedule2.patternType = 'ab';
activeSchedule2.selections.week1 = [1,2];
activeSchedule2.selections.week2 = [4,5];
activeSchedule2.patternAnchorDate = "2024-01-01";
activeSchedule2.summerHours = { // Ensure this structure matches what convertToCompactFormat expects for enabled sH
    enabled: true,
    startDate: "2024-06-01",
    endDate: "2024-08-31",
    finishTime: "14:00",
    affectedDays: [5]
};

let fullScheduleToShare2 = generateScheduleToShare(activeSchedule2);
let compactScheduleToShare2 = convertToCompactFormat(fullScheduleToShare2);
let jsonString2 = JSON.stringify(compactScheduleToShare2);
const compressedData2 = pako.deflate(new TextEncoder().encode(jsonString2), { level: 9 });
const compressedBinaryString2 = String.fromCharCode.apply(null, compressedData2);
let shortcode2 = btoa(compressedBinaryString2);
let parsedResult2 = parseAndApplyShortcode(shortcode2);

console.log_debug("Test 2 Parsed Full:", JSON.stringify(parsedResult2));
console.log_debug("Test 2 Compact Data used for stringify:", JSON.stringify(compactScheduleToShare2));

assert(parsedResult2 && !parsedResult2.error, "Test 2.1: Summer schedule parses without error");
assertEqual(parsedResult2.name, "Test Summer", "Test 2.2: Name matches");
assertEqual(parsedResult2.patternType, 'ab', "Test 2.3: Pattern type matches");
assertDeepEqual(parsedResult2.selections.week1, [1,2], "Test 2.4: Selections week1 match");
assertEqual(parsedResult2.summerHours.enabled, true, "Test 2.5: Summer hours enabled from compact");
assertEqual(parsedResult2.summerHours.startDate, "2024-06-01", "Test 2.6: Summer start date matches from compact");
assertEqual(parsedResult2.summerHours.finishTime, "14:00", "Test 2.7: Summer finish time matches from compact");
assertDeepEqual(parsedResult2.summerHours.affectedDays, [5], "Test 2.8: Summer affected days match from compact");
assertEqual(parsedResult2.festiveBreak.enabled, false, "Test 2.9: Festive break disabled by default in compact");


// Test Case 3: Schedule with Festive Break
let activeSchedule3 = getDefaultScheduleStructure("Test Festive");
activeSchedule3.patternType = 'custom_4_week';
activeSchedule3.selections = { week1: [1], week2: [2], week3: [3], week4: [4] };
activeSchedule3.patternAnchorDate = "2024-01-01";
activeSchedule3.festiveBreak = {
    enabled: true,
    startDate: "2024-12-20",
    endDate: "2025-01-05"
};

let fullScheduleToShare3 = generateScheduleToShare(activeSchedule3);
let compactScheduleToShare3 = convertToCompactFormat(fullScheduleToShare3);
let jsonString3 = JSON.stringify(compactScheduleToShare3);
const compressedData3 = pako.deflate(new TextEncoder().encode(jsonString3), { level: 9 });
const compressedBinaryString3 = String.fromCharCode.apply(null, compressedData3);
let shortcode3 = btoa(compressedBinaryString3);
let parsedResult3 = parseAndApplyShortcode(shortcode3);

console.log_debug("Test 3 Parsed Full:", JSON.stringify(parsedResult3));
console.log_debug("Test 3 Compact Data used for stringify:", JSON.stringify(compactScheduleToShare3));

assert(parsedResult3 && !parsedResult3.error, "Test 3.1: Festive schedule parses without error");
assertEqual(parsedResult3.name, "Test Festive", "Test 3.2: Name matches");
assertEqual(parsedResult3.patternType, 'custom_4_week', "Test 3.3: Pattern type matches");
assertDeepEqual(parsedResult3.selections.week3, [3], "Test 3.4: Selections match");
assertEqual(parsedResult3.summerHours.enabled, false, "Test 3.5: Summer hours disabled by default in compact");
assertEqual(parsedResult3.festiveBreak.enabled, true, "Test 3.6: Festive break enabled from compact");
assertEqual(parsedResult3.festiveBreak.startDate, "2024-12-20", "Test 3.7: Festive start date matches from compact");

// Test Case 4: Schedule with All Features
let activeSchedule4 = getDefaultScheduleStructure("Test Complex");
activeSchedule4.patternType = 'constant';
activeSchedule4.selections.week1 = [2, 4];
activeSchedule4.patternAnchorDate = "2024-01-01";
activeSchedule4.summerHours = {
    enabled: true,
    startDate: "2024-07-01",
    endDate: "2024-07-31",
    finishTime: "13:00",
    affectedDays: [1,2,3,4,5]
};
activeSchedule4.festiveBreak = {
    enabled: true,
    startDate: "2024-12-24",
    endDate: "2024-12-28"
};

let fullScheduleToShare4 = generateScheduleToShare(activeSchedule4);

// Length with new compact format
let compactScheduleToShare4 = convertToCompactFormat(fullScheduleToShare4);
let jsonStringCompact4 = JSON.stringify(compactScheduleToShare4);
let compressedCompact4 = pako.deflate(new TextEncoder().encode(jsonStringCompact4), { level: 9 });
let shortcodeCompact4 = btoa(String.fromCharCode.apply(null, compressedCompact4));
console.log_debug("Test 4 Compact Shortcode:", shortcodeCompact4);
console.log_debug("Test 4 Compact Shortcode Length:", shortcodeCompact4.length);

// For comparison: Length with old (full JSON) format
let jsonStringFull4 = JSON.stringify(fullScheduleToShare4); // Stringify the full version
let compressedFull4 = pako.deflate(new TextEncoder().encode(jsonStringFull4), { level: 9 });
let shortcodeFull4 = btoa(String.fromCharCode.apply(null, compressedFull4));
console.log_debug("Test 4 Full (for comparison) Shortcode Length:", shortcodeFull4.length);

let parsedResult4 = parseAndApplyShortcode(shortcodeCompact4);

console.log_debug("Test 4 Parsed Full:", JSON.stringify(parsedResult4));
console.log_debug("Test 4 Compact Data used for stringify:", JSON.stringify(compactScheduleToShare4));

assert(parsedResult4 && !parsedResult4.error, "Test 4.1: Complex schedule parses without error");
assertEqual(parsedResult4.name, "Test Complex", "Test 4.2: Name matches");
assertEqual(parsedResult4.summerHours.enabled, true, "Test 4.3: Summer hours enabled from compact");
assertEqual(parsedResult4.summerHours.finishTime, "13:00", "Test 4.4: Summer finish time matches from compact");
assertEqual(parsedResult4.festiveBreak.enabled, true, "Test 4.5: Festive break enabled from compact");
assertEqual(parsedResult4.festiveBreak.endDate, "2024-12-28", "Test 4.6: Festive end date matches from compact");

// --- Test Case 5: Pattern Type 'none' ---
let activeSchedule5_none_basic = getDefaultScheduleStructure("Test None Basic");
activeSchedule5_none_basic.patternType = 'none';
activeSchedule5_none_basic.patternAnchorDate = null; // 'none' pattern might not have an anchor

let fullScheduleToShare5_none_basic = generateScheduleToShare(activeSchedule5_none_basic);
let compactScheduleToShare5_none_basic = convertToCompactFormat(fullScheduleToShare5_none_basic);
let jsonString5_none_basic = JSON.stringify(compactScheduleToShare5_none_basic);
const compressedData5_none_basic = pako.deflate(new TextEncoder().encode(jsonString5_none_basic), { level: 9 });
const compressedBinaryString5_none_basic = String.fromCharCode.apply(null, compressedData5_none_basic);
let shortcode5_none_basic = btoa(compressedBinaryString5_none_basic);
let parsedResult5_none_basic = parseAndApplyShortcode(shortcode5_none_basic);

console.log_debug("Test 5 (None Basic) Parsed Full:", JSON.stringify(parsedResult5_none_basic));
assert(parsedResult5_none_basic && !parsedResult5_none_basic.error, "Test 5.1 (None Basic): Parses without error");
assertEqual(parsedResult5_none_basic.name, "Test None Basic", "Test 5.2 (None Basic): Name matches");
assertEqual(parsedResult5_none_basic.patternType, 'none', "Test 5.3 (None Basic): Pattern type matches");
assertDeepEqual(parsedResult5_none_basic.selections.week1, [], "Test 5.4 (None Basic): Selections are empty");

// Test Case 5.SH: 'none' with Summer Hours
let activeSchedule5_none_sh = getDefaultScheduleStructure("Test None SH");
activeSchedule5_none_sh.patternType = 'none';
activeSchedule5_none_sh.summerHours = { enabled: true, startDate: "2024-07-01", endDate: "2024-07-31", finishTime: "14:30", affectedDays: [1,3] };

let fullScheduleToShare5_none_sh = generateScheduleToShare(activeSchedule5_none_sh);
let compactScheduleToShare5_none_sh = convertToCompactFormat(fullScheduleToShare5_none_sh);
let jsonString5_none_sh = JSON.stringify(compactScheduleToShare5_none_sh);
const compressedData5_none_sh = pako.deflate(new TextEncoder().encode(jsonString5_none_sh), { level: 9 });
const compressedBinaryString5_none_sh = String.fromCharCode.apply(null, compressedData5_none_sh);
let shortcode5_none_sh = btoa(compressedBinaryString5_none_sh);
let parsedResult5_none_sh = parseAndApplyShortcode(shortcode5_none_sh);

assert(parsedResult5_none_sh && !parsedResult5_none_sh.error, "Test 5.SH.1 (None SH): Parses without error");
assertEqual(parsedResult5_none_sh.patternType, 'none', "Test 5.SH.2 (None SH): Pattern type 'none'");
assertEqual(parsedResult5_none_sh.summerHours.enabled, true, "Test 5.SH.3 (None SH): Summer hours enabled");
assertEqual(parsedResult5_none_sh.summerHours.finishTime, "14:30", "Test 5.SH.4 (None SH): Summer finish time");

// Test Case 5.FB: 'none' with Festive Break
let activeSchedule5_none_fb = getDefaultScheduleStructure("Test None FB");
activeSchedule5_none_fb.patternType = 'none';
activeSchedule5_none_fb.festiveBreak = { enabled: true, startDate: "2024-12-23", endDate: "2025-01-02" };

let fullScheduleToShare5_none_fb = generateScheduleToShare(activeSchedule5_none_fb);
let compactScheduleToShare5_none_fb = convertToCompactFormat(fullScheduleToShare5_none_fb);
let jsonString5_none_fb = JSON.stringify(compactScheduleToShare5_none_fb);
const compressedData5_none_fb = pako.deflate(new TextEncoder().encode(jsonString5_none_fb), { level: 9 });
const compressedBinaryString5_none_fb = String.fromCharCode.apply(null, compressedData5_none_fb);
let shortcode5_none_fb = btoa(compressedBinaryString5_none_fb);
let parsedResult5_none_fb = parseAndApplyShortcode(shortcode5_none_fb);

assert(parsedResult5_none_fb && !parsedResult5_none_fb.error, "Test 5.FB.1 (None FB): Parses without error");
assertEqual(parsedResult5_none_fb.patternType, 'none', "Test 5.FB.2 (None FB): Pattern type 'none'");
assertEqual(parsedResult5_none_fb.festiveBreak.enabled, true, "Test 5.FB.3 (None FB): Festive break enabled");
assertEqual(parsedResult5_none_fb.festiveBreak.startDate, "2024-12-23", "Test 5.FB.4 (None FB): Festive start date");

// Test Case 5.ALL: 'none' with All Features
let activeSchedule5_none_all = getDefaultScheduleStructure("Test None All");
activeSchedule5_none_all.patternType = 'none';
activeSchedule5_none_all.summerHours = { enabled: true, startDate: "2024-06-15", endDate: "2024-08-15", finishTime: "13:15", affectedDays: [5] };
activeSchedule5_none_all.festiveBreak = { enabled: true, startDate: "2024-12-20", endDate: "2025-01-03" };

let fullScheduleToShare5_none_all = generateScheduleToShare(activeSchedule5_none_all);
let compactScheduleToShare5_none_all = convertToCompactFormat(fullScheduleToShare5_none_all);
let jsonString5_none_all = JSON.stringify(compactScheduleToShare5_none_all);
const compressedData5_none_all = pako.deflate(new TextEncoder().encode(jsonString5_none_all), { level: 9 });
const compressedBinaryString5_none_all = String.fromCharCode.apply(null, compressedData5_none_all);
let shortcode5_none_all = btoa(compressedBinaryString5_none_all);
let parsedResult5_none_all = parseAndApplyShortcode(shortcode5_none_all);

assert(parsedResult5_none_all && !parsedResult5_none_all.error, "Test 5.ALL.1 (None All): Parses without error");
assertEqual(parsedResult5_none_all.patternType, 'none', "Test 5.ALL.2 (None All): Pattern type 'none'");
assertEqual(parsedResult5_none_all.summerHours.enabled, true, "Test 5.ALL.3 (None All): Summer hours enabled");
assertEqual(parsedResult5_none_all.festiveBreak.enabled, true, "Test 5.ALL.4 (None All): Festive break enabled");


// --- Test Case 6: Pattern Type 'aa_bb' ---
let activeSchedule6_aabb_basic = getDefaultScheduleStructure("Test AABB Basic");
activeSchedule6_aabb_basic.patternType = 'aa_bb';
activeSchedule6_aabb_basic.selections = { week1: [1,2], week2: [1,2], week3: [4,5], week4: [4,5] };
activeSchedule6_aabb_basic.patternAnchorDate = "2024-02-05";

let fullScheduleToShare6_aabb_basic = generateScheduleToShare(activeSchedule6_aabb_basic);
let compactScheduleToShare6_aabb_basic = convertToCompactFormat(fullScheduleToShare6_aabb_basic);
let jsonString6_aabb_basic = JSON.stringify(compactScheduleToShare6_aabb_basic);
const compressedData6_aabb_basic = pako.deflate(new TextEncoder().encode(jsonString6_aabb_basic), { level: 9 });
const compressedBinaryString6_aabb_basic = String.fromCharCode.apply(null, compressedData6_aabb_basic);
let shortcode6_aabb_basic = btoa(compressedBinaryString6_aabb_basic);
let parsedResult6_aabb_basic = parseAndApplyShortcode(shortcode6_aabb_basic);

console.log_debug("Test 6 (AABB Basic) Parsed Full:", JSON.stringify(parsedResult6_aabb_basic));
assert(parsedResult6_aabb_basic && !parsedResult6_aabb_basic.error, "Test 6.1 (AABB Basic): Parses without error");
assertEqual(parsedResult6_aabb_basic.name, "Test AABB Basic", "Test 6.2 (AABB Basic): Name matches");
assertEqual(parsedResult6_aabb_basic.patternType, 'aa_bb', "Test 6.3 (AABB Basic): Pattern type matches");
assertDeepEqual(parsedResult6_aabb_basic.selections.week1, [1,2], "Test 6.4 (AABB Basic): Selections week1 matches");
assertDeepEqual(parsedResult6_aabb_basic.selections.week3, [4,5], "Test 6.5 (AABB Basic): Selections week3 matches");
assertEqual(parsedResult6_aabb_basic.patternAnchorDate, "2024-02-05", "Test 6.6 (AABB Basic): Anchor date matches");

// Test Case 6.SH: 'aa_bb' with Summer Hours
let activeSchedule6_aabb_sh = getDefaultScheduleStructure("Test AABB SH");
activeSchedule6_aabb_sh.patternType = 'aa_bb';
activeSchedule6_aabb_sh.selections = { week1: [1], week2: [1], week3: [5], week4: [5] };
activeSchedule6_aabb_sh.patternAnchorDate = "2024-03-04";
activeSchedule6_aabb_sh.summerHours = { enabled: true, startDate: "2024-07-01", endDate: "2024-07-31", finishTime: "14:30", affectedDays: [1,5] };

let fullScheduleToShare6_aabb_sh = generateScheduleToShare(activeSchedule6_aabb_sh);
let compactScheduleToShare6_aabb_sh = convertToCompactFormat(fullScheduleToShare6_aabb_sh);
let jsonString6_aabb_sh = JSON.stringify(compactScheduleToShare6_aabb_sh);
const compressedData6_aabb_sh = pako.deflate(new TextEncoder().encode(jsonString6_aabb_sh), { level: 9 });
const compressedBinaryString6_aabb_sh = String.fromCharCode.apply(null, compressedData6_aabb_sh);
let shortcode6_aabb_sh = btoa(compressedBinaryString6_aabb_sh);
let parsedResult6_aabb_sh = parseAndApplyShortcode(shortcode6_aabb_sh);

assert(parsedResult6_aabb_sh && !parsedResult6_aabb_sh.error, "Test 6.SH.1 (AABB SH): Parses without error");
assertEqual(parsedResult6_aabb_sh.patternType, 'aa_bb', "Test 6.SH.2 (AABB SH): Pattern type 'aa_bb'");
assertEqual(parsedResult6_aabb_sh.summerHours.enabled, true, "Test 6.SH.3 (AABB SH): Summer hours enabled");
assertDeepEqual(parsedResult6_aabb_sh.selections.week1, [1], "Test 6.SH.4 (AABB SH): Selections week1");

// Test Case 6.FB: 'aa_bb' with Festive Break
let activeSchedule6_aabb_fb = getDefaultScheduleStructure("Test AABB FB");
activeSchedule6_aabb_fb.patternType = 'aa_bb';
activeSchedule6_aabb_fb.selections = { week1: [2,3], week2: [2,3], week3: [3,4], week4: [3,4] };
activeSchedule6_aabb_fb.patternAnchorDate = "2024-04-01";
activeSchedule6_aabb_fb.festiveBreak = { enabled: true, startDate: "2024-12-23", endDate: "2025-01-02" };

let fullScheduleToShare6_aabb_fb = generateScheduleToShare(activeSchedule6_aabb_fb);
let compactScheduleToShare6_aabb_fb = convertToCompactFormat(fullScheduleToShare6_aabb_fb);
let jsonString6_aabb_fb = JSON.stringify(compactScheduleToShare6_aabb_fb);
const compressedData6_aabb_fb = pako.deflate(new TextEncoder().encode(jsonString6_aabb_fb), { level: 9 });
const compressedBinaryString6_aabb_fb = String.fromCharCode.apply(null, compressedData6_aabb_fb);
let shortcode6_aabb_fb = btoa(compressedBinaryString6_aabb_fb);
let parsedResult6_aabb_fb = parseAndApplyShortcode(shortcode6_aabb_fb);

assert(parsedResult6_aabb_fb && !parsedResult6_aabb_fb.error, "Test 6.FB.1 (AABB FB): Parses without error");
assertEqual(parsedResult6_aabb_fb.patternType, 'aa_bb', "Test 6.FB.2 (AABB FB): Pattern type 'aa_bb'");
assertEqual(parsedResult6_aabb_fb.festiveBreak.enabled, true, "Test 6.FB.3 (AABB FB): Festive break enabled");
assertDeepEqual(parsedResult6_aabb_fb.selections.week3, [3,4], "Test 6.FB.4 (AABB FB): Selections week3");

// Test Case 6.ALL: 'aa_bb' with All Features
let activeSchedule6_aabb_all = getDefaultScheduleStructure("Test AABB All");
activeSchedule6_aabb_all.patternType = 'aa_bb';
activeSchedule6_aabb_all.selections = { week1: [1,5], week2: [1,5], week3: [2,4], week4: [2,4] };
activeSchedule6_aabb_all.patternAnchorDate = "2024-05-06";
activeSchedule6_aabb_all.summerHours = { enabled: true, startDate: "2024-06-15", endDate: "2024-08-15", finishTime: "13:15", affectedDays: [1,2,4,5] };
activeSchedule6_aabb_all.festiveBreak = { enabled: true, startDate: "2024-12-20", endDate: "2025-01-03" };

let fullScheduleToShare6_aabb_all = generateScheduleToShare(activeSchedule6_aabb_all);
let compactScheduleToShare6_aabb_all = convertToCompactFormat(fullScheduleToShare6_aabb_all);
let jsonString6_aabb_all = JSON.stringify(compactScheduleToShare6_aabb_all);
const compressedData6_aabb_all = pako.deflate(new TextEncoder().encode(jsonString6_aabb_all), { level: 9 });
const compressedBinaryString6_aabb_all = String.fromCharCode.apply(null, compressedData6_aabb_all);
let shortcode6_aabb_all = btoa(compressedBinaryString6_aabb_all);
let parsedResult6_aabb_all = parseAndApplyShortcode(shortcode6_aabb_all);

assert(parsedResult6_aabb_all && !parsedResult6_aabb_all.error, "Test 6.ALL.1 (AABB All): Parses without error");
assertEqual(parsedResult6_aabb_all.patternType, 'aa_bb', "Test 6.ALL.2 (AABB All): Pattern type 'aa_bb'");
assertEqual(parsedResult6_aabb_all.summerHours.enabled, true, "Test 6.ALL.3 (AABB All): Summer hours enabled");
assertEqual(parsedResult6_aabb_all.festiveBreak.enabled, true, "Test 6.ALL.4 (AABB All): Festive break enabled");
assertDeepEqual(parsedResult6_aabb_all.selections.week1, [1,5], "Test 6.ALL.5 (AABB All): Selections week1");


// --- Test Case 7: Pattern Type 'abba' ---
let activeSchedule7_abba_basic = getDefaultScheduleStructure("Test ABBA Basic");
activeSchedule7_abba_basic.patternType = 'abba';
activeSchedule7_abba_basic.selections = { week1: [1,3], week2: [2,4], week3: [2,4], week4: [1,3] };
activeSchedule7_abba_basic.patternAnchorDate = "2024-01-08";

let fullScheduleToShare7_abba_basic = generateScheduleToShare(activeSchedule7_abba_basic);
let compactScheduleToShare7_abba_basic = convertToCompactFormat(fullScheduleToShare7_abba_basic);
let jsonString7_abba_basic = JSON.stringify(compactScheduleToShare7_abba_basic);
const compressedData7_abba_basic = pako.deflate(new TextEncoder().encode(jsonString7_abba_basic), { level: 9 });
const compressedBinaryString7_abba_basic = String.fromCharCode.apply(null, compressedData7_abba_basic);
let shortcode7_abba_basic = btoa(compressedBinaryString7_abba_basic);
let parsedResult7_abba_basic = parseAndApplyShortcode(shortcode7_abba_basic);

console.log_debug("Test 7 (ABBA Basic) Parsed Full:", JSON.stringify(parsedResult7_abba_basic));
assert(parsedResult7_abba_basic && !parsedResult7_abba_basic.error, "Test 7.1 (ABBA Basic): Parses without error");
assertEqual(parsedResult7_abba_basic.name, "Test ABBA Basic", "Test 7.2 (ABBA Basic): Name matches");
assertEqual(parsedResult7_abba_basic.patternType, 'abba', "Test 7.3 (ABBA Basic): Pattern type matches");
assertDeepEqual(parsedResult7_abba_basic.selections.week1, [1,3], "Test 7.4 (ABBA Basic): Selections week1 matches");
assertDeepEqual(parsedResult7_abba_basic.selections.week2, [2,4], "Test 7.5 (ABBA Basic): Selections week2 matches");
assertEqual(parsedResult7_abba_basic.patternAnchorDate, "2024-01-08", "Test 7.6 (ABBA Basic): Anchor date matches");

// Test Case 7.SH: 'abba' with Summer Hours
let activeSchedule7_abba_sh = getDefaultScheduleStructure("Test ABBA SH");
activeSchedule7_abba_sh.patternType = 'abba';
activeSchedule7_abba_sh.selections = { week1: [1], week2: [5], week3: [5], week4: [1] };
activeSchedule7_abba_sh.patternAnchorDate = "2024-02-12";
activeSchedule7_abba_sh.summerHours = { enabled: true, startDate: "2024-08-01", endDate: "2024-08-30", finishTime: "15:00", affectedDays: [1,5] };

let fullScheduleToShare7_abba_sh = generateScheduleToShare(activeSchedule7_abba_sh);
let compactScheduleToShare7_abba_sh = convertToCompactFormat(fullScheduleToShare7_abba_sh);
let jsonString7_abba_sh = JSON.stringify(compactScheduleToShare7_abba_sh);
const compressedData7_abba_sh = pako.deflate(new TextEncoder().encode(jsonString7_abba_sh), { level: 9 });
const compressedBinaryString7_abba_sh = String.fromCharCode.apply(null, compressedData7_abba_sh);
let shortcode7_abba_sh = btoa(compressedBinaryString7_abba_sh);
let parsedResult7_abba_sh = parseAndApplyShortcode(shortcode7_abba_sh);

assert(parsedResult7_abba_sh && !parsedResult7_abba_sh.error, "Test 7.SH.1 (ABBA SH): Parses without error");
assertEqual(parsedResult7_abba_sh.patternType, 'abba', "Test 7.SH.2 (ABBA SH): Pattern type 'abba'");
assertEqual(parsedResult7_abba_sh.summerHours.enabled, true, "Test 7.SH.3 (ABBA SH): Summer hours enabled");
assertDeepEqual(parsedResult7_abba_sh.selections.week2, [5], "Test 7.SH.4 (ABBA SH): Selections week2");

// Test Case 7.FB: 'abba' with Festive Break
let activeSchedule7_abba_fb = getDefaultScheduleStructure("Test ABBA FB");
activeSchedule7_abba_fb.patternType = 'abba';
activeSchedule7_abba_fb.selections = { week1: [2], week2: [3], week3: [3], week4: [2] };
activeSchedule7_abba_fb.patternAnchorDate = "2024-03-11";
activeSchedule7_abba_fb.festiveBreak = { enabled: true, startDate: "2024-12-19", endDate: "2025-01-01" };

let fullScheduleToShare7_abba_fb = generateScheduleToShare(activeSchedule7_abba_fb);
let compactScheduleToShare7_abba_fb = convertToCompactFormat(fullScheduleToShare7_abba_fb);
let jsonString7_abba_fb = JSON.stringify(compactScheduleToShare7_abba_fb);
const compressedData7_abba_fb = pako.deflate(new TextEncoder().encode(jsonString7_abba_fb), { level: 9 });
const compressedBinaryString7_abba_fb = String.fromCharCode.apply(null, compressedData7_abba_fb);
let shortcode7_abba_fb = btoa(compressedBinaryString7_abba_fb);
let parsedResult7_abba_fb = parseAndApplyShortcode(shortcode7_abba_fb);

assert(parsedResult7_abba_fb && !parsedResult7_abba_fb.error, "Test 7.FB.1 (ABBA FB): Parses without error");
assertEqual(parsedResult7_abba_fb.patternType, 'abba', "Test 7.FB.2 (ABBA FB): Pattern type 'abba'");
assertEqual(parsedResult7_abba_fb.festiveBreak.enabled, true, "Test 7.FB.3 (ABBA FB): Festive break enabled");
assertDeepEqual(parsedResult7_abba_fb.selections.week1, [2], "Test 7.FB.4 (ABBA FB): Selections week1");

// Test Case 7.ALL: 'abba' with All Features
let activeSchedule7_abba_all = getDefaultScheduleStructure("Test ABBA All");
activeSchedule7_abba_all.patternType = 'abba';
activeSchedule7_abba_all.selections = { week1: [1,2,3], week2: [3,4,5], week3: [3,4,5], week4: [1,2,3] };
activeSchedule7_abba_all.patternAnchorDate = "2024-04-08";
activeSchedule7_abba_all.summerHours = { enabled: true, startDate: "2024-07-10", endDate: "2024-08-10", finishTime: "12:00", affectedDays: [1,2,3,4,5] };
activeSchedule7_abba_all.festiveBreak = { enabled: true, startDate: "2024-12-18", endDate: "2025-01-04" };

let fullScheduleToShare7_abba_all = generateScheduleToShare(activeSchedule7_abba_all);
let compactScheduleToShare7_abba_all = convertToCompactFormat(fullScheduleToShare7_abba_all);
let jsonString7_abba_all = JSON.stringify(compactScheduleToShare7_abba_all);
const compressedData7_abba_all = pako.deflate(new TextEncoder().encode(jsonString7_abba_all), { level: 9 });
const compressedBinaryString7_abba_all = String.fromCharCode.apply(null, compressedData7_abba_all);
let shortcode7_abba_all = btoa(compressedBinaryString7_abba_all);
let parsedResult7_abba_all = parseAndApplyShortcode(shortcode7_abba_all);

assert(parsedResult7_abba_all && !parsedResult7_abba_all.error, "Test 7.ALL.1 (ABBA All): Parses without error");
assertEqual(parsedResult7_abba_all.patternType, 'abba', "Test 7.ALL.2 (ABBA All): Pattern type 'abba'");
assertEqual(parsedResult7_abba_all.summerHours.enabled, true, "Test 7.ALL.3 (ABBA All): Summer hours enabled");
assertEqual(parsedResult7_abba_all.festiveBreak.enabled, true, "Test 7.ALL.4 (ABBA All): Festive break enabled");
assertDeepEqual(parsedResult7_abba_all.selections.week2, [3,4,5], "Test 7.ALL.5 (ABBA All): Selections week2");


// --- Test Case 8: Pattern Type 'constant_single_day' ---
let activeSchedule8_csd_basic = getDefaultScheduleStructure("Test CSD Basic");
activeSchedule8_csd_basic.patternType = 'constant_single_day';
activeSchedule8_csd_basic.selections = { week1: [3], week2: [3], week3: [3], week4: [3] }; // Or just week1: [3] and others empty, converter should handle
activeSchedule8_csd_basic.patternAnchorDate = "2024-01-15";

let fullScheduleToShare8_csd_basic = generateScheduleToShare(activeSchedule8_csd_basic);
let compactScheduleToShare8_csd_basic = convertToCompactFormat(fullScheduleToShare8_csd_basic);
let jsonString8_csd_basic = JSON.stringify(compactScheduleToShare8_csd_basic);
const compressedData8_csd_basic = pako.deflate(new TextEncoder().encode(jsonString8_csd_basic), { level: 9 });
const compressedBinaryString8_csd_basic = String.fromCharCode.apply(null, compressedData8_csd_basic);
let shortcode8_csd_basic = btoa(compressedBinaryString8_csd_basic);
let parsedResult8_csd_basic = parseAndApplyShortcode(shortcode8_csd_basic);

console.log_debug("Test 8 (CSD Basic) Parsed Full:", JSON.stringify(parsedResult8_csd_basic));
assert(parsedResult8_csd_basic && !parsedResult8_csd_basic.error, "Test 8.1 (CSD Basic): Parses without error");
assertEqual(parsedResult8_csd_basic.name, "Test CSD Basic", "Test 8.2 (CSD Basic): Name matches");
assertEqual(parsedResult8_csd_basic.patternType, 'constant_single_day', "Test 8.3 (CSD Basic): Pattern type matches");
assertDeepEqual(parsedResult8_csd_basic.selections.week1, [3], "Test 8.4 (CSD Basic): Selections week1 matches");
// For constant_single_day, convertFromCompactFormat might fill all weeks or just week1 based on compact sL.
// The key is that the patternType is correct and week1 has the single day.
// Let's check if all selection weeks are either the single day or empty, and week1 is the single day.
const csd_w1_ok = parsedResult8_csd_basic.selections.week1.length === 1 && parsedResult8_csd_basic.selections.week1[0] === 3;
const csd_w2_ok = (parsedResult8_csd_basic.selections.week2.length === 0 || (parsedResult8_csd_basic.selections.week2.length === 1 && parsedResult8_csd_basic.selections.week2[0] === 3));
const csd_w3_ok = (parsedResult8_csd_basic.selections.week3.length === 0 || (parsedResult8_csd_basic.selections.week3.length === 1 && parsedResult8_csd_basic.selections.week3[0] === 3));
const csd_w4_ok = (parsedResult8_csd_basic.selections.week4.length === 0 || (parsedResult8_csd_basic.selections.week4.length === 1 && parsedResult8_csd_basic.selections.week4[0] === 3));
assert(csd_w1_ok && csd_w2_ok && csd_w3_ok && csd_w4_ok, "Test 8.5 (CSD Basic): All selection weeks consistent with single day or empty");
assertEqual(parsedResult8_csd_basic.patternAnchorDate, "2024-01-15", "Test 8.6 (CSD Basic): Anchor date matches");


// Test Case 8.SH: 'constant_single_day' with Summer Hours
let activeSchedule8_csd_sh = getDefaultScheduleStructure("Test CSD SH");
activeSchedule8_csd_sh.patternType = 'constant_single_day';
activeSchedule8_csd_sh.selections = { week1: [5] }; // convertToCompactFormat will handle sL string for this
activeSchedule8_csd_sh.patternAnchorDate = "2024-02-19";
activeSchedule8_csd_sh.summerHours = { enabled: true, startDate: "2024-06-01", endDate: "2024-06-30", finishTime: "16:00", affectedDays: [5] };

let fullScheduleToShare8_csd_sh = generateScheduleToShare(activeSchedule8_csd_sh);
let compactScheduleToShare8_csd_sh = convertToCompactFormat(fullScheduleToShare8_csd_sh);
let jsonString8_csd_sh = JSON.stringify(compactScheduleToShare8_csd_sh);
const compressedData8_csd_sh = pako.deflate(new TextEncoder().encode(jsonString8_csd_sh), { level: 9 });
const compressedBinaryString8_csd_sh = String.fromCharCode.apply(null, compressedData8_csd_sh);
let shortcode8_csd_sh = btoa(compressedBinaryString8_csd_sh);
let parsedResult8_csd_sh = parseAndApplyShortcode(shortcode8_csd_sh);

assert(parsedResult8_csd_sh && !parsedResult8_csd_sh.error, "Test 8.SH.1 (CSD SH): Parses without error");
assertEqual(parsedResult8_csd_sh.patternType, 'constant_single_day', "Test 8.SH.2 (CSD SH): Pattern type 'constant_single_day'");
assertEqual(parsedResult8_csd_sh.summerHours.enabled, true, "Test 8.SH.3 (CSD SH): Summer hours enabled");
assertDeepEqual(parsedResult8_csd_sh.selections.week1, [5], "Test 8.SH.4 (CSD SH): Selections week1");

// Test Case 8.FB: 'constant_single_day' with Festive Break
let activeSchedule8_csd_fb = getDefaultScheduleStructure("Test CSD FB");
activeSchedule8_csd_fb.patternType = 'constant_single_day';
activeSchedule8_csd_fb.selections = { week1: [1] };
activeSchedule8_csd_fb.patternAnchorDate = "2024-03-18";
activeSchedule8_csd_fb.festiveBreak = { enabled: true, startDate: "2024-12-24", endDate: "2025-01-01" };

let fullScheduleToShare8_csd_fb = generateScheduleToShare(activeSchedule8_csd_fb);
let compactScheduleToShare8_csd_fb = convertToCompactFormat(fullScheduleToShare8_csd_fb);
let jsonString8_csd_fb = JSON.stringify(compactScheduleToShare8_csd_fb);
const compressedData8_csd_fb = pako.deflate(new TextEncoder().encode(jsonString8_csd_fb), { level: 9 });
const compressedBinaryString8_csd_fb = String.fromCharCode.apply(null, compressedData8_csd_fb);
let shortcode8_csd_fb = btoa(compressedBinaryString8_csd_fb);
let parsedResult8_csd_fb = parseAndApplyShortcode(shortcode8_csd_fb);

assert(parsedResult8_csd_fb && !parsedResult8_csd_fb.error, "Test 8.FB.1 (CSD FB): Parses without error");
assertEqual(parsedResult8_csd_fb.patternType, 'constant_single_day', "Test 8.FB.2 (CSD FB): Pattern type 'constant_single_day'");
assertEqual(parsedResult8_csd_fb.festiveBreak.enabled, true, "Test 8.FB.3 (CSD FB): Festive break enabled");
assertDeepEqual(parsedResult8_csd_fb.selections.week1, [1], "Test 8.FB.4 (CSD FB): Selections week1");

// Test Case 8.ALL: 'constant_single_day' with All Features
let activeSchedule8_csd_all = getDefaultScheduleStructure("Test CSD All");
activeSchedule8_csd_all.patternType = 'constant_single_day';
activeSchedule8_csd_all.selections = { week1: [4] };
activeSchedule8_csd_all.patternAnchorDate = "2024-04-15";
activeSchedule8_csd_all.summerHours = { enabled: true, startDate: "2024-07-15", endDate: "2024-08-20", finishTime: "11:00", affectedDays: [4] };
activeSchedule8_csd_all.festiveBreak = { enabled: true, startDate: "2024-12-16", endDate: "2025-01-05" };

let fullScheduleToShare8_csd_all = generateScheduleToShare(activeSchedule8_csd_all);
let compactScheduleToShare8_csd_all = convertToCompactFormat(fullScheduleToShare8_csd_all);
let jsonString8_csd_all = JSON.stringify(compactScheduleToShare8_csd_all);
const compressedData8_csd_all = pako.deflate(new TextEncoder().encode(jsonString8_csd_all), { level: 9 });
const compressedBinaryString8_csd_all = String.fromCharCode.apply(null, compressedData8_csd_all);
let shortcode8_csd_all = btoa(compressedBinaryString8_csd_all);
let parsedResult8_csd_all = parseAndApplyShortcode(shortcode8_csd_all);

assert(parsedResult8_csd_all && !parsedResult8_csd_all.error, "Test 8.ALL.1 (CSD All): Parses without error");
assertEqual(parsedResult8_csd_all.patternType, 'constant_single_day', "Test 8.ALL.2 (CSD All): Pattern type 'constant_single_day'");
assertEqual(parsedResult8_csd_all.summerHours.enabled, true, "Test 8.ALL.3 (CSD All): Summer hours enabled");
assertEqual(parsedResult8_csd_all.festiveBreak.enabled, true, "Test 8.ALL.4 (CSD All): Festive break enabled");
assertDeepEqual(parsedResult8_csd_all.selections.week1, [4], "Test 8.ALL.5 (CSD All): Selections week1");

// --- Test Case 9: Failing Shortcode from Issue ---
// This shortcode was generated when String.fromCharCode.apply(null, array) was used for large arrays,
// which could lead to "RangeError: Maximum call stack size exceeded".
// The fix involves using a loop for String.fromCharCode.
// This test ensures the previously problematic shortcode can now be parsed.
const issueShortcode = "eNqrVspTslLyrVQITs5ITSnNSU0sTklMKVbSUSooUbIyBlKJLkAFRgZGpgZmBkZA8WIfEN+4BoiMTYBIqRYArlQSug==";
let parsedIssueLink = parseAndApplyShortcode(issueShortcode);

console.log_debug("Test 9 (Issue Shortcode) Parsed Full:", JSON.stringify(parsedIssueLink));

assert(parsedIssueLink && !parsedIssueLink.error, "Test 9.1 Issue Link: Parses without error");
// Expected data for this link (based on issue description and typical structure):
// Name: My Scheduleasdads
// Pattern: aa_bb
// Selections W1 (AA): Tue, Wed => [2,3]
// Selections W3 (BB): Wed, Thu => [3,4]
// patternAnchorDate is not explicitly known from the issue, so we won't assert it unless parsing reveals it consistently.
if (parsedIssueLink && !parsedIssueLink.error) {
    assertEqual(parsedIssueLink.name, "My Scheduleasdads", "Test 9.2 Issue Link: Name matches");
    assertEqual(parsedIssueLink.patternType, "aa_bb", "Test 9.3 Issue Link: Pattern type matches");
    assertDeepEqual(parsedIssueLink.selections.week1, [2,3], "Test 9.4 Issue Link: Selections W1 (Tue,Wed) match");
    // For aa_bb, week2 should be a copy of week1
    assertDeepEqual(parsedIssueLink.selections.week2, [2,3], "Test 9.5 Issue Link: Selections W2 matches W1 for aa_bb");
    assertDeepEqual(parsedIssueLink.selections.week3, [3,4], "Test 9.6 Issue Link: Selections W3 (Wed,Thu) match");
    // For aa_bb, week4 should be a copy of week3
    assertDeepEqual(parsedIssueLink.selections.week4, [3,4], "Test 9.7 Issue Link: Selections W4 matches W3 for aa_bb");
    // Assertions for summerHours and festiveBreak being disabled (default state if not in shortcode)
    assertEqual(parsedIssueLink.summerHours.enabled, false, "Test 9.8 Issue Link: Summer hours disabled by default");
    assertEqual(parsedIssueLink.festiveBreak.enabled, false, "Test 9.9 Issue Link: Festive break disabled by default");
}


console.log("\n--- Starting Part 2: Malformed/Invalid Link Parsing ---");
// Base valid shortcode for corruption (from Test 1)
const baseJsonString = jsonString1; // from "Test Simple"

// Recreate baseShortcode with real pako for subsequent corruption tests
const baseCompressedData = pako.deflate(new TextEncoder().encode(baseJsonString), { level: 9 });
const baseCompressedBinaryString = String.fromCharCode.apply(null, baseCompressedData);
const baseShortcode = btoa(baseCompressedBinaryString);


// Test Case 2.1: Invalid Base64
let corruptedShortcode1 = baseShortcode.slice(0, -1) + "!"; // Add non-base64 char
let malformedResult1 = parseAndApplyShortcode(corruptedShortcode1);
console.log_debug("Malformed Test 1 Result:", JSON.stringify(malformedResult1));
assert(malformedResult1 && malformedResult1.error, "Test 2.1.1: Invalid Base64 returns error object");
assertEqual(malformedResult1.stage, 'decoding', "Test 2.1.2: Stage is 'decoding'");
assertEqual(malformedResult1.message, 'Link data is not correctly encoded.', "Test 2.1.3: Message matches for invalid base64");

// Test Case 2.2: Truncated Base64 (leading to pako error)
// Note: with mock pako, this might not trigger decompression error as easily
let corruptedShortcode2 = baseShortcode.slice(0, baseShortcode.length - 10);
let malformedResult2 = parseAndApplyShortcode(corruptedShortcode2);
console.log_debug("Malformed Test 2 Result:", JSON.stringify(malformedResult2));
assert(malformedResult2 && malformedResult2.error, "Test 2.2.1: Truncated Base64 returns error object");
// Depending on how atob/pako handles it, it could be decoding or decompression.
// With real pako, this is more likely to be a 'decompression' error or 'decoding' if atob fails
const validStages2 = ['decoding', 'decompression', 'parsing', 'decompression_bytes']; // Added decompression_bytes
assert(validStages2.includes(malformedResult2.stage), `Test 2.2.2: Stage is valid for truncated (Expected one of ${validStages2.join(', ')}, Got: ${malformedResult2.stage})`);
if (malformedResult2.stage === 'decoding') {
    assertEqual(malformedResult2.message, 'Link data is not correctly encoded.', "Test 2.2.3: Message for decoding stage");
} else if (malformedResult2.stage === 'decompression') { // This case might be less likely now
    assertEqual(malformedResult2.message, 'Link data appears corrupted or is not a valid schedule link.', "Test 2.2.3: Message for decompression stage");
} else if (malformedResult2.stage === 'parsing') {
    assertEqual(malformedResult2.message, 'Link data format is invalid.', "Test 2.2.3: Message for parsing stage");
} else if (malformedResult2.stage === 'decompression_bytes') {
    assertEqual(malformedResult2.message, 'Decompression to bytes failed or yielded empty/undefined result.', "Test 2.2.3: Message for decompression_bytes stage");
}


// Test Case 2.3: Corrupted Compressed Data (simulated - harder with real pako)
// To simulate this, we can slightly alter the base64 string in a way that atob still processes it,
// but the resulting binary string is not valid pako compressed data.
let slightlyCorruptedShortcode = baseShortcode.substring(0, baseShortcode.length / 2) + "x" + baseShortcode.substring(baseShortcode.length / 2 + 1) ;
// Ensure it's still valid base64 in terms of length and characters if possible, or accept decoding error.
// This kind of corruption often leads to pako's 'decompression' error.
let malformedResult3 = parseAndApplyShortcode(slightlyCorruptedShortcode);
console.log_debug("Malformed Test 3 Result:", JSON.stringify(malformedResult3));
assert(malformedResult3 && malformedResult3.error, "Test 2.3.1: Corrupted data returns error object");
const validStages3 = ['decoding', 'decompression_manual_decode', 'decompression']; // Added decompression_manual_decode
assert(validStages3.includes(malformedResult3.stage), `Test 2.3.2: Stage is valid for corrupted data (Expected one of ${validStages3.join(', ')}, Got: ${malformedResult3.stage})`);
if (malformedResult3.stage === 'decompression_manual_decode') {
    // The exact message can vary depending on where pako.inflate or TextDecoder fails.
    // We check if the message indicates a Pako error or a generic one.
    const pakoRelatedError = malformedResult3.message === 'Link data appears corrupted (Pako error during decompression to bytes).' || malformedResult3.message === 'Decompression or string decoding failed.';
    assert(pakoRelatedError, `Test 2.3.3: Message for decompression_manual_decode stage (Got: ${malformedResult3.message})`);
} else if (malformedResult3.stage === 'decompression') { // This might occur if atob itself creates a string pako rejects early.
    assertEqual(malformedResult3.message, 'Link data appears corrupted or is not a valid schedule link.', "Test 2.3.3: Message matches for old decompression failure");
} else if (malformedResult3.stage === 'decoding') {
    assertEqual(malformedResult3.message, 'Link data is not correctly encoded.', "Test 2.3.3: Message matches for decoding failure");
}


// Test Case 2.4: Invalid JSON Structure (after valid decompression)
let malformedJsonString = `{"name":"Test Invalid JSON", "patternType": "constant", "selections": {week1:[1,2,3]`; // Missing closing brace
const malformedCompressedData = pako.deflate(new TextEncoder().encode(malformedJsonString), { level: 9 });
const malformedCompressedBinaryString = String.fromCharCode.apply(null, malformedCompressedData);
let corruptedShortcode4 = btoa(malformedCompressedBinaryString);

let malformedResult4 = parseAndApplyShortcode(corruptedShortcode4);
console.log_debug("Malformed Test 4 Result:", JSON.stringify(malformedResult4));
assert(malformedResult4 && malformedResult4.error, "Test 2.4.1: Invalid JSON structure returns error object");
assertEqual(malformedResult4.stage, 'parsing', "Test 2.4.2: Stage is 'parsing' for invalid JSON");
assertEqual(malformedResult4.message, 'Link data format is invalid.', "Test 2.4.3: Message matches for invalid JSON");

// Test Case 2.5: Data Structure Validation Failure
let invalidStructureScheduleSource = { // Source for compacting
    name: null,
    patternType: 'constant',
    selections: { week1: [1,2,3], week2:[], week3:[], week4:[] }, // ensure all weeks for sL
    patternAnchorDate: "2024-01-01",
    summerHours: { enabled: false }, // ensure these exist for generateScheduleToShare
    festiveBreak: { enabled: false }
};
// Simulate the generation process:
// 1. generateScheduleToShare (not strictly needed if source is already full, but for consistency)
let fullForCompactingInvalid = generateScheduleToShare(invalidStructureScheduleSource);
// 2. convertToCompactFormat
let compactInvalid = convertToCompactFormat(fullForCompactingInvalid);
compactInvalid.n = null; // Explicitly set null name in compact object after conversion
let invalidStructureJson = JSON.stringify(compactInvalid);

const invalidCompressedData = pako.deflate(new TextEncoder().encode(invalidStructureJson), { level: 9 });
const invalidCompressedBinaryString = String.fromCharCode.apply(null, invalidCompressedData);
let corruptedShortcode5 = btoa(invalidCompressedBinaryString);
let malformedResult5 = parseAndApplyShortcode(corruptedShortcode5);

console.log_debug("Malformed Test 5 (Input Compact JSON):", invalidStructureJson);
console.log_debug("Malformed Test 5 Result (Full Parsed):", JSON.stringify(malformedResult5));

// Test 2.5.1: Check that parsing a compact object with n:null results in a default name and no error
assert(malformedResult5 && !malformedResult5.error, "Test 2.5.1: Compact with null name parses with default name, no error object");
if (malformedResult5 && !malformedResult5.error) {
    assertEqual(malformedResult5.name, "Shared Schedule", "Test 2.5.2: Name defaults to 'Shared Schedule' from null compact name");
}


// --- Output Results ---
console.log("\n--- Test Execution Summary ---");
testResults.forEach(res => console.log(res));
console.log(`\nTotal Tests: ${testsPassed + testsFailed}, Passed: ${testsPassed}, Failed: ${testsFailed}`);

if (testsFailed > 0) {
    // process.exit(1); // Indicate failure for CI environments
}

console.log("\n--- Starting Part 3: Test Failing URL from Issue ---");
const failingShortcode = "eNqrVspTslJyd1LIKitV0lEqKFGyMgZSiS5AUSMDI1MDIASKF/sA+cYmNUBkZAxESrUAoFsONw==";
let failingResult = parseAndApplyShortcode(failingShortcode);
console.log_debug("Failing URL Test Result:", JSON.stringify(failingResult));
assert(failingResult && !failingResult.error, "Test 3.1: Failing URL from issue parses without error after fix");
if (failingResult && !failingResult.error) {
    // Add more assertions if the expected structure of the failing link's data is known.
    // For now, the primary goal is that it doesn't error out with "Link data appears corrupted".
    // Example: Check if it has a name property
    assert(typeof failingResult.name === 'string', "Test 3.2: Parsed data from failing URL has a name property");
    assert(typeof failingResult.patternType === 'string', "Test 3.3: Parsed data from failing URL has a patternType property");
}


console.log("\n--- Starting Part 4: User Reported Failing Links ---");

// Test Case 4.1: User Link 1 (eNqrVspTslJKLE5R0lEqKFGyMgVSiS5AISMDI1MDMwMjoHixD5BvWGNUU6NUCwAq+gw8)
// Expected to fail with "Link data format is invalid." due to JSON parsing issues after decompression.
const userLink1 = "eNqrVspTslJKLE5R0lEqKFGyMgVSiS5AISMDI1MDMwMjoHixD5BvWGNUU6NUCwAq+gw8";
let parsedUserLink1 = parseAndApplyShortcode(userLink1);
console.log_debug("User Link 1 ('asd' Custom Rotational) Parsed:", JSON.stringify(parsedUserLink1));
// This link, previously thought to be invalid JSON, appears to parse correctly with current robust logic.
assert(parsedUserLink1 && !parsedUserLink1.error, "Test 4.1.1 User Link 1: Should parse without error");
if (parsedUserLink1 && !parsedUserLink1.error) {
    assertEqual(parsedUserLink1.name, "asd", "Test 4.1.2 User Link 1: Name validation");
    assertEqual(parsedUserLink1.patternType, "custom_4_week", "Test 4.1.3 User Link 1: Pattern type validation");
    assertEqual(parsedUserLink1.patternAnchorDate, "2025-06-02", "Test 4.1.4 User Link 1: Anchor date matches");
    assertDeepEqual(parsedUserLink1.selections.week1, [1], "Test 4.1.5 User Link 1: Selections week1 matches");
    assertDeepEqual(parsedUserLink1.selections.week2, [2], "Test 4.1.6 User Link 1: Selections week2 matches");
    assertDeepEqual(parsedUserLink1.selections.week3, [], "Test 4.1.7 User Link 1: Selections week3 is empty");
    assertDeepEqual(parsedUserLink1.selections.week4, [], "Test 4.1.8 User Link 1: Selections week4 is empty");
}

// Test Case 4.2: User Link 2 (eNqrVspTslJKLE6BICUdpYISJStjIJXoApQwMjAyNTAzMAKKF/sA+MamNSBsaGQCwkq1ADq6EKk=)
// Expected to fail with "Link data appears corrupted or is not a valid schedule link." due to pako decompression issues.
const userLink2 = "eNqrVspTslJKLE6BICUdpYISJStjIJXoApQwMjAyNTAzMAKKF/sA+MamNSBsaGQCwkq1ADq6EKk=";
let parsedUserLink2 = parseAndApplyShortcode(userLink2);
console.log_debug("User Link 2 ('asdasdasd' AA/BB) Parsed:", JSON.stringify(parsedUserLink2));
assert(parsedUserLink2 && parsedUserLink2.error, "Test 4.2.1 User Link 2: Should report an error");
if (parsedUserLink2 && parsedUserLink2.error) {
    assertEqual(parsedUserLink2.message, "Decompression or string decoding failed.", "Test 4.2.2 User Link 2: Error message validation");
    assertEqual(parsedUserLink2.stage, "decompression_manual_decode", "Test 4.2.3 User Link 2: Error stage validation");
}

console.log("\n--- Starting Part 5: Specific Issue Regression Tests ---");

// Test Case 5.1: Gigi Link (eNqrVspTslJyz0zPVNJRKihRsjIFUokuQDEjAyNTAzMDI6B4sQ+Ib1wDRMYmNcZKtQB3JA2F)
const gigiShortcode = "eNqrVspTslJyz0zPVNJRKihRsjIFUokuQDEjAyNTAzMDI6B4sQ+Ib1wDRMYmNcZKtQB3JA2F";
let parsedGigiLink = parseAndApplyShortcode(gigiShortcode);
console.log_debug("Gigi Link Test - Parsed:", JSON.stringify(parsedGigiLink));

assert(parsedGigiLink && !parsedGigiLink.error, "Test Gigi Link 1: Parses without error");
if (parsedGigiLink && !parsedGigiLink.error) {
    assertEqual(parsedGigiLink.name, "Gigi", "Test Gigi Link 2: Name matches 'Gigi'");
    assertEqual(parsedGigiLink.patternType, 'custom_4_week', "Test Gigi Link 3: Pattern type is 'custom_4_week'");
    assertDeepEqual(parsedGigiLink.selections.week1, [2,3], "Test Gigi Link 4: Selections W1 (Tue,Wed) match");
    assertDeepEqual(parsedGigiLink.selections.week2, [2,3], "Test Gigi Link 5: Selections W2 (Tue,Wed) match");
    assertDeepEqual(parsedGigiLink.selections.week3, [3,4], "Test Gigi Link 6: Selections W3 (Wed,Thu) match");
    assertDeepEqual(parsedGigiLink.selections.week4, [3], "Test Gigi Link 7: Selections W4 (Wed) match");
    assertEqual(parsedGigiLink.summerHours.enabled, false, "Test Gigi Link 8: Summer hours disabled");
    assertEqual(parsedGigiLink.festiveBreak.enabled, false, "Test Gigi Link 9: Festive break disabled");
}

// Re-run summary after Part 4 to include its results
console.log("\n--- Final Test Execution Summary ---");
testResults.forEach(res => console.log(res.startsWith("FAIL") ? `\x1b[31m${res}\x1b[0m` : `\x1b[32m${res}\x1b[0m`)); // Add color
console.log(`\nTotal Tests: ${testsPassed + testsFailed}, Passed: ${testsPassed}, Failed: ${testsFailed}`);

if (testsFailed > 0) {
    process.exit(1); // Indicate failure for CI environments
}
