require('dotenv').config();

const express = require('express');
const cors = require('cors'); 

const { google } = require('googleapis');

const port = process.env.PORT || 4500;

const app = express();
app.use(express.json());
app.use(cors());

const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
const privateKey = process.env.GOOGLE_PRIVATE_KEY;
const googleSheetId = process.env.GOOGLE_SHEET_ID;
const googleSheetPage = process.env.GOOGLE_SHEET_PAGE_NAME;

// authenticate the service account
const googleAuth = new google.auth.JWT(
    clientEmail,
    null,
    privateKey.replace(/\\n/g, '\n'),
    'https://www.googleapis.com/auth/spreadsheets'
);

const Activity = {
  // ANTWERP: 'antwerp',
  CITY_HALL: 'city_hall',
  CEREMONY: 'ceremony',
  DINER: 'diner',
  PARTY: 'party',
};

const writeSuccessMessage = 'Aanwezigheden succesvol opgeslagen!';
const writeErrorMessage = 'Er ging iets mis bij het opslagen van de aanwezigheden!';
const readSuccessMessage = 'Sheet met succes uitgelezen!';
const readErrorMessage = 'Er ging iets mis bij het uitlezen van de sheet!';
const checkMark = '✓';
const cross = '✗';

function mapToGoogleSheetResult(valuesFromSheet) {
  // Extract the headers
  const [headers, ...rows] = valuesFromSheet;

  // Map the rows to GoogleSheetsResult-like objects
  const dataObjects = rows.map(row => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index];
    });
    return obj;
  });

  // Transform the data objects to Guest objects
  const guests = dataObjects.map(line => {
    const invitedFor = line.invitedFor ? line.invitedFor.replace(/ /g, '').split(',').map(activity => {
      switch (activity.toLowerCase()) {
        case 'city_hall': return Activity.CITY_HALL;
        case 'ceremony': return Activity.CEREMONY;
        case 'diner': return Activity.DINER;
        case 'party': return Activity.PARTY;
        default: throw new Error(`Unknown activity: ${activity}`);
      }
    }): [];
    
    const alreadyReplied = !!(
      line.CITY_HALL ||
      line.CEREMONY ||
      line.DINER ||
      line.PARTY
    )

    const attending = [];
    
    if (alreadyReplied) {
      if (invitedFor.includes(Activity.CITY_HALL)) {
        attending.push({
          city_hall: line.CITY_HALL === checkMark
        })
      }
      if (invitedFor.includes(Activity.CEREMONY)) {
        attending.push({
          ceremony: line.CEREMONY === checkMark
        })
      }
      if (invitedFor.includes(Activity.DINER)) {
        attending.push({
          diner: line.DINER === checkMark
        })
      }
      if (invitedFor.includes(Activity.PARTY)) {
        attending.push({
          party: line.PARTY === checkMark
        })
      }
    }

    return {
      id: Number(line.id),
      firstName: line.firstName,
      lastName: line.lastName,
      householdId: Number(line.householdId),
      invitedFor,
      alreadyReplied,
      attending,
    }
  });

  return guests;
}

async function readSheet() {
  try {
    // google sheet instance
    const sheetInstance = await google.sheets({ version: 'v4', auth: googleAuth});
    // read data in the range in a sheet
    const infoObjectFromSheet = await sheetInstance.spreadsheets.values.get({
        auth: googleAuth,
        spreadsheetId: googleSheetId,
        range: `${googleSheetPage}!A1:J137`
    });
    
    console.log(readSuccessMessage);
    const valuesFromSheet = infoObjectFromSheet.data.values;

    return valuesFromSheet;
  }
  catch(err) {
    console.warn(readErrorMessage, err);
  }
}

async function writeToSheet(sheetValues, attendances) {
  const guestsToUpdate = attendances.map((attendance) => attendance.guest.id)

  try {
    // google sheet instance
    const sheetInstance = await google.sheets({ version: 'v4', auth: googleAuth});

    await sheetInstance.spreadsheets.values.update({
      auth: googleAuth,
      spreadsheetId: googleSheetId,
      range: `${googleSheetPage}!A1:K137`,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: sheetValues.map((r) => 
          guestsToUpdate.includes(Number(r[0]))
            ? [
              r[0],
              r[1],
              r[2],
              r[3],
              r[4],
              r[5],
              attendances.find((att) => att.guest.id === Number(r[0])).city_hall === 'COMING' ? checkMark : cross,
              attendances.find((att) => att.guest.id === Number(r[0])).ceremony === 'COMING' ? checkMark : cross,
              attendances.find((att) => att.guest.id === Number(r[0])).diner === 'COMING' ? checkMark : cross,
              attendances.find((att) => att.guest.id === Number(r[0])).party === 'COMING' ? checkMark : cross,
              attendances.find((att) => att.guest.id === Number(r[0])).remarks,
            ]
            : r
        )
      },
    })

    return writeSuccessMessage;
  }
  catch(err) {
    console.log(writeErrorMessage, err);
    return writeErrorMessage;
  }
}

app.get('/fetch', (req, res) => {
  readSheet().then(result => {
    const guests = mapToGoogleSheetResult(result);
    res.send(guests)
  })
});

app.post('/submit', (req, res) => {
  readSheet().then(sheetValues => {
    writeToSheet(sheetValues, req.body).then(resultMessage => {
      if (resultMessage === writeErrorMessage) {
        res.status(500);
      }

      res.send({
        message: resultMessage
      });
    })
  })
})

app.listen(port, () => {
  console.log(`trouw-janna-ian-backend listening on port ${port}`)
});