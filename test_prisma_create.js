const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  try {
    const customer = await prisma.customer.create({
      data: {
        customerNo: "CUST9999",
        name: "Test User",
        dob: null,
        placeOfBirth: null,
        maritalStatus: "Single",
        address: "Test",
        residenceType: null,
        yearsInResidence: null,
        occupation: null,
        phone: null,
        mobile: "1234567890",
        areaId: null,
        centerId: null,
        groupId: null,
        employeeId: null,

        familyMembers: 0,
        fatherName: null,
        motherName: null,
        fatherDob: null,
        motherDob: null,

        kyc: {
          create: {
            idProof1Type: "PAN",
            idProof1No: "1234",
            idProof1Name: "Test",
            idProof1Dob: null,
            idProof1IssueDate: null,
            idProof2Type: "VOTER",
            idProof2No: "5678",
            idProof2Name: "Test",
            idProof2Dob: null,
            idProof2IssueDate: null,
          }
        }
      }
    });
    console.log("Success", customer.id);
  } catch (err) {
    console.error("PRISMA ERROR:", err);
  } finally {
    await prisma.$disconnect();
  }
}
test();
