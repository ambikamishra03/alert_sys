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

    let leaveData = {};
    let entryData = {};

    // Process leave communication data
    LA.forEach((user) => {
      const email = user.email;
      const reason = user.reason;
      if(!leaveData.hasOwnProperty(email)){
          leaveData[email] = {};
      }
      if (!leaveData[email][reason]) {
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

saveDataToFile(); // run only once to save data
