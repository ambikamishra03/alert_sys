const express = require("express");
const axios = require("axios");
const fs = require("fs");
require("dotenv").config();

const API_URL = process.env.API_URL;

// function to save employee data into text file
// LA - leave communication, AD - Entry book data

const saveDataToFile = async () => {
  try {
    const response = await axios.get(API_URL);
    const data = response.data;
    const LA = data.LA || [];
    const AD = data.AD || [];
    const holidays = data.holidays || [];

    let leaveData = {};
    let entryData = {};
    let holidayData = {};

    //  holidays
    holidays.forEach((hl) => {
      const hdid = hl.hdid;
      holidayData[hdid] = hl;
    });
    // save holiday data
    fs.writeFileSync(
      "holiday.txt",
      JSON.stringify(holidayData, null, 2),
      "utf8"
    );

    // Process leave communication data
    LA.forEach((user) => {
      const email = user.email;
      const reason = user.reason;
      if (!leaveData.hasOwnProperty(email)) {
        leaveData[email] = {};
      }
      if (!leaveData[email].hasOwnProperty(reason)) {
        leaveData[email][reason] = [];
      }
      leaveData[email][reason].push(user);
    });

    // Save leave communication data
    fs.writeFileSync(
      "leave_communication.txt",
      JSON.stringify(leaveData, null, 2),
      "utf8"
    );

    // process entry book data
    AD.forEach((user) => {
      const email = user.email;
      const date = user.date;
      if (!entryData[email]) {
        entryData[email] = {};
      }
      entryData[email][date] = user;
    });

    // save entry book data
    fs.writeFileSync(
      "entry_book.txt",
      JSON.stringify(entryData, null, 2),
      "utf8"
    );

    console.log("Data saved successfully to files.");
  } catch (error) {
    console.error("Error fetching or saving data:", error.message);
  }
};

// check for weekend 0 = sunday, 6 = saturday

const isWeekend = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  return day === 0 || day === 6;
};

function getDatesInRange(startDate, endDate) {
  const dates = [];
  let current = new Date(startDate);

  while (current <= new Date(endDate)) {
    // format as YYYY-MM-DD
    const formatted = current.toISOString().split("T")[0];
    dates.push(formatted);

    // move to next day
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

const generateAlerts = async () => {
  try {
    const response = await axios.get(API_URL);
    const data = response.data;
    const LA = data.LA || [];
    const AD = data.AD || [];
    const holidays = data.holidays || [];

    //holiday
    const HD = [];
    holidays.forEach((hl) => {
      HD.push(hl.holidaydate);
    });

    // entry book
    const statusAD = {};
    AD.forEach((user) => {
      const { email, status, date } = user;
      // present,absent,holiday, wfh , officetour or branchvisit

      if (!statusAD.hasOwnProperty(email)) {
        statusAD[email] = {};
      }
      statusAD[email][date] = status;
    });

    const statusLA = {};
    LA.forEach((user) => {
      const { email, reason, from_date, end_date } = user;
      // wfh, late , leave , early, official travel

      if (!statusLA.hasOwnProperty(email)) {
        statusLA[email] = {};
      }
      getDatesInRange(from_date, end_date).forEach((date) => {
        statusLA[email][date] = reason;
      });
    });

    fs.writeFileSync("statusAD.txt", JSON.stringify(statusAD, null, 2), "utf8");
    fs.writeFileSync("statusLA.txt", JSON.stringify(statusLA, null, 2), "utf8");
    const alertFile = {}; // save all mismatched data

    for (const email in statusAD) {
      for (const date in statusAD[email]) {
        // skip if weekend or holiday
        if (isWeekend(date) || HD.includes(date)) {
          continue;
        }

        // let status = statusAD[email][date];
        // let reason = statusLA[email][date];
        let status = "";
        if (
          statusAD.hasOwnProperty(email) &&
          statusAD[email].hasOwnProperty(date)
        )
          status = statusAD[email][date];

        let reason = "";
        if (
          statusLA.hasOwnProperty(email) &&
          statusLA[email].hasOwnProperty(date)
        )
          reason = statusLA[email][date];

        // map leave to absent and official travel tou officetour and branchvisit
        if (reason.toLowerCase() === "leave") {
          status = status === "absent" ? "leave" : status;
        } else if (reason.toLowerCase() === "official travel") {
          if (status === "officetour" || status === "branchvisit") {
            status = "official travel";
          }
        }
        if (
          status === "present" ||
          status === "holiday" ||
          (status && reason && status.toLowerCase() === reason.toLowerCase())
        ) {
          continue;
        }

        if (!alertFile.hasOwnProperty(email)) {
          alertFile[email] = {};
        }

        if (!alertFile[email].hasOwnProperty(status)) {
          alertFile[email][status] = [];
        }

        // fill alert file
        alertFile[email][status].push(date);
      }
    }
    // SEND ALERT

    // leave
    fs.writeFileSync(
      "alert_file.txt",
      JSON.stringify(alertFile, null, 2),
      "utf8"
    );
    console.log("Alert data saved");

    return alertFile;
  } catch (error) {
    console.error("Error fetching or saving data:", error.message);
  }
};

// sending alert to user
const saveMessage = async (alertFile) => {
  try {
    const logs = {};
    if (!alertFile || typeof alertFile !== "object") {
      throw new Error("alertFile is empty or not an object");
    }

    for (const email in alertFile) {
      const userAlert = alertFile[email];
      if (!userAlert) continue;
      let UserMessage = "";
      UserMessage += `<h3>Hi</h3><br>`;
      UserMessage += `<p>As per the records you have not communicated Leaves/WFH/Official Travel for below dates</p>`;
      UserMessage += `<p>`;
      let datesArray = {};
      for (const status in userAlert) {
        const date = userAlert[status] || [];
        date.forEach((item) => (datesArray[item] = 1));
      }
      datesArray = Object.keys(datesArray); // get unique keys
      if (datesArray.length === 0) continue;
      console.log(datesArray);

      datesArray.sort((a, b) => new Date(a) - new Date(b));
      const formatedDate = datesArray.map((d) => {
        const dateObj = new Date(d);
        return dateObj
          .toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
          .replace(/ /g, "-");
      });
      // append dates in span in userMessage
      formatedDate.forEach((date) => {
        UserMessage += `<span>${date}</span>, `;
      });
      UserMessage = UserMessage.replace(/, $/, "");

      UserMessage += `</p><br>`;

      UserMessage += `<p>Please 
  <a href="https://insight.futuresfirst.com/leavecommunication/index.php" target="_blank">CLICK HERE</a>
   to inform your leave/WFH/Official Travel application for the given dates.</p><br>`;

      UserMessage += `<p>Please 
  <a href="https://hertshtengroup.myadrenalin.com/samlauth" target="_blank">CLICK HERE</a>
   to apply on HRMS.</p><br>`;

      UserMessage += `<p>This is an automated alert. Please reach Pamela Chaudhuri(HR) for any discrepancy.`;
      logs[email] = UserMessage;
    }

    fs.writeFileSync("message.txt", JSON.stringify(logs, null, 2), "utf8");
    console.log("message data saved");
    return logs;
  } catch (error) {
    console.log(error.message);
  }
};

const notifyUser = async (message, email) => {
  const location = `https://prod-79.westeurope.logic.azure.com:443/workflows/e270b8c1658041bd984090fc42c9be33/triggers/manual/paths/invoke?api-version=2016-06-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=zBQrfegBzK6_uk45w5NgT_hh2xH9pGgkNVr8Uprus08`;
  const data = {
    email: email,
    message: message,
  };
  try {
    const response = await fetch(location, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      console.error("HTTP Error:", response.status, response.statusText);
      return;
    }
    const res = await response.json();
    console.log("Notification sent", res || "No response body");
    return res;
  } catch (error) {
    console.error("Failed to send notification:", error.message);
  }
};

const findMessage = (logs, email) => {
  return logs[email] || null;
};


// You wait for generateAlerts() to finish.
// saveMessage(alertFile) gets the real data.
(async () => {
  const alertFile = await generateAlerts();

  const logs = await saveMessage(alertFile);
  // await saveDataToFile();
  const email = "ambika.mishra@hertshtengroup.com";
  const message = findMessage(logs, email);

  if(message){
  await notifyUser(email,message);
  }else{
     console.log("No message found for:",email);
  }
})();
