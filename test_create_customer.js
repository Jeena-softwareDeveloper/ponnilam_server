const axios = require('axios');

async function test() {
  try {
    await axios.post('http://127.0.0.1:5000/api/v1/customers', {
      general: { name: "Test User", phone: "1234567890", mobile: "1234567890", areaId: "f42bd1eb-bcdd-4b36-a36c-2f963c63deaa" },
      kyc: { idProof1Type: "PAN", idProof1No: "1234", idProof1IssueDate: "2024-06-17" }
    });
    console.log("Success");
  } catch (err) {
    console.log(err.response ? err.response.data : err.message);
  }
}
test();
