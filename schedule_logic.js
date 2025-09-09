// --- Constants and Pure Helper Functions ---

const patternTypeToNum = { "none": 0, "constant": 1, "ab": 2, "aa_bb": 3, "abba": 4, "custom_4_week": 5, "constant_single_day": 6 };
const numToPatternType = Object.fromEntries(Object.entries(patternTypeToNum).map(([k, v]) => [v, k]));

const bankHolidays2025 = [
  new Date(2025, 0, 1), new Date(2025, 3, 18), new Date(2025, 3, 21),
  new Date(2025, 4, 5), new Date(2025, 4, 26), new Date(2025, 7, 25),
  new Date(2025, 11, 25), new Date(2025, 11, 26)
];

function getDayName(dayValue, length = 'short') {
    const shortNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const longNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return length === 'long' ? longNames[dayValue] : shortNames[dayValue];
}

function formatTime12Hour(timeString) { // timeString in "HH:mm"
    if (!timeString) return "";
    const [hours, minutes] = timeString.split(':');
    const h = parseInt(hours, 10);
    const suffix = h >= 12 ? 'pm' : 'am';
    const h12 = h % 12 || 12;
    return `${h12}${minutes === '00' ? '' : ':' + minutes}${suffix}`;
}

function formatDateWithOrdinal(date) {
    if (!(date instanceof Date) || isNaN(date)) {
        return "";
    }
    const d = date.getDate();
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = monthNames[date.getMonth()];
    let suffix = 'th';
    if (d > 3 && d < 21) {
    } else {
        switch (d % 10) {
            case 1:  suffix = "st"; break;
            case 2:  suffix = "nd"; break;
            case 3:  suffix = "rd"; break;
        }
    }
    return `${d}${suffix} ${month}`;
}

function getDefaultScheduleStructure(name = "") {
    const currentYear = new Date().getFullYear();
    const todayForDefaults = new Date();

    let currentWeekMonday = new Date(todayForDefaults);
    currentWeekMonday.setDate(todayForDefaults.getDate() - ( (todayForDefaults.getDay() + 6) % 7) );

    return {
        name: name,
        selections: { week1: [], week2: [], week3: [], week4: [] },
        patternType: 'none',
        patternAnchorDate: null,
        patternDescription: "No schedule set.",
        summerHours: {
            enabled: false,
            startDate: currentWeekMonday.toISOString().split('T')[0],
            endDate: `${currentYear}-08-29`, // Example end date
            affectedDays: [5],
            finishTime: "15:00"
        },
        festiveBreak: {
            enabled: false,
            startDate: `${currentYear}-12-25`,
            endDate: `${currentYear + 1}-01-01`
        },
        loadedFromShareLink: false
    };
}


// --- Core Logic Functions ---

function convertToCompactFormat(scheduleData) {
    if (!scheduleData) return null;
    const compact = {
        n: scheduleData.name,
        pt: patternTypeToNum[scheduleData.patternType] !== undefined ? patternTypeToNum[scheduleData.patternType] : 0,
        paD: (scheduleData.patternAnchorDate && typeof scheduleData.patternAnchorDate === 'string') ? scheduleData.patternAnchorDate.replace(/-/g, "") : null,
    };

    const selections = scheduleData.selections || {};
    const weekKeys = ['week1', 'week2', 'week3', 'week4'];
    compact.sL = weekKeys.map(wk => (selections[wk] || []).join("")).join("|");

    if (scheduleData.summerHours && scheduleData.summerHours.enabled) {
        compact.sH = {
            e: 1, // true
            sD: (scheduleData.summerHours.startDate && typeof scheduleData.summerHours.startDate === 'string') ? scheduleData.summerHours.startDate.replace(/-/g, "") : null,
            eD: (scheduleData.summerHours.endDate && typeof scheduleData.summerHours.endDate === 'string') ? scheduleData.summerHours.endDate.replace(/-/g, "") : null,
            fT: (scheduleData.summerHours.finishTime && typeof scheduleData.summerHours.finishTime === 'string') ? scheduleData.summerHours.finishTime.replace(":", "") : null,
            aD: (scheduleData.summerHours.affectedDays || []).join("")
        };
    }

    if (scheduleData.festiveBreak && scheduleData.festiveBreak.enabled) {
        compact.fB = {
            e: 1, // true
            sD: (scheduleData.festiveBreak.startDate && typeof scheduleData.festiveBreak.startDate === 'string') ? scheduleData.festiveBreak.startDate.replace(/-/g, "") : null,
            eD: (scheduleData.festiveBreak.endDate && typeof scheduleData.festiveBreak.endDate === 'string') ? scheduleData.festiveBreak.endDate.replace(/-/g, "") : null
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
    fullSchedule.patternDescription = "Shared schedule loaded.";
    return fullSchedule;
}

function deduceAndDisplayPattern(currentDraftDates) {
    if (!Array.isArray(currentDraftDates) || currentDraftDates.length === 0) {
        return {
            selections: { week1: [], week2: [], week3: [], week4: [] },
            patternType: 'none',
            patternAnchorDate: null,
            patternDescription: "Click days in the calendar to define your office schedule pattern."
        };
    }

    const sortedDates = [...currentDraftDates].sort((a,b) => new Date(a) - new Date(b));
    const firstSelectedDate = new Date(sortedDates[0] + 'T12:00:00');
    let patternAnchorDateObj = new Date(firstSelectedDate);
    patternAnchorDateObj.setDate(firstSelectedDate.getDate() - ((firstSelectedDate.getDay() + 6) % 7));

    let deducedSelections = { week1: [], week2: [], week3: [], week4: [] };

    for (const dateStr of sortedDates) {
        const currentDate = new Date(dateStr + 'T12:00:00');
        const currentDateUTC = Date.UTC(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
        const patternAnchorDateUTC = Date.UTC(patternAnchorDateObj.getFullYear(), patternAnchorDateObj.getMonth(), patternAnchorDateObj.getDate());
        const diffInDays = Math.round((currentDateUTC - patternAnchorDateUTC) / (1000 * 60 * 60 * 24));

        const weekOffset = Math.floor(diffInDays / 7);
        const weekIndexInCycle = (weekOffset % 4 + 4) % 4;
        const dayOfWeek = currentDate.getDay();

        if (dayOfWeek >= 1 && dayOfWeek <= 5) {
            const targetWeekKey = `week${weekIndexInCycle + 1}`;
            if (!deducedSelections[targetWeekKey].includes(dayOfWeek)) {
                deducedSelections[targetWeekKey].push(dayOfWeek);
            }
        }
    }

    for (let weekKey in deducedSelections) {
        deducedSelections[weekKey].sort((a, b) => a - b);
    }

    let determinedPatternType = 'custom_4_week';
    let description = "";
    const w1S = JSON.stringify(deducedSelections.week1);
    const w2S = JSON.stringify(deducedSelections.week2);
    const w3S = JSON.stringify(deducedSelections.week3);
    const w4S = JSON.stringify(deducedSelections.week4);
    const emptyS = JSON.stringify([]);

    const activeWeeks = [w1S, w2S, w3S, w4S].filter(w => w !== emptyS);
    const uniqueActiveWeeks = [...new Set(activeWeeks)];

    if (activeWeeks.length === 0) {
        determinedPatternType = 'none';
        description = "No days selected.";
    } else if (uniqueActiveWeeks.length === 1) {
        const singleWeekSelections = JSON.parse(uniqueActiveWeeks[0]);
        if (singleWeekSelections.length === 1) {
            determinedPatternType = 'constant_single_day';
            description = `Constant: ${getDayName(singleWeekSelections[0])}s weekly. Lucky you, eh!`;
        } else {
            determinedPatternType = 'constant';
            description = `Constant: ${singleWeekSelections.map(d => getDayName(d)).join(', ')} weekly.`;
        }
        deducedSelections.week1 = singleWeekSelections;
        deducedSelections.week2 = singleWeekSelections;
        deducedSelections.week3 = singleWeekSelections;
        deducedSelections.week4 = singleWeekSelections;
    } else if (uniqueActiveWeeks.length === 2) {
        if (w1S === w3S && w2S === w4S) {
            determinedPatternType = 'ab';
            description = `A/B Pattern. A: (${deducedSelections.week1.map(d => getDayName(d)).join(', ') || 'No days'}), B: (${deducedSelections.week2.map(d => getDayName(d)).join(', ') || 'No days'}).`;
        } else if (w1S === w2S && w3S === w4S) {
            determinedPatternType = 'aa_bb';
            description = `AA/BB Pattern. W1&2: (${deducedSelections.week1.map(d => getDayName(d)).join(', ') || 'No days'}), W3&4: (${deducedSelections.week3.map(d => getDayName(d)).join(', ') || 'No days'}).`;
        } else if (w1S === w4S && w2S === w3S) {
            determinedPatternType = 'abba';
            description = `ABBA Pattern. W1&4: (${deducedSelections.week1.map(d => getDayName(d)).join(', ') || 'No days'}), W2&3: (${deducedSelections.week2.map(d => getDayName(d)).join(', ') || 'No days'}). Office Queen!`;
        } else {
            const weekPatternsForDesc = [];
            if(w1S !== emptyS) weekPatternsForDesc.push(`W1: ${deducedSelections.week1.map(d => getDayName(d)).join(', ')}`);
            if(w2S !== emptyS) weekPatternsForDesc.push(`W2: ${deducedSelections.week2.map(d => getDayName(d)).join(', ')}`);
            if(w3S !== emptyS) weekPatternsForDesc.push(`W3: ${deducedSelections.week3.map(d => getDayName(d)).join(', ')}`);
            if(w4S !== emptyS) weekPatternsForDesc.push(`W4: ${deducedSelections.week4.map(d => getDayName(d)).join(', ')}`);
            description = `Custom Rotational: ${weekPatternsForDesc.join('; ')}.`;
            determinedPatternType = 'custom_4_week';
        }
    } else {
        const weekPatternsForDesc = [];
        if(w1S !== emptyS) weekPatternsForDesc.push(`W1: ${deducedSelections.week1.map(d => getDayName(d)).join(', ')}`);
        if(w2S !== emptyS) weekPatternsForDesc.push(`W2: ${deducedSelections.week2.map(d => getDayName(d)).join(', ')}`);
        if(w3S !== emptyS) weekPatternsForDesc.push(`W3: ${deducedSelections.week3.map(d => getDayName(d)).join(', ')}`);
        if(w4S !== emptyS) weekPatternsForDesc.push(`W4: ${deducedSelections.week4.map(d => getDayName(d)).join(', ')}`);
        description = `Custom Rotational: ${weekPatternsForDesc.join('; ')}.`;
        determinedPatternType = 'custom_4_week';
    }

    return {
        selections: deducedSelections,
        patternType: determinedPatternType,
        patternAnchorDate: patternAnchorDateObj.toISOString().split('T')[0],
        patternDescription: description
    };
}

function isBankHoliday(date) {
  return bankHolidays2025.some(holiday =>
    holiday.getDate() === date.getDate() && holiday.getMonth() === date.getMonth() && holiday.getFullYear() === date.getFullYear()
  );
}

function isFestiveBreak(date, activeScheduleData) {
    if (!activeScheduleData.festiveBreak || !activeScheduleData.festiveBreak.enabled ||
        !activeScheduleData.festiveBreak.startDate || !activeScheduleData.festiveBreak.endDate) {
        return false;
    }
    const checkDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const festiveStart = new Date(activeScheduleData.festiveBreak.startDate + 'T00:00:00');
    const festiveEnd = new Date(activeScheduleData.festiveBreak.endDate + 'T23:59:59');
    return checkDate >= festiveStart && checkDate <= festiveEnd;
}

function isSummerHoursDay(date, activeScheduleData) {
    if (!activeScheduleData.summerHours || !activeScheduleData.summerHours.enabled ||
        !activeScheduleData.summerHours.startDate || !activeScheduleData.summerHours.endDate ||
        !activeScheduleData.summerHours.affectedDays || activeScheduleData.summerHours.affectedDays.length === 0) {
        return false;
    }
    const checkDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const summerStart = new Date(activeScheduleData.summerHours.startDate + 'T00:00:00');
    const summerEnd = new Date(activeScheduleData.summerHours.endDate + 'T23:59:59');
    const dayOfWeek = date.getDay();

    return checkDate >= summerStart && checkDate <= summerEnd && activeScheduleData.summerHours.affectedDays.includes(dayOfWeek);
}

function isOfficeDayInternal(date, patternDetails) {
    if (!patternDetails || !patternDetails.patternAnchorDate || patternDetails.patternType === 'none' || !patternDetails.selections) {
        return false;
    }
    if (date.getDay() === 0 || date.getDay() === 6) return false;

    const patternAnchor = new Date(patternDetails.patternAnchorDate + 'T12:00:00');
    let currentCheckingDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0);

    let currentCheckingDateMonday = new Date(currentCheckingDate);
    currentCheckingDateMonday.setDate(currentCheckingDate.getDate() - ((currentCheckingDate.getDay() + 6) % 7));

    const currentCheckingDateMondayUTC = Date.UTC(currentCheckingDateMonday.getFullYear(), currentCheckingDateMonday.getMonth(), currentCheckingDateMonday.getDate());
    const patternAnchorUTC = Date.UTC(patternAnchor.getFullYear(), patternAnchor.getMonth(), patternAnchor.getDate());

    const diffInMilliseconds = currentCheckingDateMondayUTC - patternAnchorUTC;
    const diffInDays = Math.round(diffInMilliseconds / (1000 * 60 * 60 * 24));
    let weekOffset = Math.floor(diffInDays / 7);

    let weekIndexInCycle;
    let targetWeekPattern;
    const dayOfWeek = date.getDay();

    switch (patternDetails.patternType) {
        case 'constant_single_day':
        case 'constant':
            targetWeekPattern = patternDetails.selections.week1;
            break;
        case 'ab':
            weekIndexInCycle = (weekOffset % 2 + 2) % 2;
            targetWeekPattern = patternDetails.selections[weekIndexInCycle === 0 ? 'week1' : 'week2'];
            break;
        case 'aa_bb':
            weekIndexInCycle = (weekOffset % 4 + 4) % 4;
            targetWeekPattern = (weekIndexInCycle < 2) ? patternDetails.selections.week1 : patternDetails.selections.week3;
            break;
        case 'abba':
            weekIndexInCycle = (weekOffset % 4 + 4) % 4;
            if (weekIndexInCycle === 0 || weekIndexInCycle === 3) {
                targetWeekPattern = patternDetails.selections.week1;
            } else {
                targetWeekPattern = patternDetails.selections.week2;
            }
            break;
        case 'custom_4_week':
        default:
            weekIndexInCycle = (weekOffset % 4 + 4) % 4;
            targetWeekPattern = patternDetails.selections[`week${weekIndexInCycle + 1}`];
            break;
    }
    return targetWeekPattern && targetWeekPattern.includes(dayOfWeek);
}

function isOfficeDay(date, activeScheduleData) {
    if (date.getDay() === 0 || date.getDay() === 6) return false;
    if (isBankHoliday(date)) return false;
    if (isFestiveBreak(date, activeScheduleData)) return false;

    return isOfficeDayInternal(date, activeScheduleData);
}

function uint8ArrayToBase64(uint8Array) {
    let i,
        len = uint8Array.length,
        base64 = "";
    const b64chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";

    for (i = 0; i < len; i += 3) {
        let a = uint8Array[i];
        let b = uint8Array[i + 1];
        let c = uint8Array[i + 2];

        let b1 = a >> 2;
        let b2 = ((a & 3) << 4) | (b >> 4);
        let b3 = ((b & 15) << 2) | (c >> 6);
        let b4 = c & 63;

        if (isNaN(b)) {
            b3 = b4 = 64;
        } else if (isNaN(c)) {
            b4 = 64;
        }

        base64 += b64chars[b1] + b64chars[b2] + b64chars[b3] + b64chars[b4];
    }

    return base64;
}

function base64ToUint8Array(base64Str, atobFunc) {
    const binaryString = atobFunc(base64Str);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

function generateICalData(scheduleData) {
    const icsEvents = [];
    const today = new Date();

    for (let i = 0; i < 365; i++) {
        const currentIterDate = new Date(today);
        currentIterDate.setDate(today.getDate() + i);

        if (isOfficeDay(currentIterDate, scheduleData)) {
            const year = currentIterDate.getFullYear();
            const month = (currentIterDate.getMonth() + 1).toString().padStart(2, '0');
            const day = currentIterDate.getDate().toString().padStart(2, '0');
            const startDateString = `${year}${month}${day}`;

            const nextDay = new Date(currentIterDate);
            nextDay.setDate(currentIterDate.getDate() + 1);
            const nextYear = nextDay.getFullYear();
            const nextMonth = (nextDay.getMonth() + 1).toString().padStart(2, '0');
            const nextDayOfMonth = nextDay.getDate().toString().padStart(2, '0');
            const endDateString = `${nextYear}${nextMonth}${nextDayOfMonth}`;

            const scheduleNameCleaned = scheduleData.name ? scheduleData.name.replace(/[^a-zA-Z0-9]/g, "") : "schedule";
            const uid = `${scheduleNameCleaned}-${startDateString}@officeschedule.site`;
            const dtStamp = new Date().toISOString().replace(/[-:.]/g, "").substring(0, 15) + "Z";

            let eventString = "BEGIN:VEVENT\r\n";
            eventString += `UID:${uid}\r\n`;
            eventString += `DTSTAMP:${dtStamp}\r\n`;
            eventString += `DTSTART;VALUE=DATE:${startDateString}\r\n`;
            eventString += `DTEND;VALUE=DATE:${endDateString}\r\n`;
            eventString += "SUMMARY:In Office\r\n";
            eventString += "END:VEVENT";
            icsEvents.push(eventString);
        }
    }

    const reminderStartDate = new Date(today);
    reminderStartDate.setDate(today.getDate() + 365);
    const reminderYear = reminderStartDate.getFullYear();
    const reminderMonth = (reminderStartDate.getMonth() + 1).toString().padStart(2, '0');
    const reminderDay = reminderStartDate.getDate().toString().padStart(2, '0');
    const reminderDateString = `${reminderYear}${reminderMonth}${reminderDay}`;
    const reminderEndDateObj = new Date(reminderStartDate);
    reminderEndDateObj.setDate(reminderStartDate.getDate() + 1);
    const reminderEndYear = reminderEndDateObj.getFullYear();
    const reminderEndMonth = (reminderEndDateObj.getMonth() + 1).toString().padStart(2, '0');
    const reminderEndDayOfMonth = reminderEndDateObj.getDate().toString().padStart(2, '0');
    const reminderEndDateString = `${reminderEndYear}${reminderEndMonth}${reminderEndDayOfMonth}`;
    const scheduleNameForReminderUid = scheduleData.name ? scheduleData.name.replace(/[^a-zA-Z0-9]/g, "") : "schedule";
    const reminderUid = `${scheduleNameForReminderUid}-reminder-${reminderDateString}@officeschedule.site`;
    const reminderDtStamp = new Date().toISOString().replace(/[-:.]/g, "").substring(0, 15) + "Z";
    let reminderEventString = "BEGIN:VEVENT\r\n";
    reminderEventString += `UID:${reminderUid}\r\n`;
    reminderEventString += `DTSTAMP:${reminderDtStamp}\r\n`;
    reminderEventString += `DTSTART;VALUE=DATE:${reminderDateString}\r\n`;
    reminderEventString += `DTEND;VALUE=DATE:${reminderEndDateString}\r\n`;
    reminderEventString += "SUMMARY:Reminder: Re-add office days for next year\r\n";
    reminderEventString += "END:VEVENT";
    icsEvents.push(reminderEventString);

    const calName = scheduleData.name ? scheduleData.name.replace(/[^a-zA-Z0-9_ -]/g, '') : "Office Schedule";
    const header = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//OfficeDaysApp//EN",
        `X-WR-CALNAME:Office Schedule - ${calName}`,
        "CALSCALE:GREGORIAN"
    ].join("\r\n") + "\r\n";
    const footer = "END:VCALENDAR";
    return header + icsEvents.join("\r\n") + "\r\n" + footer;
}

function parseAndApplyShortcode(encodedShortcode, pako, atob, TextDecoder) {
    if (typeof encodedShortcode !== 'string') {
        return { error: true, stage: 'input_validation', message: 'Input shortcode is not a string.' };
    }
    encodedShortcode = encodedShortcode.replace(/\s/g, '');

    let compressedData;
    try {
        compressedData = base64ToUint8Array(encodedShortcode, atob);
    } catch (e) {
        return { error: true, stage: 'decoding', message: 'Link data is not correctly encoded.' };
    }

    let jsonString;
    try {
        const decompressedBytes = pako.inflate(compressedData);
        if (decompressedBytes === undefined || (compressedData.length > 0 && decompressedBytes.length === 0)) {
            return { error: true, stage: 'decompression_bytes', message: 'Decompression to bytes failed or yielded empty/undefined result.' };
        }
        jsonString = new TextDecoder().decode(decompressedBytes);
    } catch (e) {
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
    } catch (e) {
        return { error: true, stage: 'parsing', message: 'Link data format is invalid.' };
    }

    const fullScheduleData = convertFromCompactFormat(compactJson);

    if (!fullScheduleData) {
         return { error: true, stage: 'validation', message: 'Failed to process shared link data.'};
    }

    if (!fullScheduleData.name || typeof fullScheduleData.name !== 'string' ||
        !fullScheduleData.patternType || typeof fullScheduleData.patternType !== 'string' ||
        !fullScheduleData.selections || typeof fullScheduleData.selections !== 'object' ||
        (fullScheduleData.patternType !== 'none' && !fullScheduleData.patternAnchorDate) ||
        !fullScheduleData.summerHours || typeof fullScheduleData.summerHours !== 'object' ||
        !fullScheduleData.festiveBreak || typeof fullScheduleData.festiveBreak !== 'object') {
        return { error: true, stage: 'validation', message: 'Link data has an unexpected structure.' };
    }
    return fullScheduleData;
}


// --- Exports for Node.js testing environment ---
try {
    if (module && module.exports) {
        module.exports = {
            patternTypeToNum,
            numToPatternType,
            bankHolidays2025,
            getDayName,
            formatTime12Hour,
            formatDateWithOrdinal,
            getDefaultScheduleStructure,
            convertToCompactFormat,
            convertFromCompactFormat,
            deduceAndDisplayPattern,
            isBankHoliday,
            isFestiveBreak,
            isSummerHoursDay,
            isOfficeDayInternal,
            isOfficeDay,
            generateICalData,
            uint8ArrayToBase64,
            base64ToUint8Array,
            parseAndApplyShortcode
        };
    }
} catch (e) {
    // This will fail in the browser, which is expected.
}
